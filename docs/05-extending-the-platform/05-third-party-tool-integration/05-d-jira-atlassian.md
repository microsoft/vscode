# Jira and Atlassian Suite Integration

This guide covers integrating your platform with Jira (and potentially other Atlassian tools like Confluence) to streamline workflows, track issues, and link platform activities with project management.

## Overview

Integrating with Jira can allow your platform to:
*   **Create Jira Issues:** Automatically or manually create Jira issues (bugs, tasks, stories) from events or items within your platform.
*   **Update Jira Issues:** Modify existing Jira issues (e.g., change status, add comments, update fields).
*   **Link Platform Items to Jira:** Create bidirectional links between platform entities (e.g., user feedback, errors, content items) and Jira issues.
*   **Display Jira Issue Information:** Show relevant Jira issue details directly within your platform's UI.
*   **Automate Workflows:** Trigger platform actions based on Jira issue updates (via webhooks).

Key Atlassian/Jira API Features:
*   **Jira Cloud REST API:** The primary way to interact with Jira Cloud instances.
*   **Jira Server/Data Center REST API:** For self-hosted Jira instances (similar but may have version differences).
*   **OAuth 2.0 (3LO - 3-legged OAuth):** For apps that act on behalf of a user.
*   **API Tokens (Basic Auth with email and API token):** Simpler authentication for server-to-server scripts or integrations where a specific user's context isn't always needed, but less secure if not handled properly. Recommended for Jira Cloud.
*   **App Tunnels (e.g., via Atlassian Connect or Forge):** For building deeper integrations that live within Jira. This guide focuses on external platform integration.
*   **Webhooks:** Jira can send webhooks to your platform when issues are created, updated, etc.

## Authentication Methods

