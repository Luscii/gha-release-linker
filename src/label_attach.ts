import axios from 'axios'
import { LinearLabel, LinearIssue } from './linear.js'
import * as core from '@actions/core'

/**
 * Ensures that a release label exists in Linear for a given repository and version.
 *
 * This function checks if a parent label group (named `${repoName} releases`) exists in Linear.
 * If not, it creates the parent label group. Then, it ensures that a child label for the specific
 * release version exists under the parent group, creating it if necessary.
 *
 * @param versionName - The release version name (e.g., "1.2.3").
 * @param repoName - The name of the repository.
 * @param linearApiUrl - The Linear API endpoint URL.
 * @param linearApiKey - The Linear API key for authentication.
 * @returns The created or found LinearLabel object.
 *
 * @throws If the parent label group or child label cannot be created in Linear.
 */
export async function ensureReleaseLabel(
  versionName: string,
  repoName: string,
  linearApiUrl: string,
  linearApiKey: string
): Promise<LinearLabel> {
  const parentName = `${repoName} releases`

  let parentId = await fetchParentIdByName(
    parentName,
    linearApiUrl,
    linearApiKey
  )

  if (!parentId) {
    parentId = await createParentLabelGroup(
      parentName,
      linearApiUrl,
      linearApiKey
    )
  }

  return await ensureLabelGroupAndChild(
    versionName,
    parentId,
    parentName,
    repoName,
    linearApiUrl,
    linearApiKey
  )
}

async function createParentLabelGroup(
  parentName: string,
  linearApiUrl: string,
  linearApiKey: string
) {
  core.info(`Creating parent label group '${parentName}' in Linear...`)

  const createParentMutation = `
          mutation CreateParent($name: String!) {
            issueLabelCreate(input: { name: $name, isGroup: true }) {
              success
              issueLabel { id name }
            }
          }
        `

  const createParentResp = await axios.post<{
    data: {
      issueLabelCreate: {
        success: boolean
        issueLabel: { id: string; name: string }
      }
    }
  }>(
    linearApiUrl,
    { query: createParentMutation, variables: { name: parentName } },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: linearApiKey
      }
    }
  )
  const payload = createParentResp?.data?.data?.issueLabelCreate
  if (payload && payload.success) {
    core.info(
      `Created parent label group '${parentName}' with ID ${payload.issueLabel.id}`
    )
    return payload.issueLabel.id
  } else {
    throw new Error(
      'Failed to create parent label group in Linear:' + createParentResp.data
    )
  }
}

async function fetchParentIdByName(
  parentName: string,
  linearApiUrl: string,
  linearApiKey: string
) {
  core.info(`Looking for parent label group '${parentName}' in Linear...`)

  const findParentQuery = `
      query FindParent($name: String!) {
        issueLabels(filter: { name: { eq: $name } }) {
          nodes { id name }
        }
      }
    `
  let parentId = null
  const findParentResp = await axios.post<{
    data: {
      issueLabels: {
        nodes: Array<{ id: string; name: string }>
      }
    }
  }>(
    linearApiUrl,
    { query: findParentQuery, variables: { name: parentName } },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: linearApiKey
      }
    }
  )
  const nodes = findParentResp?.data?.data?.issueLabels?.nodes || []
  if (nodes.length > 0) {
    parentId = nodes[0].id
    core.info(
      `Found existing parent label group '${parentName}' with ID ${parentId}`
    )
  } else {
    core.info(`Parent label group '${parentName}' not found in Linear.`)
  }

  return parentId
}

/**
 * Ensures that a child label with the specified version and repository exists under the given parent label group in Linear.
 * If the child label does not exist, it creates it using the Linear API.
 *
 * @param cleanVersion - The cleaned version string to use for the label name.
 * @param parentId - The ID of the parent label group.
 * @param parentName - The name of the parent label group.
 * @param repoName - The name of the repository (optional, appended to the label name).
 * @param linearApiUrl - The Linear API endpoint URL.
 * @param linearApiKey - The Linear API key for authentication.
 * @returns The created or found Linear label object.
 * @throws If the child label cannot be created.
 */
async function ensureLabelGroupAndChild(
  cleanVersion: string,
  parentId: string,
  parentName: string,
  repoName: string,
  linearApiUrl: string,
  linearApiKey: string
): Promise<LinearLabel> {
  const versionWithRepo = `${cleanVersion} (${repoName})`

  const label = await fetchChildLabel(
    versionWithRepo,
    parentId,
    linearApiUrl,
    linearApiKey
  )

  if (label) {
    return label
  }

  return createChildLabel(
    versionWithRepo,
    parentId,
    parentName,
    linearApiUrl,
    linearApiKey
  )
}

