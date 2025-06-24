# Authentication & API Tokens

This guide provides comprehensive instructions on managing authentication within the Autonomous Coding Agent platform (Node.js backend, React frontend). It focuses on OAuth 2.0 for third-party integrations, internal API key management for programmatic access to the platform itself, and token lifecycles to ensure secure and scalable access.

## Overview

Robust authentication and authorization are critical for protecting platform resources (projects, AI workflows, code snippets) and user data. This document covers:
1.  **Platform User Authentication:** The primary method for users logging into the React frontend and accessing backend services (JWT-based).
2.  **OAuth 2.0 for Third-Party Service Integration (Platform as Client):** How the Node.js backend securely connects to external services (e.g., Google, Slack, GitHub, Jira) on behalf of users.
3.  **Platform API Access (Platform as Resource Server):** How external scripts or services can programmatically interact with the Autonomous Coding Agent's own APIs using API Keys (Personal Access Tokens - PATs).
4.  **Token Lifecycle Management:** Best practices for issuing, storing, validating, refreshing, and revoking various types of tokens.
5.  **Security Best Practices.**

## 1. Platform User Authentication (JWT-based)

As outlined in the System Architecture, the platform uses **JSON Web Tokens (JWTs)** for authenticating users interacting with the React frontend and Node.js backend.

*   **Flow:**
    1.  User logs in via the React frontend using credentials (email/password) or an OAuth provider (e.g., "Login with GitHub" - if implemented).
    2.  The Node.js backend (`AuthService`) validates credentials or the OAuth callback.
    3.  Upon success, `AuthService` generates:
        *   A short-lived **Access Token (JWT)** containing user identifiers and permissions/roles.
        *   A long-lived **Refresh Token** stored securely (e.g., HttpOnly cookie or in the database, associated with the user and device).
    4.  The Access Token is sent to the React client (e.g., in response body, to be stored in memory or secure localStorage/sessionStorage).
    5.  The React client includes the Access Token in the `Authorization: Bearer <token>` header for all subsequent API requests to the Node.js backend.
    6.  Backend middleware verifies the Access Token. If expired, the client uses the Refresh Token to obtain a new Access Token from `AuthService`.