### 1. API Tokens (Jira Cloud - Recommended for Server-to-Server)
*   Users generate an API token from their Atlassian account settings: [Manage API tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
*   **Usage:** Use Basic Authentication with the user's email address as the username and the API token as the password.
*   **Security:**
    *   Store API tokens securely (encrypted in DB, environment variables).
    *   Each token is tied to a user account and inherits that user's permissions.
    *   Ideal for backend services or scripts acting as a specific integration user.

### 2. OAuth 2.0 (3LO - 3-legged OAuth for Jira Cloud)
*   Allows your platform to act on behalf of a Jira user after they grant authorization.
*   More complex to set up but provides a better user experience for integrations that require user-specific actions or permissions.
*   **Steps:**
    1.  **Create an OAuth 2.0 (3LO) App in Atlassian Developer Console:**
        *   Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
        *   Create a new app, select "OAuth 2.0 (3LO) integration".
        *   Configure **Permissions** (scopes) your app needs (e.g., `read:jira-work`, `write:jira-work`, `read:jira-user`). See [Jira Cloud Scopes](https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3lo-apps/).
        *   Set up a **Callback URL** (redirect URI) where Jira will send the authorization code.
        *   Note the **Client ID** and **Client Secret**.
    2.  **Authorization Flow:**
        *   Redirect the user to Jira's authorization URL.
        *   User logs in and grants permissions.
        *   Jira redirects back to your callback URL with an authorization code.
        *   Your backend exchanges the code for an `access_token` and `refresh_token` with Jira's token endpoint.
        *   Store tokens securely. Use `access_token` for API calls. Refresh it using `refresh_token`.
*   See [Atlassian OAuth 2.0 (3LO) Documentation](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/).

### 3. Basic Authentication with Password (Jira Server/Data Center - Not Recommended for Cloud)
*   Uses a username and password. Less secure, especially if not over HTTPS.
*   Jira Cloud has deprecated password-based basic auth for REST APIs in favor of API tokens.

## Jira REST API Basics

*   **Endpoint Base URL:**
    *   Jira Cloud: `https://your-domain.atlassian.net/rest/api/3/` (or `/rest/api/2/` for older API versions)
    *   Jira Server/DC: `https://your-jira-instance.com/rest/api/2/`
*   **Common Endpoints:**
    *   Create Issue: `POST /rest/api/3/issue`
    *   Get Issue: `GET /rest/api/3/issue/{issueIdOrKey}`
    *   Update Issue: `PUT /rest/api/3/issue/{issueIdOrKey}`
    *   Add Comment: `POST /rest/api/3/issue/{issueIdOrKey}/comment`
    *   Search Issues (JQL): `GET /rest/api/3/search?jql=YOUR_JQL_QUERY`
    *   Get Projects: `GET /rest/api/3/project`
    *   Get Issue Create Metadata (to find project IDs, issue type IDs, field IDs): `GET /rest/api/3/issue/createmeta?projectKeys=YOUR_PROJECT_KEY&expand=projects.issuetypes.fields`
*   **Request/Response Format:** JSON.
*   **Authentication Header:**
    *   API Token (Basic Auth): `Authorization: Basic base64Encode(email:api_token)`
    *   OAuth 2.0: `Authorization: Bearer YOUR_ACCESS_TOKEN`

## Step-by-Step Integration Examples

[**Provide backend code snippets (e.g., Node.js/Python) for common Jira interactions.**]

### Platform Configuration:
Your platform needs a settings area for users/admins to:
1.  Enter their Jira instance URL (e.g., `https://your-company.atlassian.net`).
2.  Provide authentication credentials:
    *   **API Token Method:** Email and API Token.
    *   **OAuth 2.0 Method:** A button to "Connect to Jira" which initiates the OAuth flow. The platform then stores the tokens.
3.  Configure default project keys, issue types for automatic issue creation, or custom field mappings.

### Example: Creating a Jira Issue (Node.js using API Token)

```javascript
// backend/services/jiraService.js
const axios = require('axios');

// These would be configured by the user/admin in your platform
// and stored securely, associated with the user or a global setting.
// const JIRA_BASE_URL = process.env.JIRA_BASE_URL; // e.g., 'https://your-domain.atlassian.net'
// const JIRA_EMAIL = process.env.JIRA_EMAIL;
// const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

async function createJiraIssue(jiraConfig, issueData) {
  // jiraConfig: { baseUrl, email, apiToken }
  // issueData: { projectKey, summary, description, issueTypeName, ...other fields }

  if (!jiraConfig || !jiraConfig.baseUrl || !jiraConfig.email || !jiraConfig.apiToken) {
    console.error('Jira configuration is missing.');
    throw new Error('Jira not configured.');
  }

  const { projectKey, summary, description, issueTypeName } = issueData;

  // 1. Get Create Metadata to find IDs (cache this data if possible)
  // This step is crucial because Jira often requires IDs for project and issue type, not names.
  let projectId, issueTypeId;
  try {
    const metaResponse = await axios.get(
      `${jiraConfig.baseUrl}/rest/api/3/issue/createmeta`,
      {
        params: { projectKeys: projectKey, expand: 'projects.issuetypes.fields' },
        headers: {
          'Authorization': `Basic ${Buffer.from(`${jiraConfig.email}:${jiraConfig.apiToken}`).toString('base64')}`,
          'Accept': 'application/json',
        },
      }
    );

    const projectMeta = metaResponse.data.projects.find(p => p.key === projectKey);
    if (!projectMeta) throw new Error(`Project with key ${projectKey} not found or accessible.`);
    projectId = projectMeta.id;

    const issueTypeMeta = projectMeta.issuetypes.find(it => it.name === issueTypeName);
    if (!issueTypeMeta) throw new Error(`Issue type "${issueTypeName}" not found in project ${projectKey}.`);
    issueTypeId = issueTypeMeta.id;

  } catch (error) {
    console.error('Error fetching Jira createmeta:', error.response ? error.response.data : error.message);
    throw new Error(`Failed to get metadata for Jira project ${projectKey}: ${error.message}`);
  }

  // 2. Construct the issue payload
  const payload = {
    fields: {
      project: {
        id: projectId, // Use ID
      },
      summary: summary,
      description: { // Jira uses Atlassian Document Format for rich text
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: description,
              },
            ],
          },
        ],
      },
      issuetype: {
        id: issueTypeId, // Use ID
      },
      // ... add other custom fields as needed, using their field ID from createmeta
      // 'customfield_10010': 'Some value',
    },
  };

  // 3. Make the API call to create the issue
  try {
    const response = await axios.post(
      `${jiraConfig.baseUrl}/rest/api/3/issue`,
      payload,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${jiraConfig.email}:${jiraConfig.apiToken}`).toString('base64')}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      }
    );
    console.log('Jira issue created:', response.data.key);
    return response.data; // Contains issue ID, key, self URL
  } catch (error) {
    console.error('Error creating Jira issue:', error.response ? error.response.data : error.message);
    const errorDetails = error.response && error.response.data && error.response.data.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;
    throw new Error(`Failed to create Jira issue: ${errorDetails}`);
  }
}

