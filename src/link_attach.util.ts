/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios'
import * as core from '@actions/core'

/**
 * Creates an attachment on a Linear issue.
 *
 * @param issueId - The ID of the Linear issue (e.g., "LIN-123").
 * @param url - The URL to attach to the Linear issue (e.g., GitHub release URL).
 * @param versionName - The release version name (e.g., "1.2.3").
 * @param linearApiUrl - The Linear API endpoint URL.
 * @param linearApiKey - The Linear API key for authentication.
 * @returns A promise that resolves to `true` if the attachment was created successfully, or `false` otherwise.
 */
export async function createLinearAttachment(
  issueId: string,
  url: string,
  versionName: string,
  linearApiUrl: string,
  linearApiKey: string
): Promise<boolean> {
  const graphqlMutation = `
      mutation AttachmentCreate($issueId: String!, $url: String!, $title: String!, $subtitle: String!, $versionName: String!) {
        attachmentCreate(
          input: {
            issueId: $issueId
            url: $url
            title: $title
            subtitle: $subtitle
            iconUrl: "https://cdn-icons-png.flaticon.com/512/870/870107.png"
            metadata: { releaseTag: $versionName }
          }
        ) {
          success
          attachment { id title }
        }
      }
    `

  const response = await axios.post(
    linearApiUrl,
    {
      query: graphqlMutation,
      variables: {
        issueId,
        url,
        title: `v${versionName}`,
        subtitle: `Released in version ${versionName}`,
        versionName
      }
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: linearApiKey
      }
    }
  )

  interface AttachmentCreateResponse {
    attachmentCreate: {
      success: boolean
      attachment: {
        id: string
        title: string
      }
    }
  }

  const { data } = response.data as { data: AttachmentCreateResponse }
  if (data.attachmentCreate && data.attachmentCreate.success) {
    core.info(`Successfully attached "${versionName}" to Linear issue`)
    return true
  } else {
    core.info(
      `Failed to attach "${versionName}" to Linear issue:` +
        (response.data as { errors?: any }).errors
    )
    return false
  }
}
