import { createLinearAttachment } from './link_attach.util.js';
import { ensureReleaseLabel, addLabelToIssue } from './label_attach.util.js';
import { getLinearIssueFromPrUrl, moveIssueToDoneIfReady } from './linear_issue.util.js';
import { getPullRequestUrlsForRelease } from './github.util.js';
import * as core from '@actions/core'

export enum ReleaseMode {
  Label = 'label',
  Link = 'link',
  Both = 'both'
}

    const LINEAR_API_KEY: string | undefined = core.getInput('LINEAR_API_KEY');
    const GITHUB_TOKEN: string | undefined = core.getInput('GITHUB_TOKEN');
    const GITHUB_ORG: string | undefined = core.getInput('GITHUB_ORG');
    const GITHUB_REPO: string | undefined = core.getInput('GITHUB_REPO');
    const ENABLED_LINEAR_PREFIXES: string | undefined = core.getInput('ENABLED_LINEAR_PREFIXES');

/**
 * Main function to coordinate finding issues and attaching release links.
 */
export async function processRelease(): Promise<void> {
    const versionName: string = core.getInput('VERSION_NAME');
    const mode: ReleaseMode = core.getInput('MODE') as ReleaseMode;
    const moveToDone: boolean = core.getBooleanInput('MOVE_TO_DONE');

    if (!LINEAR_API_KEY) {
        throw new Error('Error: LINEAR_API_KEY environment variable is not set. Please configure it in your CI/CD pipeline secrets.');
    }
    if (!GITHUB_TOKEN) {
        throw new Error('Error: GITHUB_TOKEN environment variable is not set. Please configure it in your CI/CD pipeline secrets.');
    }
    if (!GITHUB_ORG) {
        throw new Error('Error: GITHUB_ORG environment variable is not set. Please configure it in your environment or .env file.');
    }
    if (!GITHUB_REPO) {
        throw new Error('Error: GITHUB_REPO environment variable is not set. Please configure it in your environment or .env file.');
    }

    const prUrls = await getPullRequestUrlsForRelease(versionName);

    if (prUrls.length === 0) {
        setResult(`No PRs found for release ${versionName} or could not fetch them. No Linear issues to update.`);
        return;
    }

    const doLink = mode === ReleaseMode.Link || mode === ReleaseMode.Both;
    const doLabel = mode === ReleaseMode.Label || mode === ReleaseMode.Both;
    // Ensure the version label exists under the parent group and return label info
    const releaseLabel = doLabel ? await ensureReleaseLabel(versionName, GITHUB_REPO) : null;

    const releaseTagUrl = `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/releases/tag/${versionName}`;

    const updatedIssues = new Set(); // To avoid attaching to the same issue multiple times

    for (const prUrl of prUrls) {
        const linearIssue = await getLinearIssueFromPrUrl(prUrl);
        if (linearIssue && !updatedIssues.has(linearIssue.id)) {
            if (!isIdentifierEnabled(linearIssue.identifier)) {
                console.log(`Skipping PR, disabled project prefix in: ${linearIssue?.identifier}`);
                continue;
            }
            let anySuccess = false;
            if (doLink) {
                console.log(`Attaching release link ${versionName} to Linear issue (${linearIssue.identifier}) linked from PR: ${prUrl}`);
                const linkSuccess = await createLinearAttachment(linearIssue.id, releaseTagUrl, versionName);
                if (!linkSuccess) {
                    console.warn(`Failed to create attachment for issue ${linearIssue.identifier}.`);
                }
                anySuccess = anySuccess || linkSuccess;
            } else {
                console.log('Skipping link attachment (mode does not include link).');
            }

            if (doLabel) {
                if (releaseLabel?.id) {
                    const labeled = await addLabelToIssue(linearIssue, releaseLabel);
                    if (!labeled) {
                        console.warn(`Failed to apply label to issue ${linearIssue.identifier}.`);
                    } else {
                        anySuccess = true;
                    }
                } else {
                    console.warn('Failed to ensure/create the release label.');
                }
            } else {
                console.log('Skipping label update (mode does not include label).');
            }

            if (anySuccess) {
                updatedIssues.add(linearIssue.id);
                if (moveToDone) {
                    await moveIssueToDoneIfReady(linearIssue.id);
                }
            }
        }
    }

    if (updatedIssues.size > 0) {
        setResult(`Successfully updated ${updatedIssues.size} Linear issue(s) for release ${versionName}.`);
    } else {
        setResult(`No Linear issues were updated for release ${versionName}.`);
    }
}

const enabledPrefixes: string[] = (ENABLED_LINEAR_PREFIXES || '')
  .split(/[\s,]+/)
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => s.toUpperCase().endsWith('-') ? s.toUpperCase() : (s.toUpperCase() + '-'));

export const isIdentifierEnabled = (identifier?: string): boolean => {
  if (!identifier) {
    return false;
  }
  if (enabledPrefixes.length === 0) {
    // if not configured, allow all
    return true;
  }
  const upper = identifier.toUpperCase();
  return enabledPrefixes.some(pref => upper.startsWith(pref));
};

function setResult(message: string): void
{
  core.setOutput('result', message)
}