// Example Usage in your platform's code:
// async function handleNewPlatformBug(bugReport) {
//   const jiraSettings = await getJiraSettingsForUser(bugReport.userId); // Fetch stored Jira config
//   if (jiraSettings) {
//     try {
//       const createdIssue = await createJiraIssue(jiraSettings, {
//         projectKey: 'SUPPORT', // Or from user config
//         summary: `Bug: ${bugReport.title}`,
//         description: `Reported by: ${bugReport.reporter}\n\nDetails:\n${bugReport.details}`,
//         issueTypeName: 'Bug', // Or from user config
//       });
//       // Link createdIssue.key or createdIssue.self (URL) to your platform's bugReport item
//       await linkPlatformItemToJira(bugReport.id, createdIssue.key, createdIssue.self);
//     } catch (error) {
//       console.error("Could not create Jira issue for bug report:", error);
//       // Notify user or log for admin attention
//     }
//   }
// }
```

### Example: Searching Jira Issues with JQL

```javascript
async function searchJiraIssues(jiraConfig, jqlQuery) {
  if (!jiraConfig || !jiraConfig.baseUrl || !jiraConfig.email || !jiraConfig.apiToken) {
    // Handle missing config or use OAuth client
    throw new Error('Jira not configured.');
  }

  try {
    const response = await axios.get(
      `${jiraConfig.baseUrl}/rest/api/3/search`,
      {
        params: { jql: jqlQuery, fields: 'summary,status,assignee' }, // Customize fields
        headers: {
          'Authorization': `Basic ${Buffer.from(`${jiraConfig.email}:${jiraConfig.apiToken}`).toString('base64')}`,
          'Accept': 'application/json',
        },
      }
    );
    return response.data.issues; // Array of issues
  } catch (error) {
    console.error('Error searching Jira issues:', error.response ? error.response.data : error.message);
    throw new Error(`Failed to search Jira issues: ${error.message}`);
  }
}

// Usage:
// const issues = await searchJiraIssues(jiraSettings, 'project = "MYPROJ" AND status = "In Progress" ORDER BY created DESC');
// issues.forEach(issue => console.log(`${issue.key}: ${issue.fields.summary}`));
```

## Handling Jira Webhooks

Jira can send webhooks to a URL on your platform when events occur (e.g., issue created, updated, comment added).

1.  **Create a Webhook in Jira:**
    *   Go to Jira Settings > System > Webhooks (requires Jira Admin permissions).
    *   Click "Create a Webhook".
    *   **Name:** Descriptive name.
    *   **URL:** The HTTPS endpoint on your platform that will receive webhook POST requests.
    *   **Events:** Select the Jira events you want to subscribe to (e.g., "Issue: created", "Issue: updated", "Comment: created").
    *   Optionally, filter by JQL.
2.  **Implement Webhook Handler in Your Platform:**
    *   Create an HTTP POST endpoint at the URL you provided to Jira.
    *   **Security:**
        *   **Secret Token (Recommended for Jira Server/DC, less straightforward in Cloud):** Jira Server/DC allows adding a secret to webhooks, which it includes in a header. Verify this. Jira Cloud doesn't have a simple built-in secret for webhooks directly in the UI for basic webhooks (though Forge/Connect apps handle this differently). You might rely on network-level security (e.g., IP allow-listing if Jira Cloud IPs are predictable, or a hard-to-guess URL).
        *   Alternatively, the webhook payload itself contains information that you can cross-reference with expected data or make a callback to Jira to verify authenticity if needed (adds complexity).
    *   Parse the JSON payload from Jira. The structure depends on the event.
    *   Process the event (e.g., update a linked item in your platform, send a notification).
    *   Respond quickly to Jira with a `200 OK` status to acknowledge receipt. Process lengthy tasks asynchronously.

**Example Webhook Handler (Conceptual Node.js/Express):**
```javascript
// backend/routes/jiraWebhookHandler.js
// const express = require('express');
// const router = express.Router();

