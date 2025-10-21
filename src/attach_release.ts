import { createLinearAttachment } from './link_attach.js'
import { ensureReleaseLabel, addLabelToIssue } from './label_attach.js'
import { getLinearIssueFromPrUrl } from './linear_issue.js'
import { getPullRequestUrlsForRelease } from './github.js'
import { config, ReleaseMode } from './config.js'
import * as core from '@actions/core'
import { LinearIssue } from './linear.js'

const {
  versionName,
  releaseMode,
  githubRepo,
  githubOrg,
  githubToken,
  linearApiKey,
  linearApiUrl
} = config

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

  const updatedIssues = new Set() // To avoid attaching to the same issue multiple times

  prUrls.forEach(async (prUrl) => {
    const linearIssue = await updateLinearIssueWithRelease(prUrl)

    if (linearIssue) {
      updatedIssues.add(linearIssue.id)
    }
  })

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
  const doLink =
    releaseMode === ReleaseMode.Link || releaseMode === ReleaseMode.Both
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

  const doLabel =
    releaseMode === ReleaseMode.Label || releaseMode === ReleaseMode.Both
  if (doLabel) {
    try {
      await addReleaseLabelToIssue(linearIssue)
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

async function addReleaseLabelToIssue(linearIssue: LinearIssue) {
  core.info(
    `Adding release label for version ${versionName} to Linear issue (${linearIssue.identifier})`
  )

  const releaseLabel = await ensureReleaseLabel(
    versionName,
    githubRepo,
    linearApiUrl,
    linearApiKey
  )

  await addLabelToIssue(linearIssue, releaseLabel, linearApiUrl, linearApiKey)
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
