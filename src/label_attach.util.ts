import axios from 'axios';
import { LinearLabel } from './linear.util.js';
import * as core from '@actions/core'

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const LINEAR_API_KEY: string | undefined = core.getInput('LINEAR_API_KEY');

export async function ensureReleaseLabel(
    versionName: string,
    repoName: string
): Promise<LinearLabel | null> {
    const cleanVersion = versionName.startsWith('v') ? versionName.slice(1) : versionName;
    const parentName = `${repoName} releases`;
    const findParentQuery = `
      query FindParent($name: String!) {
        issueLabels(filter: { name: { eq: $name } }) {
          nodes { id name }
        }
      }
    `;
    let parentId = null;
    try {
        const findParentResp = await axios.post<{
            data: {
                issueLabels: {
                    nodes: Array<{ id: string; name: string }>;
                };
            };
        }>(
            LINEAR_API_URL,
            {query: findParentQuery, variables: {name: parentName}},
            {headers: {'Content-Type': 'application/json', 'Authorization': LINEAR_API_KEY}}
        );
        const nodes = findParentResp?.data?.data?.issueLabels?.nodes || [];
        if (nodes.length > 0) {
            parentId = nodes[0].id;
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error('Failed to query parent label group in Linear:', error.message);
        } else {
            console.error('Failed to query parent label group in Linear:', error);
        }
        if (typeof error === 'object' && error !== null && 'response' in error) {
            // @ts-ignore
            console.error('Response data:', error.response?.data);
            // @ts-ignore
            console.error('Response status:', error.response?.status);
        }
    }
    if (!parentId) {
        const createParentMutation = `
          mutation CreateParent($name: String!) {
            issueLabelCreate(input: { name: $name, isGroup: true }) {
              success
              issueLabel { id name }
            }
          }
        `;
        try {
            const createParentResp = await axios.post<{
                data: {
                    issueLabelCreate: {
                        success: boolean;
                        issueLabel: { id: string; name: string };
                    };
                };
            }>(
                LINEAR_API_URL,
                {query: createParentMutation, variables: {name: parentName}},
                {headers: {'Content-Type': 'application/json', 'Authorization': LINEAR_API_KEY}}
            );
            const payload = createParentResp?.data?.data?.issueLabelCreate;
            if (payload && payload.success) {
                parentId = payload.issueLabel.id;
            } else {
                console.error('Failed to create parent label group in Linear:', createParentResp.data);
                return null;
            }
        } catch (error) {
            console.error('An error occurred while creating parent label group in Linear:', error instanceof Error ? error.message : error);
            if (typeof error === 'object' && error !== null && 'response' in error) {
                // @ts-ignore
                console.error('Response data:', error.response?.data);
                // @ts-ignore
                console.error('Response status:', error.response?.status);
            }
            return null;
        }
    }
    return await ensureLabelGroupAndChild(cleanVersion, parentId, parentName, repoName);
}

