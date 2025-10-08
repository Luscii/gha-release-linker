/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios'
import * as core from '@actions/core'

const LINEAR_API_URL = 'https://api.linear.app/graphql'
const LINEAR_API_KEY: string | undefined = core.getInput('LINEAR_API_KEY')

/**
 * Creates an attachment on a Linear issue.
 * @param issueId - The ID of the Linear issue (e.g., "LIN-123").
 * @param url - The URL of the attachment (e.g., GitHub release URL).
 * @param versionName - The release version name.
 * @returns true if successful, false otherwise
 */
export async function createLinearAttachment(
  issueId: string,
  url: string,
  versionName: string
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
  try {
    const response = await axios.post(
      LINEAR_API_URL,
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
          Authorization: LINEAR_API_KEY
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

    const { data } = response as { data: AttachmentCreateResponse }
    if (data.attachmentCreate && data.attachmentCreate.success) {
      console.log(`Successfully attached "${versionName}" to Linear issue`)
      return true
    } else {
      console.error(
        `Failed to attach "${versionName}" to Linear issue:`,
        (response.data as { errors?: any }).errors
      )
      return false
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        `An error occurred while creating attachment for issue:`,
        error.message
      )
    } else {
      console.error(
        `An error occurred while creating attachment for issue:`,
        error
      )
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof (error as any).response === 'object'
    ) {
      console.error('Response data:', (error as any).response.data)
      console.error('Response status:', (error as any).response.status)
    }
    return false
  }
}
