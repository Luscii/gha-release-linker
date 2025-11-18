/* eslint-disable @typescript-eslint/no-explicit-any */
import { Octokit } from '@octokit/rest'
import * as core from '@actions/core'

/**
 * Fetches Pull Request URLs associated with a given GitHub release tag.
 *
 * Strategy:
 * 1. Attempt to locate the previous release with the same target commitish.
 *    If found, compute the bounded diff (previous tag -> current tag) and
 *    gather PRs only from commits unique to the new release.
 * 2. If no previous release is found, fall back to traversing the entire
 *    commit ancestry from the tag's commit using GraphQL pagination.
 *
 */
export async function getPullRequestUrlsForRelease(
  versionName: string,
  githubToken: string,
  githubOrg: string,
  githubRepo: string
): Promise<string[]> {
  core.info(
    `Fetching PRs between previous and current release tags using compareCommits for '${versionName}'...`
  )

  const octokit = new Octokit({ auth: githubToken })

  // Resolve current release
  const currentRelease = await octokit.repos.getReleaseByTag({
    owner: githubOrg,
    repo: githubRepo,
    tag: versionName
  })

  const targetCommitish = currentRelease.data.target_commitish
  const createdAt = currentRelease.data.created_at

  // Find previous release sharing the same target_commitish
  const releases = await octokit.repos.listReleases({
    owner: githubOrg,
    repo: githubRepo,
    per_page: 100
  })
  const previous = releases.data
    .filter(
      (r) =>
        r.created_at < createdAt &&
        r.tag_name !== versionName &&
        r.target_commitish === targetCommitish
    )
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0]
  const previousReleaseTag = previous?.tag_name

  if (!previousReleaseTag) {
    core.info(
      'No previous release found; falling back to full commit history traversal from tag commit.'
    )
    const fullHistoryPrs = await fetchFullHistoryPRs(
      octokit,
      githubOrg,
      githubRepo,
      versionName
    )
    core.info(
      `Full history traversal complete; discovered ${fullHistoryPrs.size} unique PR URL(s).`
    )
    return Array.from(fullHistoryPrs.values())
  }

  core.info(
    `Previous release detected: ${previousReleaseTag}. Computing diff ${previousReleaseTag} -> ${versionName}.`
  )

  // Compare commits between previous and current tag
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

  const prUrls = new Set<string>()
  // GraphQL per commit to fetch associated pull requests
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
    const sha = (c as any).sha
    const resp: any = await octokit.graphql(commitQuery, {
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

async function fetchFullHistoryPRs(
  client: Octokit,
  owner: string,
  repo: string,
  tag: string
): Promise<Set<string>> {
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

  while (true) {
    page += 1
    const resp: any = await client.graphql(historyQuery, {
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

  return prSet
}