async function ensureLabelGroupAndChild(
    cleanVersion: string,
    parentId: string,
    parentName: string,
    repoName: string
): Promise<LinearLabel | null> {
    const versionWithRepo = repoName ? `${cleanVersion} (${repoName})` : cleanVersion;
    const findChildQuery = `
      query FindChild($name: String!) {
        issueLabels(filter: { name: { eq: $name } }) {
          nodes { id name parent { id name } }
        }
      }
    `;
    try {
        const findChildResp = await axios.post<{
            data: {
                issueLabels: {
                    nodes: Array<{ id: string; name: string; parent?: { id: string; name: string } }>;
                };
            };
        }>(
            LINEAR_API_URL,
            {query: findChildQuery, variables: {name: versionWithRepo}},
            {headers: {'Content-Type': 'application/json', 'Authorization': LINEAR_API_KEY}}
        );
        const nodes = findChildResp?.data?.data?.issueLabels?.nodes || [];
        const match = nodes.find(n => n?.parent?.id === parentId);
        if (match) {
            return { id: match.id, name: match.name, parent: match.parent };
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error('Failed to query existing child label in Linear:', error.message);
        } else {
            console.error('Failed to query existing child label in Linear:', error);
        }
        if (typeof error === 'object' && error !== null && 'response' in error) {
            // @ts-ignore
            console.error('Response data:', error.response?.data);
            // @ts-ignore
            console.error('Response status:', error.response?.status);
        }
    }
    const createChildMutation = `
      mutation CreateChild($name: String!, $parentId: String!) {
        issueLabelCreate(input: { name: $name, parentId: $parentId }) {
          success
          issueLabel { id name parent { id name } }
        }
      }
    `;
    try {
        const createChildResp = await axios.post<{
            data: {
                issueLabelCreate: {
                    success: boolean;
                    issueLabel: { id: string; name: string; parent?: { id: string; name: string } };
                };
            };
        }>(
            LINEAR_API_URL,
            {query: createChildMutation, variables: {name: versionWithRepo, parentId}},
            {headers: {'Content-Type': 'application/json', 'Authorization': LINEAR_API_KEY}}
        );
        const payload = createChildResp?.data?.data?.issueLabelCreate;
        if (payload && payload.success) {
            console.log(`Created Linear label '${versionWithRepo}' under group '${parentName}'`);
            return { id: payload.issueLabel.id, name: payload.issueLabel.name, parent: payload.issueLabel.parent || { id: parentId, name: parentName } };
        }
        console.error('Failed to create child Linear label:', createChildResp.data);
        return null;
    } catch (error) {
        if (error instanceof Error) {
            console.error('An error occurred while creating child Linear label:', error.message);
        } else {
            console.error('An error occurred while creating child Linear label:', error);
        }
        if (typeof error === 'object' && error !== null && 'response' in error) {
            // @ts-ignore
            console.error('Response data:', error.response?.data);
            // @ts-ignore
            console.error('Response status:', error.response?.status);
        }
        return null;
    }
}

export interface LinearIssue {
    id: string;
    labels: LinearLabel[];
}

export async function addLabelToIssue(
    linearIssue: LinearIssue,
    releaseLabel: LinearLabel
): Promise<boolean> {
    try {
        const current = linearIssue?.labels || [];
        const currentIds = current.map(l => l.id);
        const labelId = releaseLabel?.id;
        if (!labelId) {
            console.error('addLabelToIssue: releaseLabel.id is missing');
            return false;
        }
        if (currentIds.includes(labelId)) {
            return true;
        }
        // Use the provided releaseLabel's parent info to ensure exclusivity
        const targetParentId = releaseLabel?.parent?.id || null;

        let newIds;
        if (!targetParentId) {
            // If parent not provided, fallback to append-only behaviour
            newIds = [...currentIds, labelId];
        } else {
            // Remove any existing label that belongs to the same parent group
            const filtered = current
                .filter(l => (l?.parent?.id || null) !== targetParentId)
                .map(l => l.id);
            newIds = [...filtered, labelId];
        }

        const updateMutation = `
          mutation UpdateIssueLabels($issueId: String!, $labelIds: [String!]) {
            issueUpdate(id: $issueId, input: { labelIds: $labelIds }) {
              success
            }
          }
        `;
        const updateResp = await axios.post<{
            data: {
                issueUpdate: {
                    success: boolean;
                };
            };
        }>(
            LINEAR_API_URL,
            {query: updateMutation, variables: {issueId: linearIssue.id, labelIds: newIds}},
            {headers: {'Content-Type': 'application/json', 'Authorization': LINEAR_API_KEY}}
        );
        const ok = updateResp?.data?.data?.issueUpdate?.success === true;
        if (!ok) {
            console.error('Failed to update labels on the issue:', updateResp.data);
        }
        return ok;
    } catch (error) {
        if (error instanceof Error) {
            console.error(`An error occurred while adding label to issue ${linearIssue?.id}:`, error.message);
        } else {
            console.error(`An error occurred while adding label to issue ${linearIssue?.id}:`, error);
        }
        if (
            typeof error === 'object' &&
            error !== null &&
            'response' in error &&
            // @ts-ignore
            error.response
        ) {
            // @ts-ignore
            console.error('Response data:', error.response.data);
            // @ts-ignore
            console.error('Response status:', error.response.status);
        }
        return false;
    }
}
