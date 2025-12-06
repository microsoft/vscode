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
    'users:read',
    'im:history',
    'im:read'
].join(',');

// Pending authentication state
interface PendingAuth {
    resolve: (userInfo: IUserInfo) => void;
    reject: (error: Error) => void;
}

interface IUserInfo {
    token: string;
    userId: string;
}

interface ITokenFetchResponse {
    ok: boolean;
    authed_user: {
        id: string;
        access_token: string;
    };
    error?: string;
}

interface ISlackUserProfile {
    ok: boolean;
    user: {
        id: string;
        name: string;
    };
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
                const userInfo = await this._exchangeCodeForTokenAndID(code);
                this._pendingAuth.resolve(userInfo);
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
            const userInfo = await this._login();
            if (!userInfo) {
                throw new Error('Slack login failed');
            }
            const userName = await this._getUserName(userInfo);
            const session: vscode.AuthenticationSession = {
                id: crypto.randomUUID(),
                accessToken: userInfo.token,
                account: {
                    id: userInfo.userId,
                    label: userName
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

    private async _login(): Promise<IUserInfo | undefined> {
        return new Promise((resolve, reject) => {
            // Store the pending auth request
            this._pendingAuth = { resolve, reject };

            // Open the Slack authorization URL in the browser
            // Slack will redirect to SLACK_REDIRECT_URI
            // which will then redirect to vscode://vs-code-codereview.vs-code-codereview/callback
            const authUrl = `https://slack.com/oauth/v2/authorize?client_id=${SLACK_CLIENT_ID}&user_scope=${SLACK_SCOPES}&redirect_uri=${encodeURIComponent(SLACK_REDIRECT_URI)}`;
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

    private async _exchangeCodeForTokenAndID(code: string): Promise<IUserInfo> {
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
        return {
            token: data.authed_user.access_token,
            userId: data.authed_user.id
        };
    }

    private async _getUserName(userInfo: IUserInfo): Promise<string> {
        const userResponse = await fetch(`https://slack.com/api/users.info?user=${userInfo.userId}`, {
            headers: {
                'Authorization': `Bearer ${userInfo.token}`
            }
        });
        const userData = await userResponse.json() as ISlackUserProfile;
        if (!userData.ok) {
            return 'Slack Code Review Extension';
        }
        return userData.user.name;
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
