# Google Services Integration (Gmail, Calendar, Drive)

This guide details how to integrate Google services like Gmail, Google Calendar, and Google Drive into your platform using their respective APIs. This typically involves OAuth 2.0 for authorization.

## Overview

Integrating Google services can allow your platform to:
*   **Gmail API:**
    *   Read user's emails (with permission).
    *   Send emails on behalf of the user.
    *   Manage email drafts and labels.
    *   Set up push notifications for new emails.
*   **Google Calendar API:**
    *   Read user's calendars and events.
    *   Create, update, and delete calendar events.
    *   Manage calendar sharing and access controls.
    *   Subscribe to changes in calendars.
*   **Google Drive API:**
    *   List, search, and download user's files.
    *   Upload files to user's Google Drive.
    *   Manage file permissions and sharing.
    *   Create, edit, and manage Google Docs, Sheets, Slides (with appropriate scopes).

## Prerequisites

1.  **Google Cloud Platform (GCP) Project:**
    *   Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
    *   Enable the Gmail API, Google Calendar API, and Google Drive API for your project under "APIs & Services" > "Library".
2.  **OAuth 2.0 Credentials:**
    *   Go to "APIs & Services" > "Credentials" in your GCP project.
    *   Create an "OAuth client ID".
    *   Choose "Web application" as the application type.
    *   Add **Authorized JavaScript origins** (e.g., `http://localhost:3000`, `https://your-platform.com`).
    *   Add **Authorized redirect URIs** (e.g., `http://localhost:3000/auth/google/callback`, `https://your-platform.com/auth/google/callback`). This is where Google will send the authorization code after the user grants permission.
    *   Note down the **Client ID** and **Client Secret**. Store the Client Secret securely on your backend.
