# Authentication & API Tokens

This guide provides comprehensive instructions on managing authentication within the platform, focusing on OAuth 2.0 for third-party integrations, internal API key management, and token lifecycles to ensure secure and scalable access.

## Overview

Robust authentication and authorization are critical for protecting platform resources and user data. This document covers:
1.  **Platform's Own User Authentication:** (Briefly, as this is usually core to the platform itself, but relevant for context).
2.  **OAuth 2.0 for Third-Party Service Integration:** How the platform acts as an OAuth 2.0 client to access external services (e.g., Google, Slack, GitHub) on behalf of users.
3.  **Exposing APIs with API Keys/Tokens:** How the platform allows external applications or scripts to access its own APIs securely.
4.  **Token Lifecycle Management:** Best practices for issuing, storing, validating, refreshing, and revoking tokens.
5.  **Security Best Practices.**

## 1. Platform User Authentication

[**Briefly describe your platform's primary user authentication mechanism. This section is for context and completeness, assuming it's already well-defined elsewhere if it's a mature platform.**]

*   **Methods:** (e.g., username/password with bcrypt hashing, social logins via OAuth/OIDC, SAML for enterprise SSO, magic links).
*   **Session Management:** (e.g., JWTs stored in cookies or localStorage, server-side sessions).
*   **Key Security Aspects:** Password policies, multi-factor authentication (MFA), brute-force protection, secure password recovery.

## 2. OAuth 2.0 for Third-Party Service Integration (Platform as Client)

When your platform needs to access data or perform actions on external services (like Google, Slack, Jira, etc.) on behalf of a user, it acts as an OAuth 2.0 client.

### a. Core OAuth 2.0 Concepts:
*   **Roles:**
    *   **Resource Owner:** The user who owns the data on the third-party service.
    *   **Client:** Your platform application.
    *   **Authorization Server:** The third-party service's server that issues access tokens (e.g., Google's OAuth server).
    *   **Resource Server:** The third-party service's API server that hosts the protected resources.
*   **Grant Types:** The method by which the client gets an access token. The most common for web server applications is the **Authorization Code Grant**.
*   **Tokens:**
    *   **Access Token:** A short-lived token used to make API requests to the Resource Server.
    *   **Refresh Token:** A long-lived token used to obtain new access tokens when the current one expires, without requiring the user to re-authenticate.
*   **Scopes:** Define the specific permissions the client is requesting (e.g., `read:profile`, `write:calendar`).

### b. Authorization Code Grant Flow (Recap):
1.  **User Initiates Connection:** User clicks "Connect to [Third-Party Service]" in your platform.
2.  **Redirect to Authorization Server:** Your platform redirects the user to the third-party's authorization URL with `client_id`, `redirect_uri`, `response_type=code`, `scope`, and often `access_type=offline` (to request a refresh token).
3.  **User Grants Permission:** User logs into the third-party service and approves the requested scopes.
4.  **Authorization Code Issued:** Authorization Server redirects the user back to your platform's `redirect_uri` with an `authorization_code`.
5.  **Exchange Code for Tokens:** Your platform's backend exchanges the `authorization_code` (along with `client_id` and `client_secret`) for an `access_token` and `refresh_token` by making a POST request to the Authorization Server's token endpoint.
6.  **Store Tokens Securely:**
    *   Associate tokens with the platform user.
    *   **Encrypt refresh tokens** at rest in your database. They are highly sensitive.
    *   Access tokens can also be encrypted or stored securely, but their shorter lifespan makes them slightly less critical than refresh tokens if compromised (though still serious).
7.  **Access Protected Resources:** Use the `access_token` in the `Authorization: Bearer <token>` header to make API calls to the Resource Server.
8.  **Refresh Access Token:** When the `access_token` expires, use the `refresh_token` to request a new `access_token` from the token endpoint (`grant_type=refresh_token`). Update the stored `access_token`. If the refresh token also fails, the user needs to re-authenticate.

[**Refer to specific integration guides (e.g., Google Services, Slack) for detailed examples of this flow as they are the "clients" in those scenarios.** See `docs/05-extending-the-platform/05-third-party-tool-integration/`.]

