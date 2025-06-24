# Google Services Integration (Gmail, Calendar, Drive)

This guide details how to integrate Google services like Gmail, Google Calendar, and Google Drive into the Autonomous Coding Agent platform, using its Node.js backend and React frontend. This integration primarily involves OAuth 2.0 for user authorization.

## Overview

Integrating Google services can allow the Autonomous Coding Agent platform to:
*   **Gmail API:**
    *   Send notifications about coding task status or AI agent activities.
    *   Potentially read email content if a user grants permission for tasks like "summarize my recent project-related emails."
*   **Google Calendar API:**
    *   Schedule reminders or blocks of time for autonomous coding tasks.
    *   Sync deadlines from the platform to a user's Google Calendar.
*   **Google Drive API:**
    *   Access code files, project documents, or datasets stored in a user's Google Drive as input for coding tasks.
    *   Save AI-generated code or reports back to a user's Google Drive.

## Prerequisites

1.  **Google Cloud Platform (GCP) Project:**
    *   Create or use an existing project in the [Google Cloud Console](https://console.cloud.google.com/).
    *   Enable the Gmail API, Google Calendar API, and Google Drive API for your project under "APIs & Services" > "Library".
2.  **OAuth 2.0 Credentials:**
    *   In your GCP project, navigate to "APIs & Services" > "Credentials".
    *   Click "Create Credentials" > "OAuth client ID".
    *   Select "Web application" as the application type.
    *   **Authorized JavaScript origins:** Add your React frontend's URL(s) (e.g., `http://localhost:3000` for local dev, `https://your-platform-domain.com`).
    *   **Authorized redirect URIs:** Add your Node.js backend's callback URL(s) (e.g., `http://localhost:8080/api/auth/google/callback` for local dev, `https://your-api-domain.com/api/auth/google/callback`). This is where Google will send the authorization code.
    *   Save the credentials. Note down the **Client ID** and **Client Secret**. The Client Secret must be stored securely in your Node.js backend's environment variables (e.g., `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
3.  **OAuth Consent Screen:**
    *   Configure this under "APIs & Services" > "OAuth consent screen".
    *   Provide application name, user support email, developer contact.
    *   **Define Scopes:** Crucially, add the specific scopes your platform needs. Start with the least privilege.
        *   **Gmail API Scopes (Examples for Agent):**
            *   `https://www.googleapis.com/auth/gmail.send`: To send notification emails.
            *   `https://www.googleapis.com/auth/gmail.readonly`: (If allowing email reading tasks) Read emails.
        *   **Google Calendar API Scopes (Examples for Agent):**
            *   `https://www.googleapis.com/auth/calendar.events`: To create/manage events for task scheduling.
        *   **Google Drive API Scopes (Examples for Agent):**
            *   `https://www.googleapis.com/auth/drive.file`: Per-file access to specific files selected by the user or created by the app. This is generally preferred over full drive access.
            *   `https://www.googleapis.com/auth/drive.readonly`: If needing to read many files.
    *   Add test users during development. For production use with external users, especially with sensitive/restricted scopes, your app will need to undergo Google's OAuth app verification process.

4.  **Google API Client Library (Node.js):**
    *   In your Node.js backend (`/server` directory), install the official Google APIs library:
      ```bash
      npm install googleapis
      ```

## Authentication: OAuth 2.0 Flow (Server-Side Web Apps)

The platform's Node.js backend will handle the OAuth 2.0 Authorization Code Grant flow.

1.  **User Initiates Connection (React Frontend):**
    *   A user clicks a "Connect to Google" button in the React UI.
    *   This action makes a request to a dedicated endpoint on your Node.js backend (e.g., `/api/auth/google/connect`).
2.  **Redirect to Google's OAuth 2.0 Server (Node.js Backend):**
    *   The backend endpoint constructs Google's authorization URL using the `googleapis` library.
    *   Parameters include `client_id`, `redirect_uri`, `response_type=code`, requested `scope`s (e.g., `gmail.send calendar.events drive.file`), and `access_type=offline` (to get a refresh token).
    *   The backend redirects the user's browser to this Google URL.
3.  **User Grants Permission (Google's UI):**
    *   The user logs into their Google account (if not already logged in) and reviews the permissions requested by your platform.
    *   If the user approves, Google redirects them back to the `redirect_uri` specified, now handled by your Node.js backend, with an `authorization_code` in the query parameters.
4.  **Exchange Authorization Code for Tokens (Node.js Backend):**
    *   The backend callback endpoint (e.g., `/api/auth/google/callback`) receives the `authorization_code`.
    *   It uses the `googleapis` library to exchange this code (along with its `client_id` and `client_secret`) for an `access_token` and a `refresh_token` by making a secure POST request to Google's token endpoint.
5.  **Receive and Store Tokens (Node.js Backend & PostgreSQL):**
    *   Google responds with an `access_token` (short-lived), `refresh_token` (long-lived, if `access_type=offline` was used), `expires_in`, and `scope`.
    *   The Node.js backend **securely stores the `refresh_token`** (encrypted) and the `access_token` (can also be encrypted) in the PostgreSQL database, associated with the platform user. Also store `expires_at` and granted `scopes`.
    *   The backend then redirects the user back to a success/failure page in the React frontend.
6.  **Make API Calls (Node.js Backend):**
    *   When the platform needs to interact with Google APIs for a user:
        *   Retrieve the user's stored `access_token` and `refresh_token`.
        *   Initialize an `oauth2Client` instance from `googleapis` with these tokens.
        *   Use this authenticated client to make API calls (e.g., send an email via Gmail API).
7.  **Refresh Access Token (Node.js Backend):**
    *   Before making an API call, check if the `access_token` is expired (or handle the 401 error from Google).
    *   If expired, use the stored `refresh_token` to request a new `access_token` from Google.
    *   Update the stored `access_token` and its new `expires_at` time. If the refresh token fails, the user must re-authenticate.

## Step-by-Step Integration Examples (Node.js Backend using `googleapis`)

File: `server/src/services/googleAuthService.js` (Conceptual)
```javascript
const { google } = require('googleapis');
const prisma = require('../core/db/prisma.client'); // Your Prisma client
const { encrypt, decrypt } = require('../core/utils/encryption'); // Your encryption utility

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI // e.g., http://localhost:8080/api/auth/google/callback
);

async function generateAuthUrl(userId, scopes) {
  // Store userId or a CSRF token in 'state' to identify user upon callback
  const state = Buffer.from(JSON.stringify({ userId, scopes })).toString('base64');
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force consent to ensure refresh token is issued
    scope: scopes,     // Array of scope strings like ['https://www.googleapis.com/auth/gmail.send']
    state: state,
  });
}

async function handleGoogleCallback(code, state) {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('ascii'));
    const userId = decodedState.userId;
    const requestedScopes = decodedState.scopes;

    // Store tokens securely, associating with userId
    // Refresh tokens should ALWAYS be encrypted at rest.
    await prisma.userGoogleToken.upsert({
      where: { userId_scopes: { userId, scopes: requestedScopes.join(' ') } }, // Simple unique constraint
      update: {
        accessToken: tokens.access_token, // Consider encrypting if desired
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      create: {
        userId: userId,
        scopes: requestedScopes.join(' '),
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      }
    });
    return { success: true, userId };
  } catch (error) {
    console.error('Error handling Google callback:', error);
    return { success: false, error: error.message };
  }
}

async function getAuthenticatedClient(userId, requiredScopes) {
  const tokenRecord = await prisma.userGoogleToken.findFirst({ // Find a record that has all required scopes
    where: {
      userId: userId,
      // This logic needs to be more robust to check if stored scopes cover requiredScopes
      // For simplicity, assuming scopes are stored as a space-separated string and match exactly for now
      scopes: { contains: requiredScopes.join(' ') } // Adjust this based on how you store/query scopes
    }
  });

  if (!tokenRecord || !tokenRecord.refreshToken) {
    throw new Error('User not authenticated with Google or refresh token missing for required scopes.');
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  client.setCredentials({
    access_token: tokenRecord.accessToken,
    refresh_token: decrypt(tokenRecord.refreshToken),
    expiry_date: tokenRecord.tokenExpiry ? tokenRecord.tokenExpiry.getTime() : null,
  });

  // Auto-refresh logic (simplified, googleapis library can handle some of this)
  if (tokenRecord.tokenExpiry && tokenRecord.tokenExpiry.getTime() < Date.now() + 60000) { // Refresh if expires in next minute
    try {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      // Update stored tokens
      await prisma.userGoogleToken.update({
        where: { id: tokenRecord.id },
        data: {
          accessToken: credentials.access_token,
          tokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
          // A new refresh token might be issued, handle that if `credentials.refresh_token` exists
          ...(credentials.refresh_token && { refreshToken: encrypt(credentials.refresh_token) }),
        },
      });
    } catch (refreshError) {
      console.error('Failed to refresh Google access token for user:', userId, refreshError);
      throw new Error('Failed to refresh Google token. User may need to re-authenticate.');
    }
  }
  return client;
}

// --- API Interaction Examples ---
async function listUserDriveFiles(userId, count = 10) {
  const scopes = ['https://www.googleapis.com/auth/drive.readonly'];
  const authClient = await getAuthenticatedClient(userId, scopes);
  const drive = google.drive({ version: 'v3', auth: authClient });
  const res = await drive.files.list({
    pageSize: count,
    fields: 'nextPageToken, files(id, name, mimeType, webViewLink)',
    orderBy: 'modifiedTime desc',
  });
  return res.data.files;
}

async function sendGmailNotification(userId, to, subject, body) {
  const scopes = ['https://www.googleapis.com/auth/gmail.send'];
  const authClient = await getAuthenticatedClient(userId, scopes);
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    'From: me', // Or a specific sender alias if configured and permitted
    `To: ${to}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${utf8Subject}`,
    '',
    body,
  ];
  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodedMessage } });
}

// module.exports = { generateAuthUrl, handleGoogleCallback, listUserDriveFiles, sendGmailNotification, ... };
```
**Note:** The `userGoogleToken` table and scope matching logic would need careful design. The Prisma schema might include a unique constraint on `userId` and `service` (e.g., 'google_drive_readonly', 'google_gmail_send') if tokens are stored per scope set. Encryption for refresh tokens is critical.

### Frontend (React) Integration Points:
*   **"Connect to Google Drive" Button:**
    ```jsx
    // const handleConnectGoogleDrive = async () => {
    //   try {
    //     // Call your backend to get the Google Auth URL
    //     const response = await apiClient.get('/auth/google/connect?service=drive&scopes=https://www.googleapis.com/auth/drive.file');
    //     window.location.href = response.data.authUrl; // Redirect user to Google
    //   } catch (error) {
    //     console.error("Error initiating Google Drive connection:", error);
    //     // Show error to user
    //   }
    // };
    ```
*   **Callback Handling:** After Google redirects to `/api/auth/google/callback`, your backend processes it and then redirects the React app to a page indicating success or failure (e.g., `/settings/integrations?google_auth_status=success`). The React app can then update its UI.

## Webhooks/Push Notifications
For real-time updates (e.g., file changes in Drive), Google APIs support Push Notifications. This involves your Node.js backend:
1.  Registering a webhook URL (your platform's HTTPS endpoint) with the specific Google API (e.g., `drive.files.watch`).
2.  Verifying domain ownership for the webhook URL.
3.  Handling incoming notification messages (which often just indicate a change, requiring a subsequent API call to fetch details).
This is an advanced topic; refer to [Google's Push Notification documentation](https://developers.google.com/drive/api/guides/push) for each service.

## Security and Best Practices
*   **Store Refresh Tokens Securely:** Encrypt them in your PostgreSQL database using strong encryption (e.g., AES-256-GCM with a securely managed encryption key).
*   **Least Privilege Scopes:** Only request the minimum scopes necessary for the desired functionality. Clearly explain to users why these permissions are needed during the OAuth consent flow.
*   **Handle Token Expiration & Refresh:** Implement robust server-side logic in Node.js to refresh access tokens using the stored refresh tokens.
*   **User Consent & Revocation:**
    *   Provide a UI in your React app for users to disconnect their Google account.
    *   On disconnect, your Node.js backend should call Google's token revocation endpoint (`https://oauth2.googleapis.com/revoke?token=REFRESH_OR_ACCESS_TOKEN`) and delete the tokens from your database.
*   **State Parameter for CSRF Protection:** Use the `state` parameter in the OAuth authorization request to prevent CSRF attacks. Verify it on callback.
*   **Google App Verification:** For apps using sensitive/restricted scopes and intended for public use, undergo Google's OAuth app verification process.

By following these guidelines, the Autonomous Coding Agent platform can securely integrate with Google services, enhancing its capabilities for users. Always consult the latest official Google API documentation.