async function createChildLabel(
  labelName: string,
  parentId: string,
  parentName: string,
  linearApiUrl: string,
  linearApiKey: string
) {
  core.info(
    `Creating child label '${labelName}' under parent ID ${parentId} in Linear...`
  )

  const createChildMutation = `
      mutation CreateChild($name: String!, $parentId: String!) {
        issueLabelCreate(input: { name: $name, parentId: $parentId }) {
          success
          issueLabel { id name parent { id name } }
        }
      }
    `

  const createChildResp = await axios.post<{
    data: {
      issueLabelCreate: {
        success: boolean
        issueLabel: {
          id: string
          name: string
          parent?: { id: string; name: string }
        }
      }
    }
  }>(
    linearApiUrl,
    {
      query: createChildMutation,
      variables: { name: labelName, parentId }
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: linearApiKey
      }
    }
  )
  const payload = createChildResp?.data?.data?.issueLabelCreate
  if (!payload || !payload.success) {
    throw new Error(
      'Failed to create child Linear label:' + String(createChildResp.data)
    )
  }

  core.info(`Created Linear label '${labelName}' under group '${parentName}'`)
  return {
    id: payload.issueLabel.id,
    name: payload.issueLabel.name,
    parent: payload.issueLabel.parent || { id: parentId, name: parentName }
  }
}

async function fetchChildLabel(
  labelName: string,
  parentId: string,
  linearApiUrl: string,
  linearApiKey: string
): Promise<LinearLabel | null> {
  core.info(
    `Looking for child label '${labelName}' under parent ID ${parentId} in Linear...`
  )

  const findChildQuery = `
      query FindChild($name: String!) {
        issueLabels(filter: { name: { eq: $name } }) {
          nodes { id name parent { id name } }
        }
      }
    `

  const findChildResp = await axios.post<{
    data: {
      issueLabels: {
        nodes: Array<{
          id: string
          name: string
          parent?: { id: string; name: string }
        }>
      }
    }
  }>(
    linearApiUrl,
    { query: findChildQuery, variables: { name: labelName } },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: linearApiKey
      }
    }
  )
  const nodes = findChildResp?.data?.data?.issueLabels?.nodes || []
  const match = nodes.find((n) => n?.parent?.id === parentId)
  if (match) {
    core.info(`Found existing label '${labelName}' with ID ${match.id}`)
    return { id: match.id, name: match.name, parent: match.parent }
  }

  core.info(
    `Label '${labelName}' not found under parent ID ${parentId} in Linear.`
  )
  return null
}

/**
 * Adds a label to a Linear issue, ensuring exclusivity within the label's parent group.
 * If the label already exists on the issue, no update is performed.
 * If the label has a parent, any existing label from the same parent group is replaced.
 *
 * @param linearIssue - The Linear issue to update.
 * @param releaseLabel - The label to attach to the issue.
 * @param linearApiUrl - The Linear API endpoint URL.
 * @param linearApiKey - The Linear API authentication key.
 */
export async function addLabelToIssue(
  linearIssue: LinearIssue,
  releaseLabel: LinearLabel,
  linearApiUrl: string,
  linearApiKey: string
) {
  const current = linearIssue?.labels || []
  const currentIds = current.map((l) => l.id)
  const labelId = releaseLabel.id
  if (currentIds.includes(labelId)) {
    return true
  }
  // Use the provided releaseLabel's parent info to ensure exclusivity
  const targetParentId = releaseLabel?.parent?.id || null

  let newIds
  if (!targetParentId) {
    // If parent not provided, fallback to append-only behaviour
    newIds = [...currentIds, labelId]
  } else {
    // Remove any existing label that belongs to the same parent group
    const filtered = current
      .filter((l) => (l?.parent?.id || null) !== targetParentId)
      .map((l) => l.id)
    newIds = [...filtered, labelId]
  }

  const updateMutation = `
        mutation UpdateIssueLabels($issueId: String!, $labelIds: [String!]) {
          issueUpdate(id: $issueId, input: { labelIds: $labelIds }) {
            success
          }
        }
      `
  const updateResp = await axios.post<{
    data: {
      issueUpdate: {
        success: boolean
      }
    }
  }>(
    linearApiUrl,
    {
      query: updateMutation,
      variables: { issueId: linearIssue.id, labelIds: newIds }
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: linearApiKey
      }
    }
  )
  const ok = updateResp?.data?.data?.issueUpdate?.success === true
  if (ok) {
    core.info(
      `Label ${releaseLabel.name} successfully added to issue ${linearIssue.identifier}`
    )
  } else {
    core.info('Failed to update labels on the issue:' + updateResp.data)
  }

  return ok
}