// router.post('/jira-event', (req, res) => {
//   const eventData = req.body;
//   const jiraEvent = eventData.webhookEvent; // e.g., 'jira:issue_created', 'jira:issue_updated'
//   const issueKey = eventData.issue ? eventData.issue.key : null;

//   console.log(`Received Jira webhook: ${jiraEvent} for issue ${issueKey || 'N/A'}`);
//   // console.log('Payload:', JSON.stringify(eventData, null, 2));

//   // TODO: Add security verification if possible (e.g., shared secret, IP check)

//   // Process the event asynchronously to avoid timing out Jira
//   processJiraEventAsync(eventData).catch(err => {
//     console.error("Error processing Jira event:", err);
//     // Log error but still respond 200 OK if the request was valid
//   });

//   res.status(200).send('Webhook received');
// });

// async function processJiraEventAsync(eventData) {
//   const jiraEvent = eventData.webhookEvent;
//   const issue = eventData.issue;

//   if (jiraEvent === 'jira:issue_created' && issue) {
//     // Potentially find related items in your platform and link them
//     // Or if your platform *didn't* create it, maybe create a corresponding item
//     console.log(`Jira Issue Created: ${issue.key} - ${issue.fields.summary}`);
//   } else if (jiraEvent === 'jira:issue_updated' && issue) {
//     // Update status of linked item in your platform
//     console.log(`Jira Issue Updated: ${issue.key}`);
//     // Look at eventData.changelog for what changed
//     if (eventData.changelog && eventData.changelog.items) {
//       eventData.changelog.items.forEach(change => {
//         console.log(`  Field '${change.field}' changed from '${change.fromString}' to '${change.toString}'`);
//         // if (change.field === 'status') { updatePlatformLinkedItemStatus(issue.key, change.toString); }
//       });
//     }
//   } else if (eventData.comment && jiraEvent === 'comment_created') {
//     // Add comment to linked item in your platform or notify users
//     console.log(`New comment on Jira issue ${eventData.comment.self.split('/issue/')[1].split('/comment/')[0]}`);
//   }
//   // ... handle other events
// }

// module.exports = router;
```

## Best Practices

*   **Use `createmeta` for IDs:** When creating or updating issues, Jira often requires internal IDs for projects, issue types, custom fields, statuses, resolutions, etc., not just their names. Fetch these using the `/issue/createmeta` (for creating) or `/editmeta` (for editing) endpoints for a given project/issue type and cache them.
*   **Atlassian Document Format:** For descriptions and comments, Jira uses Atlassian Document Format (ADF), a JSON-based structure for rich text. Simple text might work for descriptions, but for formatting, you'll need to construct ADF.
*   **Error Handling:** Jira API errors can be verbose. Parse them to provide useful feedback.
*   **Permissions:** Ensure the user/API token used for integration has the necessary permissions in Jira for the actions being performed.
*   **Rate Limiting:** Be aware of Jira API rate limits. Implement backoff strategies.
*   **Idempotency:** For operations like creating issues, ensure that if a request is retried (e.g., due to network issues), it doesn't create duplicate issues.
*   **User Mapping:** If linking Jira users to platform users, have a clear mapping strategy.

## Other Atlassian Tools (e.g., Confluence)

*   **Confluence Cloud REST API:** Similar principles apply. You can use it to create/update pages, add comments, search content, etc.
*   Authentication (API Tokens, OAuth 2.0 3LO) works similarly.
*   Refer to the [Confluence Cloud REST API documentation](https://developer.atlassian.com/cloud/confluence/rest/v1/intro/).

By integrating with Jira and other Atlassian tools, you can create a more connected and efficient environment for your users, bridging the gap between your platform and their project management workflows. Always consult the latest Atlassian developer documentation.
