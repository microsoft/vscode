# Jira and Atlassian Suite Integration

This guide covers integrating the Autonomous Coding Agent platform (Node.js backend, React frontend) with Jira Cloud to streamline workflows, track issues generated or worked on by the AI, and link platform activities with project management.

## Overview

Integrating with Jira Cloud can allow the Autonomous Coding Agent platform to:
*   **Create Jira Issues:** Automatically create Jira issues (bugs, tasks, stories) when the AI agent identifies a potential bug, suggests a new feature, or completes a sub-task of a larger coding effort.
*   **Update Jira Issues:** Add comments to existing Jira issues with AI progress, logs, or links to generated code. Potentially transition issue statuses.
*   **Link Platform Items to Jira:** Create bidirectional links between AI workflow runs or generated code snippets in the platform and their corresponding Jira issues.
*   **Display Jira Issue Information:** Show relevant Jira issue details (status, assignee) within the platform's UI for context.
*   **Automate Workflows:** Trigger platform actions (e.g., start a new AI coding task) based on Jira issue updates received via webhooks.

Key Atlassian/Jira API Features for Jira Cloud:
*   **Jira Cloud REST API:** The primary interface for interaction (typically `/rest/api/3/` or `/rest/api/2/`).
*   **Authentication:**
    *   **API Tokens (Basic Auth with email & token):** Recommended for server-to-server (Node.js backend to Jira) integrations where the platform acts as a specific integration user or on behalf of a configured user.
    *   **OAuth 2.0 (3LO - 3-legged OAuth):** For scenarios where the platform needs to act on behalf of an end-user who connects their Jira account. The Node.js backend handles the OAuth flow.
*   **Webhooks:** Jira can send notifications to your Node.js backend when issues are created, updated, etc.

## Authentication Methods for Jira Cloud

