import * as core from '@actions/core'
import * as github from '@actions/github'

export enum ReleaseMode {
  Label = 'label',
  Link = 'link',
  Both = 'both'
}

export interface AppConfig {
  linearApiUrl: string
  linearApiKey: string
  githubToken: string
  githubOrg: string
  githubRepo: string
  versionName: string
  releaseMode: ReleaseMode
}

const repo: RepoInfo = getOwnerAndRepoFromContext()

export const config: AppConfig = {
  linearApiUrl: 'https://api.linear.app/graphql',
  linearApiKey: core.getInput('linear-api-key'),
  githubToken: core.getInput('github-token'),
  githubOrg: repo.owner,
  githubRepo: repo.repo,
  versionName: core.getInput('version-name'),
  releaseMode: core.getInput('release-mode') as ReleaseMode
}

export interface RepoInfo {
  owner: string
  repo: string
}

/**
 * Retrieves the owner and repository name from the GitHub Actions context.
 *
 * @returns {RepoInfo} An object containing the `owner` and `repo` strings.
 * @throws {Error} If the repository information is not available in the context.
 */
export function getOwnerAndRepoFromContext(): RepoInfo {
  const { owner, repo } = github.context.repo || {}

  if (!owner || !repo) {
    throw new Error('Unable to determine repository information.')
  }

  return { owner, repo }
}
