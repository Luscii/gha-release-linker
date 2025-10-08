import {Octokit} from '@octokit/rest';
import * as core from '@actions/core'

const GITHUB_TOKEN: string | undefined = core.getInput('GITHUB_TOKEN');
const GITHUB_ORG: string | undefined = core.getInput('GITHUB_ORG');
const GITHUB_REPO: string | undefined = core.getInput('GITHUB_REPO');

// Initialize Octokit for GitHub API interactions specific to this util
const octokit = new Octokit({auth: GITHUB_TOKEN});

/**
 * Fetches Pull Request URLs associated with a given GitHub release using Octokit.
 * This function assumes PRs are linked in the release body (description) either
 * as full URLs or as #PR_NUMBER (e.g., #123).
 * @param versionName - The name of the release version (e.g., "v4.9.2").
 * @returns An array of GitHub Pull Request URLs.
 */
export async function getPullRequestUrlsForRelease(versionName: string): Promise<string[]> {
    if (!GITHUB_ORG || !GITHUB_REPO) {
        console.warn('GitHub org/repo environment variables are not set; returning empty PR list.');
        return [];
    }

    console.log(`Attempting to fetch PRs for release version: ${versionName} from GitHub...`);

    try {
        const response = await octokit.repos.getReleaseByTag({
            owner: GITHUB_ORG,
            repo: GITHUB_REPO,
            tag: versionName,
        });

        const releaseBody: string | null | undefined = response.data.body;
        if (!releaseBody) {
            console.log(`Release ${versionName} has no description body to parse for PRs.`);
            return [];
        }

        const prUrls: string[] = [];
        const fullUrlRegex = new RegExp(`https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/pull/(\\d+)`, 'g');
        let match: RegExpExecArray | null;
        while ((match = fullUrlRegex.exec(releaseBody)) !== null) {
            prUrls.push(match[0]);
        }

        const prNumberRegex = /(?:^|\W)#(\d+)(?!\w)/g;
        while ((match = prNumberRegex.exec(releaseBody)) !== null) {
            const prNumber = match[1];
            prUrls.push(`https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/pull/${prNumber}`);
        }

        if (prUrls.length > 0) {
            console.log(`Found ${prUrls.length} potential PRs in release ${versionName} description.`);
        } else {
            console.log(`No PR URLs found in release ${versionName} description.`);
        }

        return [...new Set(prUrls)];
    } catch (error: any) {
        console.error(`Error fetching release ${versionName} from GitHub:`, error?.message || error);
        if (error?.status === 404) {
            console.error(`Release tag '${versionName}' not found in ${GITHUB_ORG}/${GITHUB_REPO}.`);
        } else if (error?.request) {
            console.error('GitHub API request failed:', error.request);
        }
        return [];
    }
}