3.  **OAuth Consent Screen:**
    *   Configure the OAuth consent screen under "APIs & Services" > "OAuth consent screen".
    *   Specify the application name, user support email, and developer contact information.
    *   **Add Scopes:** Define the permissions your application will request. This is crucial.
        *   **Gmail API Scopes (Examples):**
            *   `https://www.googleapis.com/auth/gmail.readonly`: Read all resources and their metadata.
            *   `https://www.googleapis.com/auth/gmail.send`: Send messages.
            *   `https://www.googleapis.com/auth/gmail.modify`: Modify messages, threads, labels.
            *   Full list: [Gmail API Scopes](https://developers.google.com/gmail/api/auth/scopes)
        *   **Google Calendar API Scopes (Examples):**
            *   `https://www.googleapis.com/auth/calendar.readonly`: View calendars and events.
            *   `https://www.googleapis.com/auth/calendar.events`: View and edit events on all user's calendars.
            *   `https://www.googleapis.com/auth/calendar`: Full, permissive scope to manage calendars.
            *   Full list: [Calendar API Scopes](https://developers.google.com/calendar/api/auth/scopes)
        *   **Google Drive API Scopes (Examples):**
            *   `https://www.googleapis.com/auth/drive.readonly`: View metadata and content of files.
            *   `https://www.googleapis.com/auth/drive.file`: Per-file access (recommended for specific file operations).
            *   `https://www.googleapis.com/auth/drive`: Full, permissive scope to access all user's files.
            *   Full list: [Drive API Scopes](https://developers.google.com/drive/api/guides/auth/scopes)
    *   Add test users while your app is in "Testing" mode. You'll need to submit your app for verification by Google before it can be used by general users if you request sensitive/restricted scopes.

4.  **Google API Client Libraries:**
    *   **Backend:** Use Google's official client libraries for your backend language (e.g., `googleapis` for Node.js, `google-api-python-client` for Python, `google-api-java-client` for Java).
    *   **Frontend (Optional, for client-side OAuth or direct API calls if appropriate):** Google Sign-In JavaScript platform library or Google API JavaScript Client Library (GAPI). Often, the OAuth flow is handled server-side.

## Authentication: OAuth 2.0 Flow (Server-Side Web Apps)

This is the most common and secure flow for web applications.

1.  **User Initiates Connection:**
    *   User clicks a "Connect to Google" button in your platform.
2.  **Redirect to Google's OAuth 2.0 Server:**
    *   Your backend constructs the Google OAuth URL with parameters like `client_id`, `redirect_uri`, `response_type=code`, `scope` (list of requested scopes), and `access_type=offline` (to get a refresh token for long-term access).
    *   Your platform redirects the user's browser to this URL.
    ```
    Example URL:
    https://accounts.google.com/o/oauth2/v2/auth?
    client_id=YOUR_CLIENT_ID.apps.googleusercontent.com&
    redirect_uri=https://your-platform.com/auth/google/callback&
    response_type=code&
    scope=https://www.googleapis.com/auth/calendar.readonly%20https://www.googleapis.com/auth/gmail.readonly&
    access_type=offline&
    prompt=consent // Optional: forces consent screen every time, useful for testing or if refresh token is needed again
    ```
3.  **User Grants Permission:**
    *   User logs into their Google account (if not already) and sees the consent screen listing the permissions your app is requesting.
    *   If the user approves, Google redirects them back to your specified `redirect_uri` with an `authorization code` in the query parameters (e.g., `?code=AUTHORIZATION_CODE`).
4.  **Exchange Authorization Code for Tokens:**
    *   Your backend server receives the request at the `redirect_uri`.
    *   It extracts the `authorization_code`.
    *   Your backend makes a secure POST request to Google's token endpoint (`https://oauth2.googleapis.com/token`) with:
        *   `code`: The authorization code.
        *   `client_id`: Your Client ID.
        *   `client_secret`: Your Client Secret.
        *   `redirect_uri`: The same redirect URI used earlier.
        *   `grant_type=authorization_code`.
5.  **Receive and Store Tokens:**
    *   Google responds with an `access_token`, `refresh_token` (if `access_type=offline` was requested and it's the first time the user authorizes for those scopes or `prompt=consent` was used), `expires_in` (lifetime of the access token in seconds), and `scope`.
    *   **Securely store the `access_token` and `refresh_token`** associated with the user in your platform's database. Encrypt refresh tokens.
6.  **Make API Calls:**
    *   Use the `access_token` to make authorized API calls to Google services on behalf of the user. Include it in the `Authorization` header: `Authorization: Bearer ACCESS_TOKEN`.
7.  **Refresh Access Token:**
    *   Access tokens are short-lived. When an access token expires, your API calls will fail (usually with a 401 error).
    *   Use the stored `refresh_token` to request a new `access_token` from Google's token endpoint without requiring user re-authentication. Make a POST request with:
        *   `refresh_token`: The stored refresh token.
        *   `client_id`: Your Client ID.
        *   `client_secret`: Your Client Secret.
        *   `grant_type=refresh_token`.
    *   Google will respond with a new `access_token` and its `expires_in`. Update the stored access token. If a refresh token becomes invalid, the user may need to re-authenticate.

## Step-by-Step Integration Examples

[**Provide code snippets and explanations for backend (e.g., Node.js/Python) and frontend interactions. Below are conceptual outlines.**]

### Backend: Using Google API Client Libraries (Node.js Example)

```bash
npm install googleapis
```

```javascript
// backend/services/googleApiService.js
const { google } = require('googleapis');
const YOUR_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const YOUR_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const YOUR_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; // e.g., 'https://your-platform.com/auth/google/callback'

const oauth2Client = new google.auth.OAuth2(
  YOUR_CLIENT_ID,
  YOUR_CLIENT_SECRET,
  YOUR_REDIRECT_URI
);

// Function to generate the auth URL
function getGoogleAuthUrl(scopes) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Request refresh token every time for simplicity in example
    scope: scopes, // Array of scope strings
  });
}

// Function to get tokens from authorization code
async function getTokensFromCode(code) {
  const { tokens } = await oauth2Client.getToken(code);
  // oauth2Client.setCredentials(tokens); // Set credentials for this instance
  // Store tokens.access_token and tokens.refresh_token securely in your DB associated with the user
  return tokens;
}

// Function to set tokens for an existing user (e.g., retrieved from DB)
function setTokensForUser(accessToken, refreshToken) {
  const client = new google.auth.OAuth2(YOUR_CLIENT_ID, YOUR_CLIENT_SECRET, YOUR_REDIRECT_URI);
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return client;
}

// --- Gmail API Example ---
async function listUserEmails(authClient) { // authClient is an OAuth2 client with set credentials
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  try {
    const res = await gmail.users.messages.list({ userId: 'me', maxResults: 5 });
    console.log('Gmail messages:', res.data.messages);
    return res.data.messages;
  } catch (error) {
    console.error('Error listing Gmail messages:', error);
    // Handle token refresh if it's an auth error
    if (error.response && error.response.status === 401 && authClient.credentials.refresh_token) {
      console.log('Access token expired, attempting to refresh...');
      try {
        const { credentials } = await authClient.refreshAccessToken();
        authClient.setCredentials(credentials);
        // Store new credentials (especially new access_token, and potentially new refresh_token if returned)
        // db.updateUserGoogleTokens(userId, credentials.access_token, credentials.refresh_token);
        console.log('Tokens refreshed. Retrying API call...');
        return listUserEmails(authClient); // Retry the original call
      } catch (refreshError) {
        console.error('Error refreshing token:', refreshError);
        throw refreshError; // User might need to re-authenticate
      }
    }
    throw error;
  }
}

// --- Google Calendar API Example ---
async function listUserEvents(authClient) {
  const calendar = google.calendar({ version: 'v3', auth: authClient });
  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: (new Date()).toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });
    console.log('Upcoming 10 events:', res.data.items);
    return res.data.items;
  } catch (error) {
    console.error('Error listing Calendar events:', error);
    // Implement token refresh logic similar to Gmail example
    throw error;
  }
}

// --- Google Drive API Example ---
async function listUserDriveFiles(authClient) {
  const drive = google.drive({ version: 'v3', auth: authClient });
  try {
    const res = await drive.files.list({
      pageSize: 10,
      fields: 'nextPageToken, files(id, name)',
    });
    console.log('Drive files:', res.data.files);
    return res.data.files;
  } catch (error) {
    console.error('Error listing Drive files:', error);
    // Implement token refresh logic similar to Gmail example
    throw error;
  }
}

module.exports = {
  getGoogleAuthUrl,
  getTokensFromCode,
  setTokensForUser,
  listUserEmails,
  listUserEvents,
  listUserDriveFiles,
  // ... other functions to interact with Google APIs
};
```

### Platform Integration Points:
*   **Connect Button:** Frontend button that hits a backend endpoint like `/auth/google/connect`. This backend endpoint calls `getGoogleAuthUrl` and redirects the user.
*   **Callback Handler:** Backend endpoint (e.g., `/auth/google/callback`) that receives the `code` from Google.
    *   Calls `getTokensFromCode(code)`.
    *   Stores the tokens securely against the logged-in platform user.
    *   Redirects the user back to a relevant page in your platform (e.g., settings page showing "Connected to Google").
*   **API Usage:** When a user accesses a feature that requires Google data:
    *   Backend retrieves the user's stored `access_token` and `refresh_token`.
    *   Creates an `oauth2Client` instance using `setTokensForUser(accessToken, refreshToken)`.
    *   Calls the relevant Google API function (e.g., `listUserEmails(authClient)`).
    *   Handles potential token refresh if an auth error occurs.

## Handling Webhooks/Push Notifications

For real-time updates (e.g., new email in Gmail, calendar event changes), you can use Google's Push Notifications.
*   **Setup:** This involves registering a webhook URL with Google for a specific resource (e.g., user's mailbox, calendar). Your webhook URL must be HTTPS.
*   **Verification:** Google will send a request to your webhook URL to verify ownership.
*   **Receiving Notifications:** When an event occurs, Google sends a message to your webhook. This message usually doesn't contain the full data but indicates that something changed.
*   **Fetching Data:** Your backend then makes an API call to Google to get the updated data.
*   **Example (Gmail Push Notifications):** Use `gmail.users.watch()` to start receiving notifications for a user's mailbox.

[**Refer to specific Google API documentation for setting up push notifications as it varies per service.**]
*   Gmail API Push Notifications: [Gmail Push](https://developers.google.com/gmail/api/guides/push)
*   Calendar API Push Notifications: [Calendar Push](https://developers.google.com/calendar/api/guides/push)
*   Drive API Push Notifications: [Drive Push](https://developers.google.com/drive/api/guides/push)

## Security and Best Practices

*   **Store Refresh Tokens Securely:** Encrypt them at rest. They provide long-term access to user data.
*   **Least Privilege Scopes:** Only request the scopes your application absolutely needs. Clearly explain to users why you need these permissions.
*   **Handle Token Expiration and Refresh:** Implement robust logic to refresh access tokens.
*   **User Consent and Revocation:**
    *   Provide a way for users to disconnect their Google account from your platform.
    *   When a user disconnects, revoke the stored tokens on Google's side (if possible, using `oauth2Client.revokeToken(token)`) and delete them from your database.
    *   Users can also revoke access from their [Google Account permissions page](https://myaccount.google.com/permissions). Your app should handle this gracefully (e.g., tokens will become invalid).
*   **Rate Limiting:** Be mindful of Google API rate limits. Implement backoff strategies for retries.
*   **Error Handling:** Handle API errors gracefully and provide informative messages to users.
*   **Google API Verification:** If your app uses sensitive or restricted scopes and will be used by external users (not just internal test users), you'll need to go through Google's OAuth app verification process. This can take time and requires providing information about your app and how it uses the requested scopes. Start this process early.

## Troubleshooting

*   **`redirect_uri_mismatch`:** Ensure the `redirect_uri` in your GCP console settings exactly matches the one used in your auth URL and token exchange request.
*   **`invalid_grant`:** Can occur if the authorization code is expired/used, or if the refresh token is invalid. Clock skew between your server and Google's can sometimes cause issues with token validation.
*   **Scope Issues:** If API calls fail with permission errors, double-check that you requested the correct scopes during the OAuth flow and that the user granted them.
*   **Missing Refresh Token:** Refresh tokens are typically only issued the first time a user authorizes a specific set of scopes for your app, or if `prompt=consent` is used. If you need a refresh token again, you might need to force the consent screen.

By following these guidelines, you can securely and effectively integrate Google services into your platform, offering powerful features to your users. Always refer to the latest official Google API documentation for the most up-to-date information.