### 1. API Tokens (Recommended for Backend-to-Jira)
*   A Jira Cloud user generates an API token from their Atlassian account settings: [Manage API tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
*   **Usage (Node.js Backend):** Use Basic Authentication. The "username" is the user's email address, and the "password" is the API token.
    ```javascript
    // const email = process.env.JIRA_EMAIL;
    // const apiToken = process.env.JIRA_API_TOKEN;
    // const authToken = Buffer.from(`${email}:${apiToken}`).toString('base64');
    // const headers = {
    //   'Authorization': `Basic ${authToken}`,
    //   'Accept': 'application/json',
    //   'Content-Type': 'application/json'
    // };
    ```
*   **Security:** Store the email and API token securely in your Node.js backend's environment variables (e.g., `JIRA_EMAIL`, `JIRA_API_TOKEN`). These credentials grant access equivalent to the Jira user who created the token.

### 2. OAuth 2.0 (3LO - for User-Delegated Access)
*   Allows your platform to act on behalf of a specific Jira user after they authorize the connection.
*   **Setup:**
    1.  Create an OAuth 2.0 (3LO) App in the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
    2.  Configure **Permissions** (scopes) like `read:jira-work`, `write:jira-work`, `read:jira-user`.
    3.  Set a **Callback URL** (redirect URI) to an endpoint on your Node.js backend (e.g., `https://your-api.com/api/auth/jira/callback`).
    4.  Securely store the **Client ID** and **Client Secret** in your backend's environment variables.
*   **Flow:** Your Node.js backend handles the standard OAuth 2.0 Authorization Code Grant flow (redirect to Jira, user authorizes, Jira calls back with code, backend exchanges code for access/refresh tokens, tokens stored encrypted in PostgreSQL). The React frontend initiates this flow.

## Jira REST API Interaction from Node.js Backend

*   **Base URL:** `https://YOUR_DOMAIN.atlassian.net/rest/api/3/` (or `/rest/api/2/`)
*   Use a library like `axios` in your Node.js services to make requests.

### Platform Configuration (React Frontend & Node.js Backend):
*   **React UI:** A settings section where users can:
    *   Enter their Jira instance URL (e.g., `your-company.atlassian.net`).
    *   Provide credentials (Email + API Token for the simpler setup, or initiate OAuth 2.0 flow).
    *   Configure default project keys, issue types for AI-generated issues, and field mappings.
*   **Node.js Backend:** Securely stores these configurations (API tokens/OAuth refresh tokens encrypted) in PostgreSQL, associated with the user or a global platform setting.

### Example: Creating a Jira Issue (Node.js using API Token)
```javascript
// server/src/services/jiraIntegrationService.js
const axios = require('axios');

// jiraUserConfig: { instanceUrl, email, apiToken } (retrieved from DB/env for the user/platform)
// issueDetails: { projectKey, summary, description, issueTypeName /* e.g., "Bug" or "Task" */, ...customFields }
async function createJiraIssue(jiraUserConfig, issueDetails) {
  const { instanceUrl, email, apiToken } = jiraUserConfig;
  if (!instanceUrl || !email || !apiToken) {
    throw new Error('Jira API token configuration is missing for this user/action.');
  }

  const authToken = Buffer.from(`${email}:${apiToken}`).toString('base64');
  const JIRA_API_BASE = `${instanceUrl.startsWith('http') ? '' : 'https://'}${instanceUrl}`;

  // Step 1: Get project and issue type IDs using createmeta (essential!)
  // It's highly recommended to cache this metadata.
  let projectId, issueTypeId;
  try {
    const metaUrl = `${JIRA_API_BASE}/rest/api/3/issue/createmeta?projectKeys=${issueDetails.projectKey}&expand=projects.issuetypes.fields`;
    const metaResponse = await axios.get(metaUrl, {
      headers: { 'Authorization': `Basic ${authToken}`, 'Accept': 'application/json' },
    });
    const projectMeta = metaResponse.data.projects.find(p => p.key === issueDetails.projectKey);
    if (!projectMeta) throw new Error(`Project ${issueDetails.projectKey} not found or accessible.`);
    projectId = projectMeta.id;

    const issueTypeMeta = projectMeta.issuetypes.find(it => it.name.toLowerCase() === issueDetails.issueTypeName.toLowerCase());
    if (!issueTypeMeta) throw new Error(`Issue type "${issueDetails.issueTypeName}" not found in project ${issueDetails.projectKey}.`);
    issueTypeId = issueTypeMeta.id;
  } catch (error) {
    console.error('Error fetching Jira createmeta:', error.response?.data || error.message);
    throw new Error(`Failed to get metadata for Jira project ${issueDetails.projectKey}.`);
  }

  // Step 2: Construct issue payload using Atlassian Document Format (ADF) for description
  const issuePayload = {
    fields: {
      project: { id: projectId },
      summary: issueDetails.summary,
      description: {
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: issueDetails.description || '' }] }],
      },
      issuetype: { id: issueTypeId },
      // ... map other issueDetails to Jira custom field IDs (e.g., 'customfield_10010': value)
      // Custom field IDs can also be found in the createmeta response.
    },
  };

  // Step 3: Create the issue
  try {
    const createUrl = `${JIRA_API_BASE}/rest/api/3/issue`;
    const response = await axios.post(createUrl, issuePayload, {
      headers: {
        'Authorization': `Basic ${authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    console.log(`Jira issue created: ${response.data.key} (${response.data.self})`);
    return response.data; // { id, key, self }
  } catch (error) {
    const errorMsg = error.response?.data?.errors || error.response?.data?.errorMessages?.join(', ') || error.message;
    console.error('Error creating Jira issue:', errorMsg);
    throw new Error(`Failed to create Jira issue: ${errorMsg}`);
  }
}

