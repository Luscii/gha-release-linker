import axios from 'axios';
import { LinearIssue, LinearLabel } from './linear.util.js';
import * as core from '@actions/core'

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const LINEAR_API_KEY: string | undefined = core.getInput('LINEAR_API_KEY');

interface AttachmentIssueNode {
  id: string;
  url: string;
  issue: {
    id: string;
    identifier: string;
    title: string;
    labels?: { nodes: LinearLabel[] } | null;
  };
}

interface AttachmentsQueryResponse {
  attachments?: { nodes: AttachmentIssueNode[] };
}

/**
 * Queries Linear to find the Linear issue associated with a given Pull Request URL.
 * @param prUrl - The URL of the GitHub Pull Request.
 * @returns Minimal Linear issue object (id, identifier, title, labels) or null if not found.
 */
export async function getLinearIssueFromPrUrl(prUrl: string): Promise<LinearIssue | null> {
  const graphqlQuery = `
    query GetIssueByPullRequestUrl($prUrl: String!) {
      attachments(filter: { url: { eq: $prUrl } }) {
        nodes {
          id
          url
          issue {
            id
            identifier
            title
            labels(first: 50) { nodes { id name parent { id name } } }
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      LINEAR_API_URL,
      { query: graphqlQuery, variables: { prUrl } },
      { headers: { 'Content-Type': 'application/json', Authorization: LINEAR_API_KEY } }
    );

    const data: AttachmentsQueryResponse | undefined = (response as any)?.data?.data;
    if (data?.attachments && data.attachments.nodes.length > 0) {
      const issue = data.attachments.nodes[0].issue;
      console.log(`Found Linear issue ${issue.identifier} for PR: ${prUrl}`);
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        labels: issue.labels?.nodes || []
      };
    } else {
      console.warn(`No Linear issue found linked to PR: ${prUrl}`);
      return null;
    }
  } catch (error) {
    const e: any = error;
    console.error(`An error occurred while querying Linear for PR ${prUrl}:`, e?.message || error);
    if (e?.response) {
      console.error('Response data:', e.response.data);
      console.error('Response status:', e.response.status);
    }
    return null;
  }
}

interface IssueStateInfo {
  id: string;
  name: string;
}

interface IssueStateQueryResponse {
  issue?: {
    id: string;
    state?: IssueStateInfo | null;
    team?: { states?: { nodes: IssueStateInfo[] } } | null;
  } | null;
}


/**
 * Moves issue to Done if its current state is Ready.
 * @param issueId - Linear issue id
 * @returns true if moved or already not Ready, false on API error or preconditions.
 */
export async function moveIssueToDoneIfReady(issueId: string): Promise<boolean> {
  const query = `
      query GetIssueAndDone($issueId: String!) {
        issue(id: $issueId) {
          id
          state { id name }
          team {
            id
            states(filter: { name: { eq: "Done" } }) { nodes { id name } }
          }
        }
      }
    `;

  try {
    const resp = await axios.post(
      LINEAR_API_URL,
      { query, variables: { issueId } },
      { headers: { 'Content-Type': 'application/json', Authorization: LINEAR_API_KEY } }
    );
    const issue: IssueStateQueryResponse['issue'] = (resp as any)?.data?.data?.issue;
    if (!issue) {
      console.warn(`Could not load issue ${issueId} to evaluate state transition.`);
      return false;
    }
    const currentStateName = issue.state?.name;
    if (currentStateName !== 'Ready') {
      // Nothing to do.
      return true;
    }
    const doneState = issue.team?.states?.nodes?.[0];
    if (!doneState?.id) {
      console.warn(`Done state not found for issue ${issueId}'s team. Cannot transition.`);
      return false;
    }

    const mutation = `
          mutation MoveToDone($issueId: String!, $stateId: String!) {
            issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
          }
        `;
    const upd = await axios.post(
      LINEAR_API_URL,
      { query: mutation, variables: { issueId, stateId: doneState.id } },
      { headers: { 'Content-Type': 'application/json', Authorization: LINEAR_API_KEY } }
    );
    const ok: boolean = (upd as any)?.data?.data?.issueUpdate?.success === true;
    if (!ok) {
      console.error(`Failed to move issue ${issueId} to Done:`, upd.data);
    } else {
      console.log(`Moved issue ${issueId} from Ready to Done.`);
    }
    return ok;
  } catch (error) {
    const e: any = error;
    console.error(`Error while attempting to move issue ${issueId} to Done:`, e?.message || error);
    if (e?.response) {
      console.error('Response data:', e.response.data);
      console.error('Response status:', e.response.status);
    }
    return false;
  }
}
