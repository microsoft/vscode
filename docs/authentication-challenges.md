# Authentication Challenges API

This document explains how to use the new authentication challenges API to handle mandatory multi-factor authentication (MFA) requirements.

## Overview

When an API call returns a 401 status with a WWW-Authenticate header indicating additional authentication requirements (such as mandatory MFA), you can use the challenges API to obtain a session that satisfies those requirements.

## Usage Example

```typescript
import * as vscode from 'vscode';

async function callApiWithChallengeHandling() {
    try {
        // First, try with a regular session
        let session = await vscode.authentication.getSession('microsoft', ['https://graph.microsoft.com/User.Read'], { createIfNone: true });
        
        // Make API call
        const response = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
                'Authorization': `Bearer ${session.accessToken}`
            }
        });
        
        if (response.status === 401) {
            // Check if there's a WWW-Authenticate header with challenges
            const wwwAuthenticate = response.headers.get('WWW-Authenticate');
            if (wwwAuthenticate) {
                // Use the challenges API to get a new session
                const challenge: vscode.AuthenticationSessionChallenge = {
                    challenge: wwwAuthenticate,
                    scopes: ['https://graph.microsoft.com/User.Read']
                };
                
                session = await vscode.authentication.getSession('microsoft', challenge, { createIfNone: true });
                
                // Retry the API call with the new session
                const retryResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
                    headers: {
                        'Authorization': `Bearer ${session.accessToken}`
                    }
                });
                
                return await retryResponse.json();
            }
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}
```

## Common WWW-Authenticate Headers

### Insufficient Claims (MFA Required)
```
WWW-Authenticate: Bearer realm="", authorization_uri="https://login.microsoftonline.com/common/oauth2/authorize", error="insufficient_claims", claims="eyJhY2Nlc3NfdG9rZW4iOnsiYWNycyI6eyJlc3NlbnRpYWwiOnRydWUsInZhbHVlcyI6WyJwMSJdfX19"
```

### Additional Scopes Required  
```
WWW-Authenticate: Bearer realm="", scope="https://graph.microsoft.com/.default", error="insufficient_scope"
```

## API Reference

### `AuthenticationSessionChallenge`
```typescript
interface AuthenticationSessionChallenge {
    /**
     * The raw WWW-Authenticate header value that triggered this challenge.
     */
    readonly challenge: string;
    
    /**
     * Optional scopes for the session. If not provided, the authentication provider
     * may use default scopes or extract them from the challenge.
     */
    readonly scopes?: readonly string[];
}
```

### `AuthenticationChallenge`
```typescript
interface AuthenticationChallenge {
    /**
     * The authentication scheme (e.g., 'Bearer').
     */
    readonly scheme: string;
    
    /**
     * Parameters for the authentication challenge.
     * For Bearer challenges, this may include 'claims', 'scope', 'realm', etc.
     */
    readonly params: Record<string, string>;
}
```

### Extended `getSession` API
```typescript
function getSession(
    providerId: string, 
    challenge: AuthenticationSessionChallenge, 
    options: AuthenticationGetSessionOptions & { createIfNone: true }
): Thenable<AuthenticationSession>;

function getSession(
    providerId: string, 
    challenge: AuthenticationSessionChallenge, 
    options?: AuthenticationGetSessionOptions
): Thenable<AuthenticationSession | undefined>;
```

## Provider Implementation

Authentication providers can implement challenge support by extending their provider with these methods:

```typescript
interface AuthenticationProviderWithChallenges extends AuthenticationProvider {
    getSessionsFromChallenges(
        challenges: readonly AuthenticationChallenge[], 
        options: AuthenticationProviderSessionOptions
    ): Thenable<readonly AuthenticationSession[]>;
    
    createSessionFromChallenges(
        challenges: readonly AuthenticationChallenge[], 
        options: AuthenticationProviderSessionOptions
    ): Thenable<AuthenticationSession>;
}
```

## Enabling the API

This API is currently proposed. To use it, add the following to your `package.json`:

```json
{
    "enabledApiProposals": ["authenticationChallenges"]
}
```