/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as crypto from 'crypto';

export const SLACK_AUTH_PROVIDER_ID = 'slack';

const SLACK_AUTH_PROVIDER_LABEL = 'Slack';
const SESSIONS_SECRET_KEY = 'slack.sessions';

// These values come from the slack app
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || '';
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || '';

// Deployed the oauth-redirect/index.html to Vercel
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI || '';

const SLACK_SCOPES = [
    'channels:history',
    'channels:read',
    'groups:history',
    'groups:read',
    'users:read'
].join(',');

// Pending authentication state
interface PendingAuth {
    resolve: (access_token: string) => void;
    reject: (error: Error) => void;
}

interface ITokenFetchResponse {
    ok: boolean;
    access_token: string;
    error?: string;
}

interface IUserInfoFetchResponse {
    ok: boolean;
    user_id: string;
    user: string;
    error?: string;
}

export class SlackAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {

    private _sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
    private _disposable: vscode.Disposable;
    private _sessions: vscode.AuthenticationSession[] = [];
    private _pendingAuth: PendingAuth | undefined;
    private _initialSessionLoad: Promise<void>;

    constructor(private readonly context: vscode.ExtensionContext) {
        this._disposable = vscode.Disposable.from(
            vscode.authentication.registerAuthenticationProvider(
                SLACK_AUTH_PROVIDER_ID,
                SLACK_AUTH_PROVIDER_LABEL,
                this,
                { supportsMultipleAccounts: false }
            ),
            // Register URI handler for OAuth callback
            vscode.window.registerUriHandler(this)
        );
        this._initialSessionLoad = this._loadSessionsOnStart();
    }

    // URI Handler implementation - handles vscode-insiders://vs-code-codereview.vs-code-codereview/callback
    public async handleUri(uri: vscode.Uri): Promise<void> {
        const query = new URLSearchParams(uri.query);
        const code = query.get('code');

        if (!this._pendingAuth) {
            vscode.window.showErrorMessage('No pending authentication request. Please try signing in again.');
            return;
        }
        if (code) {
            try {
                vscode.window.showInformationMessage('Completing Slack authentication...');
                const token = await this._exchangeCodeForToken(code);
                this._pendingAuth.resolve(token);
                vscode.window.showInformationMessage('Successfully signed in to Slack!');
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Token exchange failed';
                vscode.window.showErrorMessage(`Slack authentication failed: ${errorMessage}`);
                this._pendingAuth.reject(err instanceof Error ? err : new Error(errorMessage));
            }
            this._pendingAuth = undefined;
        }
    }

    get onDidChangeSessions(): vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent> {
        return this._sessionChangeEmitter.event;
    }

    async getSessions(): Promise<vscode.AuthenticationSession[]> {
        await this._initialSessionLoad;
        return this._sessions;
    }

    async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
        try {
            const token = await this._login();
            if (!token) {
                throw new Error('Slack login failed');
            }
            const userInfo = await this._getUserInfo(token);
            const session: vscode.AuthenticationSession = {
                id: crypto.randomUUID(),
                accessToken: token,
                account: {
                    id: userInfo.user_id,
                    label: userInfo.user
                },
                scopes: scopes as string[]
            };

            this._sessions.push(session);
            await this._storeSessions();
            this._sessionChangeEmitter.fire({
                added: [session],
                removed: [],
                changed: []
            });

            return session;
        } catch (error) {
            vscode.window.showErrorMessage(`Slack sign in failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    async removeSession(sessionId: string): Promise<void> {
        const sessionIndex = this._sessions.findIndex(s => s.id === sessionId);
        if (sessionIndex < 0) {
            return;
        }
        const removed = this._sessions.splice(sessionIndex, 1);
        await this._storeSessions();
        this._sessionChangeEmitter.fire({
            added: [],
            removed: removed,
            changed: []
        });
    }

    private async _login(): Promise<string | undefined> {
        return new Promise((resolve, reject) => {
            // Store the pending auth request
            this._pendingAuth = { resolve, reject };

            // Open the Slack authorization URL in the browser
            // Slack will redirect to SLACK_REDIRECT_URI
            // which will then redirect to vscode://vs-code-codereview.vs-code-codereview/callback
            const authUrl = `https://slack.com/oauth/v2/authorize?client_id=${SLACK_CLIENT_ID}&scope=${SLACK_SCOPES}&redirect_uri=${encodeURIComponent(SLACK_REDIRECT_URI)}`;
            vscode.env.openExternal(vscode.Uri.parse(authUrl));

            // Timeout after 5 minutes
            setTimeout(() => {
                if (this._pendingAuth) {
                    this._pendingAuth = undefined;
                    reject(new Error('Authentication timed out. Please try again.'));
                }
            }, 5 * 60 * 1000);
        });
    }

    private async _exchangeCodeForToken(code: string): Promise<string> {
        const response = await fetch('https://slack.com/api/oauth.v2.access', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: SLACK_CLIENT_ID,
                client_secret: SLACK_CLIENT_SECRET,
                code: code,
                redirect_uri: SLACK_REDIRECT_URI
            })
        });
        const data = await response.json() as ITokenFetchResponse;
        if (!data.ok) {
            throw new Error(data.error || 'Failed to exchange code for token');
        }
        return data.access_token;
    }

    private async _getUserInfo(token: string): Promise<{ user_id: string; user: string }> {
        const response = await fetch('https://slack.com/api/auth.test', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json() as IUserInfoFetchResponse;
        if (!data.ok) {
            throw new Error(data.error || 'Failed to get user info');
        }
        return {
            user_id: data.user_id,
            user: data.user
        };
    }

    private async _loadSessionsOnStart(): Promise<void> {
        return this._loadSessions().then((sessions: vscode.AuthenticationSession[]) => {
            this._sessions = sessions;
            if (this._sessions.length > 0) {
                this._sessionChangeEmitter.fire({
                    added: this._sessions,
                    removed: [],
                    changed: []
                });
            }
        });
    }

    private async _loadSessions(): Promise<vscode.AuthenticationSession[]> {
        const sessionsJson = await this.context.secrets.get(SESSIONS_SECRET_KEY);
        if (!sessionsJson) {
            return [];
        }
        try {
            return JSON.parse(sessionsJson);
        } catch {
            return [];
        }
    }

    private async _storeSessions(): Promise<void> {
        await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(this._sessions));
    }

    dispose(): void {
        this._disposable.dispose();
    }
}
