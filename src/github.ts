/* eslint-disable @typescript-eslint/no-explicit-any */
import { Octokit } from '@octokit/rest'
import * as core from '@actions/core'

/**
 * Fetches Pull Request URLs associated with a given GitHub release using Octokit.
 * This function assumes PRs are linked in the release body (description) either
 * as full URLs or as #PR_NUMBER (e.g., #123).
 * @param versionName - The name of the release version (e.g., "v4.9.2").
 * @param githubToken - GitHub token for authentication.
 * @param githubOrg - The GitHub organization name.
 * @param githubRepo - The GitHub repository name.
 * @returns An array of GitHub Pull Request URLs.
 */
export async function getPullRequestUrlsForRelease(
  versionName: string,
  githubToken: string,
  githubOrg: string,
  githubRepo: string
): Promise<string[]> {
  core.info(
    `Attempting to fetch PRs for release version: ${versionName} from GitHub...`
  )

  // Initialize Octokit for GitHub API interactions specific to this util
  const octokit = new Octokit({ auth: githubToken })

  try {
    const response = await octokit.repos.getReleaseByTag({
      owner: githubOrg,
      repo: githubRepo,
      tag: versionName
    })

    let releaseBody: string | null | undefined = response.data.body

    if (!releaseBody) {
      releaseBody = await generateNotes()
    }

    const prUrls: string[] = []
    extractPRUrlsFromBody(releaseBody, prUrls)

    // In case the body of the release exists but doesn't contain valid PR links
    // it will generate the notes for that release and get them from there
    if (prUrls.length <= 0) {
      releaseBody = await generateNotes()
      extractPRUrlsFromBody(releaseBody, prUrls)
    }

    if (prUrls.length > 0) {
      core.info(
        `Found ${prUrls.length} potential PRs in release ${versionName} description.`
      )
    } else {
      core.info(`No PR URLs found in release ${versionName} description.`)
    }

    return [...new Set(prUrls)]
  } catch (error: any) {
    core.info(
      `Error fetching release ${versionName} from GitHub: ` + error?.message ||
        error
    )
    if (error?.status === 404) {
      core.info(
        `Release tag '${versionName}' not found in ${githubOrg}/${githubRepo}.`
      )
    } else if (error?.request) {
      core.info('GitHub API request failed:' + error.request)
    }
    return []
  }

  function extractPRUrlsFromBody(releaseBody: string, prUrls: string[]) {
    // E.g. https://github.com/owner/repo/pull/123
    const fullUrlRegex = new RegExp(
      `https://github.com/${githubOrg}/${githubRepo}/pull/(\\d+)`,
      'g'
    )
    let match: RegExpExecArray | null
    while ((match = fullUrlRegex.exec(releaseBody)) !== null) {
      prUrls.push(match[0])
    }

    // E.g. (#123)
    const prNumberRegex = /(?:^|\W)#(\d+)(?!\w)/g
    while ((match = prNumberRegex.exec(releaseBody)) !== null) {
      const prNumber = match[1]
      prUrls.push(
        `https://github.com/${githubOrg}/${githubRepo}/pull/${prNumber}`
      )
    }

    // E.g. (Owner/Repo#123)
    const prNumberWithRepoRegex = new RegExp(
      `\\(?${githubOrg}/${githubRepo}#(\\d+)\\)?`,
      'g'
    )
    while ((match = prNumberWithRepoRegex.exec(releaseBody)) !== null) {
      const prNumber = match[1]
      prUrls.push(
        `https://github.com/${githubOrg}/${githubRepo}/pull/${prNumber}`
      )
    }
  }

  async function generateNotes() {
    const response = await octokit.repos.generateReleaseNotes({
      owner: githubOrg,
      repo: githubRepo,
      tag_name: versionName
    })

    return response.data.body
  }
}
