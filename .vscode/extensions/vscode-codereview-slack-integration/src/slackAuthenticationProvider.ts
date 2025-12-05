/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as crypto from 'crypto';

const SLACK_AUTH_PROVIDER_ID = 'slack';
const SLACK_AUTH_PROVIDER_LABEL = 'Slack';
const SESSIONS_SECRET_KEY = 'slack.sessions';

// You need to create a Slack App and configure these values
// Get these from https://api.slack.com/apps
// Set these environment variables before running the extension
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || '';
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || '';

// IMPORTANT: Deploy the oauth-redirect/index.html to a hosting service (Vercel, Netlify, GitHub Pages)
// and update this URL to your deployed redirect page
// Example: 'https://your-app.vercel.app/callback' or 'https://your-username.github.io/slack-oauth-redirect'
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
    resolve: (value: { access_token: string; team: string }) => void;
    reject: (error: Error) => void;
    state: string;
}

export class SlackAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
    private _sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
    private _disposable: vscode.Disposable;
    private _sessions: vscode.AuthenticationSession[] = [];
    private _pendingAuth: PendingAuth | undefined;
    private _sessionsLoaded: boolean = false;

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

        // Load existing sessions from secret storage immediately
        this.loadSessions().then(() => {
            // Notify VS Code about existing sessions
            if (this._sessions.length > 0) {
                this._sessionChangeEmitter.fire({
                    added: this._sessions,
                    removed: [],
                    changed: []
                });
            }
        });
    }

    // URI Handler implementation - handles vscode-insiders://vs-code-codereview.vs-code-codereview/callback
    async handleUri(uri: vscode.Uri): Promise<void> {
        const query = new URLSearchParams(uri.query);
        const code = query.get('code');
        const state = query.get('state');
        const error = query.get('error');

        if (!this._pendingAuth) {
            vscode.window.showErrorMessage('No pending authentication request. Please try signing in again.');
            return;
        }

        // Verify state to prevent CSRF attacks
        if (state !== this._pendingAuth.state) {
            this._pendingAuth.reject(new Error('Invalid state parameter - possible CSRF attack'));
            this._pendingAuth = undefined;
            return;
        }

        if (error) {
            vscode.window.showErrorMessage(`Slack authentication failed: ${error}`);
            this._pendingAuth.reject(new Error(error));
            this._pendingAuth = undefined;
            return;
        }

        if (code) {
            try {
                vscode.window.showInformationMessage('Completing Slack authentication...');
                const tokenResponse = await this.exchangeCodeForToken(code);
                this._pendingAuth.resolve(tokenResponse);
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
        // Ensure sessions are loaded
        if (!this._sessionsLoaded) {
            await this.loadSessions();
        }
        return this._sessions;
    }

    async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
        try {
            const token = await this.login();
            if (!token) {
                throw new Error('Slack login failed');
            }

            // Get user info to populate the session
            const userInfo = await this.getUserInfo(token.access_token);

            const session: vscode.AuthenticationSession = {
                id: crypto.randomUUID(),
                accessToken: token.access_token,
                account: {
                    id: userInfo.user_id,
                    label: `${userInfo.real_name} (${userInfo.team})`
                },
                scopes: scopes as string[]
            };

            this._sessions.push(session);
            await this.storeSessions();

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
        if (sessionIndex > -1) {
            const removed = this._sessions.splice(sessionIndex, 1);
            await this.storeSessions();

            this._sessionChangeEmitter.fire({
                added: [],
                removed: removed,
                changed: []
            });
        }
    }

    private async login(): Promise<{ access_token: string; team: string } | undefined> {
        // Generate a random state for CSRF protection
        const state = crypto.randomBytes(32).toString('hex');

        return new Promise((resolve, reject) => {
            // Store the pending auth request
            this._pendingAuth = { resolve, reject, state };

            // Open the Slack authorization URL in the browser
            // Slack will redirect to SLACK_REDIRECT_URI (your hosted redirect page)
            // which will then redirect to vscode://vs-code-codereview.vs-code-codereview/callback
            const authUrl = `https://slack.com/oauth/v2/authorize?client_id=${SLACK_CLIENT_ID}&scope=${SLACK_SCOPES}&redirect_uri=${encodeURIComponent(SLACK_REDIRECT_URI)}&state=${state}`;
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

    private async exchangeCodeForToken(code: string): Promise<{ access_token: string; team: string }> {
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

        const data = await response.json() as {
            ok: boolean;
            error?: string;
            access_token?: string;
            team?: { name: string };
        };

        if (!data.ok) {
            throw new Error(data.error || 'Failed to exchange code for token');
        }

        return {
            access_token: data.access_token!,
            team: data.team?.name || 'Unknown Team'
        };
    }

    private async getUserInfo(token: string): Promise<{ user_id: string; user: string; real_name: string; team: string }> {
        const response = await fetch('https://slack.com/api/auth.test', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json() as {
            ok: boolean;
            error?: string;
            user_id?: string;
            user?: string;
            team?: string;
        };

        if (!data.ok) {
            throw new Error(data.error || 'Failed to get user info');
        }

        // Fetch additional user details for real name
        let realName = data.user || 'Unknown User';
        try {
            const userResponse = await fetch(`https://slack.com/api/users.info?user=${data.user_id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const userData = await userResponse.json() as {
                ok: boolean;
                user?: { real_name?: string; profile?: { real_name?: string } };
            };
            if (userData.ok && userData.user) {
                realName = userData.user.real_name || userData.user.profile?.real_name || data.user || 'Unknown User';
            }
        } catch {
            // Fall back to username if user info fetch fails
        }

        return {
            user_id: data.user_id!,
            user: data.user!,
            real_name: realName,
            team: data.team || 'Slack'
        };
    }

    private async loadSessions(): Promise<void> {
        const sessionsJson = await this.context.secrets.get(SESSIONS_SECRET_KEY);
        if (sessionsJson) {
            try {
                this._sessions = JSON.parse(sessionsJson);
            } catch {
                this._sessions = [];
            }
        }
        this._sessionsLoaded = true;
    }

    private async storeSessions(): Promise<void> {
        await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(this._sessions));
    }

    dispose(): void {
        this._disposable.dispose();
    }
}

export const SLACK_AUTH_PROVIDER_ID_EXPORT = SLACK_AUTH_PROVIDER_ID;
