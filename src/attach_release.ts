import { createLinearAttachment } from './link_attach.util.js'
import { ensureReleaseLabel, addLabelToIssue } from './label_attach.util.js'
import { getLinearIssueFromPrUrl } from './linear_issue.util.js'
import { getPullRequestUrlsForRelease } from './github.util.js'
import { config, ReleaseMode } from './config.js'
import * as core from '@actions/core'

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

  const doLink =
    releaseMode === ReleaseMode.Link || releaseMode === ReleaseMode.Both
  const doLabel =
    releaseMode === ReleaseMode.Label || releaseMode === ReleaseMode.Both
  // Ensure the version label exists under the parent group and return label info
  const releaseLabel = doLabel
    ? await ensureReleaseLabel(
        versionName,
        githubRepo,
        linearApiUrl,
        linearApiKey
      )
    : null

  const releaseTagUrl = `https://github.com/${githubOrg}/${githubRepo}/releases/tag/${versionName}`

  const updatedIssues = new Set() // To avoid attaching to the same issue multiple times

  for (const prUrl of prUrls) {
    const linearIssue = await getLinearIssueFromPrUrl(
      prUrl,
      linearApiUrl,
      linearApiKey
    )
    if (linearIssue && !updatedIssues.has(linearIssue.id)) {
      let anySuccess = false
      if (doLink) {
        core.info(
          `Attaching release link ${versionName} to Linear issue (${linearIssue.identifier}) linked from PR: ${prUrl}`
        )
        const linkSuccess = await createLinearAttachment(
          linearIssue.id,
          releaseTagUrl,
          versionName,
          linearApiUrl,
          linearApiKey
        )
        if (!linkSuccess) {
          core.info(
            `Failed to create attachment for issue ${linearIssue.identifier}.`
          )
        }
        anySuccess = anySuccess || linkSuccess
      } else {
        core.info('Skipping link attachment (mode does not include link).')
      }

      if (doLabel) {
        if (releaseLabel?.id) {
          const labeled = await addLabelToIssue(
            linearIssue,
            releaseLabel,
            linearApiUrl,
            linearApiKey
          )
          if (!labeled) {
            core.info(
              `Failed to apply label to issue ${linearIssue.identifier}.`
            )
          } else {
            anySuccess = true
          }
        } else {
          core.info('Failed to ensure/create the release label.')
        }
      } else {
        core.info('Skipping label update (mode does not include label).')
      }

      if (anySuccess) {
        updatedIssues.add(linearIssue.id)
      }
    }
  }

  if (updatedIssues.size > 0) {
    core.info(
      `Successfully updated ${updatedIssues.size} Linear issue(s) for release ${versionName}.`
    )
  } else {
    core.info(`No Linear issues were updated for release ${versionName}.`)
  }
}
