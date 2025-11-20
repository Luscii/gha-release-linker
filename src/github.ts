import { Octokit } from '@octokit/rest'
import * as core from '@actions/core'

export async function getPullRequestUrlsForRelease(
  versionName: string,
  githubToken: string,
  githubOrg: string,
  githubRepo: string
): Promise<string[]> {
  core.info(
    `Fetching PRs between previous and current release tags using compareCommits for '${versionName}'...`
  )

  const octokit: Octokit = new Octokit({ auth: githubToken })

  const currentRelease = await octokit.repos.getReleaseByTag({
    owner: githubOrg,
    repo: githubRepo,
    tag: versionName
  })

  const createdAt = currentRelease.data.created_at

  const previousReleaseTag = await getPreviousReleaseTag(
    octokit,
    githubOrg,
    githubRepo,
    createdAt,
    versionName
  )

  if (!previousReleaseTag) {
    core.info(
      'No previous release found; falling back to full commit history traversal from tag commit.'
    )

    return await fetchFullHistoryPRs(
      octokit,
      githubOrg,
      githubRepo,
      versionName
    )
  }

  core.info(
    `Previous release detected: ${previousReleaseTag}. Computing diff ${previousReleaseTag} -> ${versionName}.`
  )

  const commits = await compareCommitsBetweenReleases(
    octokit,
    githubOrg,
    githubRepo,
    previousReleaseTag,
    versionName
  )

  return await extractPrUrlsFromCommits(commits, octokit, githubOrg, githubRepo)
}

async function extractPrUrlsFromCommits(
  commits: { sha: string }[],
  octokit: Octokit,
  githubOrg: string,
  githubRepo: string
) {
  const prUrls = new Set<string>()
  const commitQuery = `query CommitAssociatedPRs($owner: String!, $repo: String!, $oid: GitObjectID!) {
    repository(owner: $owner, name: $repo) {
      object(oid: $oid) {
        ... on Commit {
          associatedPullRequests(first: 20) {
            nodes {
              url
            }
          }
        }
      }
    }
  }`

  for (const c of commits) {
    const sha = c.sha
    const resp = await octokit.graphql<{
      repository?: {
        object?: {
          associatedPullRequests?: {
            nodes?: { url?: string }[]
          }
        }
      }
    }>(commitQuery, {
      owner: githubOrg,
      repo: githubRepo,
      oid: sha
    })
    const prs = resp?.repository?.object?.associatedPullRequests?.nodes || []
    for (const pr of prs) {
      if (pr?.url) prUrls.add(pr.url)
    }
  }

  core.info(`Discovered ${prUrls.size} unique PR URL(s) in bounded diff.`)
  return Array.from(prUrls.values())
}

async function compareCommitsBetweenReleases(
  octokit: Octokit,
  githubOrg: string,
  githubRepo: string,
  previousReleaseTag: string,
  versionName: string
) {
  const compare = await octokit.repos.compareCommits({
    owner: githubOrg,
    repo: githubRepo,
    base: previousReleaseTag,
    head: versionName
  })

  const commits = compare.data.commits || []
  core.info(
    `Found ${commits.length} commit(s) unique to ${versionName} over ${previousReleaseTag}. Fetching associated PRs...`
  )

  return commits.map((c) => ({ sha: c.sha }))
}

async function getPreviousReleaseTag(
  octokit: Octokit,
  githubOrg: string,
  githubRepo: string,
  createdAt: string,
  versionName: string
) {
  const releases = await octokit.repos.listReleases({
    owner: githubOrg,
    repo: githubRepo,
    per_page: 100
  })
  const previous = releases.data
    .filter((r) => r.created_at < createdAt && r.tag_name !== versionName)
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0]
  const previousReleaseTag = previous?.tag_name
  return previousReleaseTag
}

async function fetchFullHistoryPRs(
  client: Octokit,
  owner: string,
  repo: string,
  tag: string
) {
  const historyQuery = `
    query ReleaseCommitsAndPRUrls(
      $owner: String!
      $repo: String!
      $tag: String!
      $commitsFirst: Int!
      $commitsCursor: String
    ) {
      repository(owner: $owner, name: $repo) {
        release(tagName: $tag) {
          tagCommit {
            ... on Commit {
              history(first: $commitsFirst, after: $commitsCursor) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  associatedPullRequests(first: 20) {
                    nodes { url }
                  }
                }
              }
            }
          }
        }
      }
    }
  `

  let cursor: string | undefined
  const prSet = new Set<string>()
  let page = 0
  const pageSize = 100

  interface HistoryQueryResponse {
    repository?: {
      release?: {
        tagCommit?: {
          history?: {
            pageInfo?: {
              hasNextPage?: boolean
              endCursor?: string
            }
            nodes?: {
              associatedPullRequests?: {
                nodes?: { url?: string }[]
              }
            }[]
          }
        }
      }
    }
  }

  while (true) {
    page += 1

    const resp = await client.graphql<HistoryQueryResponse>(historyQuery, {
      owner,
      repo,
      tag,
      commitsFirst: pageSize,
      commitsCursor: cursor
    })

    const history = resp?.repository?.release?.tagCommit?.history
    if (!history) {
      break
    }

    for (const commit of history.nodes || []) {
      const prs = commit?.associatedPullRequests?.nodes || []
      for (const pr of prs) {
        if (pr?.url) prSet.add(pr.url)
      }
    }

    core.info(
      `Full history page ${page} processed; accumulated ${prSet.size} unique PR URL(s).`
    )

    if (!history.pageInfo?.hasNextPage) {
      break
    }
    cursor = history.pageInfo.endCursor
  }

  core.info(
    `Full history traversal complete; discovered ${prSet.size} unique PR URL(s).`
  )

  return Array.from(prSet.values())
}