### c. Storing OAuth Tokens in Your Platform:
*   **Database Schema (Conceptual):**
    ```sql
    CREATE TABLE user_third_party_tokens (
        id SERIAL PRIMARY KEY,
        platform_user_id INTEGER NOT NULL REFERENCES platform_users(id),
        service_name VARCHAR(50) NOT NULL, -- e.g., 'google', 'slack', 'jira'
        access_token TEXT NOT NULL,         -- Encrypt this if very sensitive / long-lived
        refresh_token TEXT,                 -- ALWAYS ENCRYPT THIS
        expires_at TIMESTAMP WITH TIME ZONE, -- When the access_token expires
        scopes TEXT,                        -- Comma-separated list of granted scopes
        third_party_user_id VARCHAR(255),   -- Optional: User ID on the third-party service
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (platform_user_id, service_name)
    );
    ```
*   **Encryption:** Use strong encryption algorithms (e.g., AES-256-GCM) for refresh tokens. The encryption key itself must be managed securely (e.g., via a Hardware Security Module (HSM), cloud KMS, or a well-protected environment variable).

## 3. Platform API Access (Platform as Resource Server/Authorization Server)

If your platform exposes its own APIs that external applications, scripts, or even internal services need to access programmatically, you need a way to authenticate these clients.

### a. API Key / Personal Access Token (PAT) Model:
This is a common approach for server-to-server or script-based access.
*   **Generation:**
    *   Users (or administrators for system-level keys) generate API keys/PATs through your platform's UI (e.g., in their profile settings or an API section).
    *   When generating, you might allow users to assign specific **scopes or permissions** to the key (e.g., read-only access to certain resources, write access to others).
    *   **Display the key ONCE** to the user upon generation. Store a **hashed version** of the key in your database, not the raw key.
*   **Format:** Typically a long, random, unguessable string (e.g., `platform_sk_a1b2c3d4e5f6...`).
*   **Storage by Client:** The client application is responsible for storing this key securely.
*   **Usage by Client:** The client includes the API key in an HTTP header for API requests:
    *   `Authorization: Bearer YOUR_API_KEY` (Common for PATs)
    *   `Authorization: ApiKey YOUR_API_KEY`
    *   `X-API-Key: YOUR_API_KEY` (Custom header)
*   **Verification by Platform:**
    1.  Platform receives the API request and extracts the key from the header.
    2.  **Never compare the received raw key directly with stored raw keys.**
    3.  Look up the key by a non-secret part (e.g., a key prefix if you use one) or by iterating through potential user keys (less efficient).
    4.  **Compare the received raw key against the stored hashed versions** using a secure hashing algorithm (e.g., bcrypt, Argon2, or SHA-256 if you must, but bcrypt/Argon2 are better for passwords/secrets).
        *   Alternatively, for higher security and performance if keys are opaque tokens, you can store the hash of the key and look up by the hash if the client sends the key in a way that it can be hashed before lookup (less common for Bearer tokens).
        *   A common pattern for API keys is to store the hash and a prefix. The client sends the full key. The server uses the prefix for lookup and then verifies the full key against the hash.
*   **Key Hashing (Example):**
    ```javascript
    // const bcrypt = require('bcrypt');
    // const saltRounds = 10;
    // const apiKey = generateRandomSecureString(); // Generate the raw key
    // const hashedApiKey = await bcrypt.hash(apiKey, saltRounds);
    // // Store `hashedApiKey` and potentially a `key_prefix` in DB. Display `apiKey` to user once.

    // // Verification:
    // // const userProvidedKey = req.headers.authorization.split(' ')[1];
    // // const storedHashedKey = // fetch from DB based on user or key prefix
    // // const isValid = await bcrypt.compare(userProvidedKey, storedHashedKey);
    ```
*   **Permissions:** When a valid key is received, your platform checks the scopes/permissions associated with that key to authorize the requested action.
*   **Revocation:** Allow users to revoke their API keys through the platform UI. This should mark the key (or its stored hash) as invalid in your database.
*   **Expiration (Optional):** API keys can be set to expire, requiring users to generate new ones.

### b. OAuth 2.0 for External Applications (Platform as Authorization Server):
If you want external *applications* (not just scripts) to access your platform's API on behalf of your users, or if you need more granular, delegated permissions, you can implement your platform as an OAuth 2.0 Authorization Server.
*   This is a more complex undertaking than simple API keys.
*   You would need to implement:
    *   Client registration (for external app developers).
    *   Authorization endpoint (`/oauth/authorize`).
    *   Token endpoint (`/oauth/token`).
    *   Mechanisms for users to grant/deny consent.
    *   Support for grant types (e.g., Authorization Code, Client Credentials for machine-to-machine).
*   **Consider using existing OAuth 2.0 server libraries or services** (e.g., Ory Hydra, Keycloak, Auth0, Okta) rather than building everything from scratch unless you have very specific needs.