// Example Usage in an AI Agent workflow step:
// if (aiIdentifiedBug) {
//   const userJiraConfig = await getUserJiraConfig(currentUserId); // Fetch from DB
//   if (userJiraConfig) {
//     const createdIssue = await createJiraIssue(userJiraConfig, {
//       projectKey: "AGENT", // User's default project for agent tasks
//       summary: `AI Agent identified bug: ${aiIdentifiedBug.title}`,
//       description: `Details:\n${aiIdentifiedBug.details}\n\nFound during AI task: ${currentTask.id}`,
//       issueTypeName: "Bug"
//     });
//     // Store createdIssue.key or createdIssue.self in your platform, linking to the AI task.
//   }
// }
module.exports = { createJiraIssue /*, ... other Jira interaction functions */ };
```

### Example: Searching Jira Issues with JQL
```javascript
// async function searchJiraIssues(jiraUserConfig, jqlQuery, fields = ['summary', 'status', 'assignee']) {
//   const { instanceUrl, email, apiToken } = jiraUserConfig;
//   // ... (auth and URL setup as above) ...
//   const searchUrl = `${JIRA_API_BASE}/rest/api/3/search`;
//   try {
//     const response = await axios.get(searchUrl, {
//       params: { jql: jqlQuery, fields: fields.join(',') },
//       headers: { 'Authorization': `Basic ${authToken}`, 'Accept': 'application/json' },
//     });
//     return response.data.issues;
//   } catch (error) { /* ... error handling ... */ }
// }
```

## Handling Jira Webhooks (Node.js Backend)

Jira can notify your platform about issue events (creations, updates, comments).
1.  **Create Webhook in Jira:** Jira Settings > System > Webhooks.
    *   **URL:** Your Node.js backend's HTTPS endpoint (e.g., `https://your-api.com/api/webhooks/jira`).
    *   **Events:** Select relevant events (e.g., "Issue: created", "Issue: updated", "Comment: created").
2.  **Implement Webhook Handler (Node.js/Express):**
    ```javascript
    // server/src/routes/webhookRoutes.js (Conceptual)
    // app.post('/webhooks/jira', express.json(), async (req, res) => {
    //   const eventData = req.body;
    //   const jiraEvent = eventData.webhookEvent;
    //   console.log(`Received Jira webhook: ${jiraEvent} for issue ${eventData.issue?.key}`);
    //
    //   // SECURITY: Verify the request is from Jira if possible (e.g., shared secret if Jira Server,
    //   // or by checking source IP if using Jira Cloud and IPs are known/stable - less reliable).
    //   // Jira Cloud doesn't offer simple shared secrets for basic webhooks easily.
    //
    //   // Process asynchronously to respond quickly to Jira
    //   processJiraEventAsync(eventData).catch(err => console.error("Error processing Jira event:", err));
    //   res.status(200).send('Webhook received.');
    // });
    //
    // async function processJiraEventAsync(eventData) {
    //   // Example: If an issue linked to an AI task is updated, notify platform or update task status
    //   if (eventData.webhookEvent === 'jira:issue_updated' && eventData.issue) {
    //     const issueKey = eventData.issue.key;
    //     // const linkedPlatformTask = await findTaskByJiraKey(issueKey);
    //     // if (linkedPlatformTask) {
    //     //   const changes = eventData.changelog.items.map(item => `${item.field} from '${item.fromString}' to '${item.toString()}'`).join(', ');
    //     //   // await platformNotificationService.notifyUser(linkedPlatformTask.userId, `Jira issue ${issueKey} updated: ${changes}`);
    //     // }
    //   }
    // }
    ```

## Best Practices
*   **Use `createmeta` for IDs:** Jira's REST API often requires internal numeric IDs for projects, issue types, custom fields, statuses, etc., not just their names. Fetch these using the `/rest/api/3/issue/createmeta` endpoint for a given project and issue type, and cache this metadata in your backend to avoid repeated calls.
*   **Atlassian Document Format (ADF):** For rich text fields like descriptions and comments, Jira uses ADF (a JSON structure). For simple text, sending it directly might work, but for formatting (bold, lists, etc.), construct valid ADF.
*   **Error Handling:** Jira API errors provide detailed messages. Parse and log them in your Node.js backend.
*   **Permissions:** Ensure the Jira user account (whose API token is used) or the OAuth 2.0 app has the necessary project permissions in Jira.
*   **Rate Limiting:** Be mindful of Jira API rate limits. Implement retry logic with exponential backoff in your Node.js services.

By integrating with Jira, the Autonomous Coding Agent can seamlessly fit into developers' existing project management workflows, creating and updating tasks as it works. Always refer to the latest [Jira Cloud REST API documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/).