*   **Key Security Aspects:**
    *   Passwords hashed using `bcrypt` in the PostgreSQL database (via Prisma).
    *   JWTs signed with strong secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET` from environment variables).
    *   Short expiry for Access Tokens (e.g., 15-60 minutes).
    *   Secure handling and rotation of Refresh Tokens.
    *   Consider Multi-Factor Authentication (MFA) for enhanced security.

## 2. OAuth 2.0 for Third-Party Service Integration (Platform as Client)

When the Autonomous Coding Agent needs to access data or perform actions on external services (e.g., Google Drive to fetch code, Slack to send notifications, Jira to create issues) on behalf of a user, the Node.js backend acts as an OAuth 2.0 client.

*   **Process:** This follows the **Authorization Code Grant Flow**, as detailed in the specific integration guides:
    *   [Google Services Integration](./05-extending-the-platform/05-third-party-tool-integration/05-a-google-services.md)
    *   [Slack Integration](./05-extending-the-platform/05-third-party-tool-integration/05-b-slack.md)
    *   [Jira Integration](./05-extending-the-platform/05-third-party-tool-integration/05-d-jira-atlassian.md)
    *   (And similar for GitHub/GitLab if that integration is built for repository access).
*   **Token Storage (Node.js Backend & PostgreSQL):**
    *   The Node.js backend securely stores the obtained `access_token` and (especially) `refresh_token` from third-party services.
    *   These tokens are associated with the platform user in the PostgreSQL database (e.g., in a `UserThirdPartyTokens` table).
    *   **Refresh tokens MUST be encrypted at rest** using a strong encryption key managed by the platform (e.g., from `ENCRYPTION_KEY` environment variable).
    *   Access tokens can also be encrypted, though their shorter lifespan makes this slightly less critical than refresh tokens.
    *   The schema would typically include `userId`, `serviceName` (e.g., 'google', 'slack'), `encryptedAccessToken`, `encryptedRefreshToken`, `tokenExpiry`, and `scopes`.

## 3. Platform API Access (Platform as Resource Server using API Keys/PATs)

To allow external scripts, CI/CD pipelines, or other services to programmatically interact with the Autonomous Coding Agent's own APIs (e.g., to trigger an AI workflow, fetch results), the platform uses API Keys, often referred to as Personal Access Tokens (PATs).

### a. API Key Generation and Management:
*   **User Interface (React Frontend):** Users can generate and manage their API keys through their profile settings in the React application.
*   **Backend Logic (Node.js `AuthService` & PostgreSQL):**
    1.  When a user requests a new API key:
        *   A cryptographically secure random string is generated (e.g., `agent_pk_xxxxxxxxxxxxxxxxxxxx`).
        *   The user can be allowed to assign a name/label to the key and potentially select scopes/permissions for it (see [Permission & Role Management](./09-permission-role-management/README.md)).
        *   The **raw API key is displayed to the user ONCE**. They must copy and store it securely.
        *   A **hash of the API key** (e.g., using `bcrypt` or `argon2id`) is stored in the PostgreSQL database (`ApiKeys` table), linked to the `User` and storing the key prefix, hash, name, scopes, expiration date (optional), and last used date.
    2.  Users can revoke (delete) their API keys via the UI. This marks the corresponding hashed key in the database as invalid or deletes it.

### b. API Key Usage by Clients:
*   Clients include the API key in the `Authorization` HTTP header for requests to the platform's API:
    ```
    Authorization: Bearer agent_pk_xxxxxxxxxxxxxxxxxxxx
    ```
    Alternatively, a custom header like `X-Agent-API-Key: agent_pk_xxxxxxxxxxxxxxxxxxxx` can be used.

### c. API Key Verification (Node.js Backend Middleware):
1.  An Express middleware extracts the API key from the request header.
2.  It queries the `ApiKeys` table in PostgreSQL for active keys matching the user associated with the request (or by a key prefix if keys are globally unique and designed that way).
3.  It securely compares the provided API key against the stored hashed versions using `bcrypt.compare()` or equivalent.
4.  If a match is found and the key is valid (not revoked, not expired):
    *   The request is authenticated.
    *   The user associated with the key and the key's scopes are attached to the request object for authorization checks by downstream services.
5.  If no match or invalid, a `401 Unauthorized` error is returned.

**Conceptual Prisma Schema for API Keys:**
```prisma
// In your prisma/schema.prisma
model ApiKey {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name        String    // User-defined name for the key
  keyPrefix   String    @unique // e.g., "agent_pk_" + first 8 chars of hash, for quick lookup
  hashedKey   String    // Bcrypt or Argon2 hash of the full API key
  scopes      String[]  // Array of permission scopes granted to this key
  expiresAt   DateTime?
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())
  revokedAt   DateTime?

  @@index([userId])
}
```

## 4. Token Lifecycle Management

### a. Issuance:
*   **Platform JWT Access Tokens:** Short-lived (e.g., 15-60 mins), issued by `AuthService` on login or refresh.
*   **Platform JWT Refresh Tokens:** Longer-lived (e.g., 7-30 days), issued by `AuthService` on login. Stored securely.
*   **Third-Party OAuth Access Tokens:** Short-lived, issued by external Authorization Servers. Stored by platform backend.
*   **Third-Party OAuth Refresh Tokens:** Long-lived, issued by external Authorization Servers. Stored encrypted by platform backend.
*   **Platform API Keys (PATs):** Can be long-lived or have user-defined/system-defined expiration. Generated on user request.

### b. Storage:
*   **Platform JWT Access Token (Client-Side - React):** In memory (e.g., JavaScript variable in a context/store) is safest. `sessionStorage` is an option. Avoid `localStorage` if possible due to XSS risks unless strictly necessary and mitigated.
*   **Platform JWT Refresh Token (Client-Side - React):** Best stored in an **HttpOnly, Secure cookie** if backend and frontend are on the same registrable domain. If not, secure `localStorage` with strong XSS mitigation or rely on backend session management for refresh.
*   **Third-Party OAuth Tokens (Server-Side - Node.js/PostgreSQL):** Access tokens can be stored as is or encrypted. **Refresh tokens MUST be encrypted at rest.**
*   **Platform API Key Hashes (Server-Side - Node.js/PostgreSQL):** Hashed versions stored. Raw key shown to user once.

### c. Validation:
*   **JWTs (Platform & Third-Party Access Tokens if JWTs):** Verify signature, expiration (`exp`), issuer (`iss`), audience (`aud`). Check scopes against requested action.
*   **Platform API Keys:** Verify against stored hash. Check active status (not revoked, not expired). Check associated scopes.
*   **Opaque Third-Party Access Tokens:** Validated by making an API call. If it fails with 401/403, attempt refresh.

### d. Refreshing:
*   **Platform JWT Access Tokens:** React client sends refresh token to a dedicated `/auth/refresh` endpoint on Node.js backend. Backend validates refresh token, issues new access (and potentially refresh) token.
*   **Third-Party OAuth Access Tokens:** Node.js backend uses stored refresh token to request new access token from the third-party's token endpoint. Implement refresh token rotation if supported by the provider.

### e. Revocation:
*   **Platform JWT Refresh Tokens:** Can be revoked by deleting them from server-side storage (if tracked per device/session) or by maintaining a blacklist of revoked token IDs (`jti` claim).
*   **Third-Party OAuth Tokens:** User disconnects service via React UI. Node.js backend calls third-party's token revocation endpoint and deletes stored tokens.
*   **Platform API Keys (PATs):** User revokes key via React UI. Node.js backend marks the hashed key as revoked or deletes it from the database.

## 5. Security Best Practices
*   **HTTPS Everywhere:** All token-related communication over HTTPS.
*   **Secure Secret Management:** Protect `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY`, etc., using environment variables and secure vault solutions in production.
*   **Strong Hashing for API Keys:** Use `bcrypt` or `Argon2id` for hashing platform-generated API keys.
*   **Encryption for Refresh Tokens:** Use strong symmetric encryption (AES-256-GCM) for all stored third-party refresh tokens.
*   **Least Privilege:** Request minimal OAuth scopes. Assign minimal permissions to platform API keys.
*   **Regular Audits & Token Rotation:** Encourage or enforce rotation of API keys. Periodically review active sessions and OAuth grants.
*   **Input Validation & Output Encoding:** Standard security practices for all API endpoints.
*   **Rate Limiting & Brute-Force Protection:** On login, token refresh, and API key validation endpoints.

This comprehensive approach to authentication and token management ensures that the Autonomous Coding Agent platform is secure, scalable, and can effectively integrate with other services while providing secure programmatic access to its own capabilities.