## 4. Token Lifecycle Management

### a. Issuance:
*   **Access Tokens (OAuth):** Issued by the Authorization Server after successful authentication and authorization. Should be short-lived (e.g., 15 minutes to 1 hour).
*   **Refresh Tokens (OAuth):** Issued alongside access tokens (if `access_type=offline` or similar is used). Long-lived but can be revoked. Should be single-use for refresh or rotated upon use.
*   **API Keys/PATs (Platform):** Generated by the platform upon user request. Can be long-lived or have an expiration date set by the user or system policy.

### b. Storage:
*   **Client-Side (for tokens consumed by your frontend from your own backend):**
    *   **HTTP-Only, Secure Cookies:** Generally the most secure way to store session tokens (like JWTs from your platform's auth) to prevent XSS access.
    *   **localStorage/sessionStorage:** Susceptible to XSS. If used, take extra precautions. Not recommended for highly sensitive tokens.
*   **Server-Side (for your platform storing third-party OAuth tokens or its own API key hashes):**
    *   **Database:** Encrypt sensitive tokens (especially refresh tokens and raw API keys if you absolutely must store them, though hashing is preferred for your own API keys).
    *   Use appropriate database security measures.
*   **Client Application Storing Platform API Keys:** The client application is responsible for secure storage (e.g., environment variables, secret management tools).

### c. Validation:
*   **Access Tokens (OAuth/JWT):**
    *   Verify signature (for JWTs).
    *   Check expiration (`exp` claim).
    *   Check issuer (`iss` claim).
    *   Check audience (`aud` claim).
    *   Check scopes/permissions against the requested resource/action.
*   **API Keys (Platform):**
    *   Verify against stored hashed versions.
    *   Check if revoked or expired.
    *   Verify associated permissions.
*   **Opaque Tokens (vs. JWTs):** If access tokens are opaque strings (not JWTs), they must be validated by making a call to the Authorization Server's introspection endpoint or by looking them up in a shared database.

### d. Refreshing (OAuth Access Tokens):
*   When an access token expires, the client uses the refresh token to request a new access token from the token endpoint.
*   **Refresh Token Rotation (Recommended):** When a refresh token is used, the Authorization Server should issue a *new* refresh token along with the new access token and invalidate the old refresh token. This helps detect token theft if an old refresh token is used.

### e. Revocation:
*   **OAuth Tokens:**
    *   Users should be able to "disconnect" third-party services from your platform. This should trigger a call to the third-party's token revocation endpoint (if available) and delete the stored tokens from your database.
    *   Resource Owners can usually revoke consent directly from the third-party service's account settings. Your platform should handle the resulting invalid tokens gracefully.
*   **Platform API Keys/PATs:**
    *   Users must be able to revoke their API keys through your platform's UI.
    *   This marks the key (or its hash) as invalid in your database.
    *   Implement immediate or near-immediate revocation.

## 5. Security Best Practices

*   **HTTPS Everywhere:** All communication involving tokens must be over HTTPS.
*   **Secure Storage of Secrets:**
    *   Protect OAuth client secrets, API key signing secrets, and encryption keys for stored tokens. Use environment variables, secret management services (Vault, AWS KMS, Google Cloud KMS, Azure Key Vault), or HSMs.
    *   **Never embed secrets directly in client-side code.**
*   **Principle of Least Privilege:**
    *   Request only the OAuth scopes necessary.
    *   Assign minimal permissions to platform API keys.
*   **Input Validation:** Validate all inputs, especially tokens received from clients.
*   **Rate Limiting:** Protect token endpoints and API endpoints that use tokens from abuse.
*   **Audit Logging:** Log token issuance, refresh, revocation, and significant API access events for security monitoring.
*   **Short-Lived Access Tokens:** Keep the lifespan of access tokens short to limit the window of opportunity if one is compromised.
*   **Refresh Token Rotation:** Enhances security by invalidating used refresh tokens.
*   **Regular Security Audits:** Review your authentication and token management mechanisms regularly.
*   **Content Security Policy (CSP):** If tokens are handled in a browser, use CSP to mitigate XSS risks.
*   **Cross-Site Request Forgery (CSRF) Protection:** Protect endpoints that handle token issuance or modification (especially in cookie-based session contexts).

By implementing robust authentication and token management practices, you can ensure secure and scalable access to both third-party services and your platform's own APIs. Always refer to the latest security guidelines and standards like those from OWASP.
