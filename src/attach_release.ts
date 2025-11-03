import { createLinearAttachment } from './link_attach.js'
import { ensureReleaseLabel, addLabelToIssue } from './label_attach.js'
import { getLinearIssueFromPrUrl } from './linear_issue.js'
import { getPullRequestUrlsForRelease } from './github.js'
import { config, ReleaseMode } from './config.js'
import * as core from '@actions/core'
import { LinearIssue, LinearLabel } from './linear.js'

const {
  versionName,
  releaseMode,
  githubRepo,
  githubOrg,
  githubToken,
  linearApiKey,
  linearApiUrl
} = config

const doLink =
  releaseMode === ReleaseMode.Link || releaseMode === ReleaseMode.Both
const doLabel =
  releaseMode === ReleaseMode.Label || releaseMode === ReleaseMode.Both

let releaseLabel: LinearLabel

/**
 * Main function to coordinate finding issues and attaching release links.
 */
export async function processRelease(): Promise<void> {
  const prUrls = await getPullRequestUrlsForRelease(
    versionName,
    githubToken,
    githubOrg,
    githubRepo
  )

  if (prUrls.length === 0) {
    core.info(
      `No PRs found for release ${versionName} or could not fetch them. No Linear issues to update.`
    )
    return
  }

  if (doLabel) {
    releaseLabel = await ensureReleaseLabel(
      versionName,
      githubRepo,
      linearApiUrl,
      linearApiKey
    )
  }

  const updatedIssues = new Set()
  await Promise.all(
    prUrls.map(async (prUrl) => {
      const linearIssue = await updateLinearIssueWithRelease(prUrl)
      if (linearIssue) {
        updatedIssues.add(linearIssue.id)
      }
    })
  )

  if (updatedIssues.size > 0) {
    core.info(
      `Successfully updated ${updatedIssues.size} Linear issue(s) for release ${versionName}.`
    )
  } else {
    core.info(`No Linear issues were updated for release ${versionName}.`)
  }
}

async function updateLinearIssueWithRelease(prUrl: string) {
  const linearIssue = await getLinearIssueFromPrUrl(
    prUrl,
    linearApiUrl,
    linearApiKey
  )
  if (!linearIssue) {
    core.info(`No Linear issue linked to PR: ${prUrl}. Skipping.`)
    return
  }

  let anySuccess = false
  if (doLink) {
    try {
      await attachReleaseLinkToIssue(linearIssue, prUrl)
      anySuccess = true
    } catch (error) {
      // Process won't be interrupted to let other issues to be updated
      core.info(
        `Failed to create attachment for issue ${linearIssue.identifier}.`
      )

      core.info(String(error))
    }
  } else {
    core.info('Skipping link attachment (mode does not include link).')
  }

  if (doLabel) {
    try {
      core.info(
        `Adding release label for version ${versionName} to Linear issue (${linearIssue.identifier})`
      )

      await addLabelToIssue(
        linearIssue,
        releaseLabel,
        linearApiUrl,
        linearApiKey
      )
      anySuccess = true
    } catch (error) {
      // Process won't be interrupted to let other issues to be updated
      core.info(String(error))
    }
  } else {
    core.info('Skipping label update (mode does not include label).')
  }

  if (anySuccess) {
    return linearIssue
  }
}

async function attachReleaseLinkToIssue(
  linearIssue: LinearIssue,
  prUrl: string
) {
  core.info(
    `Attaching release link ${versionName} to Linear issue (${linearIssue.identifier}) linked from PR: ${prUrl}`
  )

  const releaseTagUrl = `https://github.com/${githubOrg}/${githubRepo}/releases/tag/${versionName}`

  await createLinearAttachment(
    linearIssue.id,
    releaseTagUrl,
    versionName,
    linearApiUrl,
    linearApiKey
  )
}
