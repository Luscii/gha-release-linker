/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios'
import { LinearIssue, LinearLabel } from './linear.js'
import * as core from '@actions/core'

interface AttachmentIssueNode {
  id: string
  url: string
  issue: {
    id: string
    identifier: string
    title: string
    labels?: { nodes: LinearLabel[] } | null
  }
}

interface AttachmentsQueryResponse {
  attachments?: { nodes: AttachmentIssueNode[] }
}

/**
 * Queries Linear to find the Linear issue associated with a given Pull Request URL.
 *
 * @param prUrl - The URL of the GitHub Pull Request to search for in Linear attachments.
 * @param linearApiUrl - The Linear API endpoint URL to send the GraphQL request to.
 * @param linearApiKey - The Linear API key used for authentication in the request header.
 * @returns A promise that resolves to a minimal Linear issue object (id, identifier, title, labels) if found, or `null` if no issue is linked to the given PR URL.
 */
export async function getLinearIssueFromPrUrl(
  prUrl: string,
  linearApiUrl: string,
  linearApiKey: string
): Promise<LinearIssue | null> {
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
  `

  const response = await axios.post(
    linearApiUrl,
    { query: graphqlQuery, variables: { prUrl } },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: linearApiKey
      }
    }
  )

  const data: AttachmentsQueryResponse | undefined = (response as any)?.data
    ?.data
  if (data?.attachments && data.attachments.nodes.length > 0) {
    const issue = data.attachments.nodes[0].issue
    core.info(`Found Linear issue ${issue.identifier} for PR: ${prUrl}`)
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      labels: issue.labels?.nodes || []
    }
  } else {
    core.info(`No Linear issue found linked to PR: ${prUrl}`)
    return null
  }
}
