/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { SESSIONS_SECRET_KEY, SLACK_AUTH_PROVIDER_ID, SLACK_AUTH_PROVIDER_LABEL, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_URI, SLACK_SCOPES } from './authVariables';

interface IPendingAuthentication {
    resolve: (userInfo: IUserCredentials) => void;
    reject: (error: Error) => void;
}

interface IUserCredentials {
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

interface IUserFetchResponse {
    ok: boolean;
    user: {
        id: string;
        name: string;
    };
    error?: string;
}

export class SlackAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {

    private _onDidChangeSessions: vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent> = new vscode.EventEmitter();
    public onDidChangeSessions: vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent> = this._onDidChangeSessions.event;

    private _disposables: vscode.Disposable;
    private _sessions: Promise<vscode.AuthenticationSession[]> | vscode.AuthenticationSession[] = [];
    private _pendingAuth: IPendingAuthentication | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {
        this._disposables = vscode.Disposable.from(
            vscode.authentication.registerAuthenticationProvider(
                SLACK_AUTH_PROVIDER_ID,
                SLACK_AUTH_PROVIDER_LABEL,
                this,
                { supportsMultipleAccounts: false }
            ),
            vscode.window.registerUriHandler(this)
        );
        this._sessions = this._loadSessionsOnStart();
    }

    // URI Handler handles vscode-insiders://vs-code-codereview.vs-code-codereview/callback
    public async handleUri(uri: vscode.Uri): Promise<void> {
        const query = new URLSearchParams(uri.query);
        const code = query.get('code');

        if (!this._pendingAuth) {
            vscode.window.showErrorMessage('No pending authentication request. Please try signing in again.');
            return;
        }
        if (!code) {
            vscode.window.showErrorMessage('Error with the callback. Please try signing in again.');
            return;
        }
        try {
            vscode.window.showInformationMessage('Completing Slack authentication...');
            const userCredentials = await this._exchangeCodeForCredentials(code);
            this._pendingAuth.resolve(userCredentials);
            vscode.window.showInformationMessage('Successfully signed in to Slack!');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Token exchange failed';
            vscode.window.showErrorMessage(`Slack authentication failed: ${errorMessage}`);
            this._pendingAuth.reject(new Error(errorMessage));
        }
        this._pendingAuth = undefined;
    }

    public async getSessions(): Promise<vscode.AuthenticationSession[]> {
        return this._sessions;
    }

    public async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
        try {
            const sessions = await this._sessions;
            const userCredentials = await this._login();
            if (!userCredentials) {
                throw new Error('Slack login failed');
            }
            const name = await this._getUserName(userCredentials);
            const session: vscode.AuthenticationSession = {
                id: crypto.randomUUID(),
                accessToken: userCredentials.token,
                account: {
                    id: userCredentials.userId,
                    label: name
                },
                scopes
            };
            sessions.push(session);
            await this._updateSessions(sessions);
            this._onDidChangeSessions.fire({
                added: [session],
                removed: [],
                changed: []
            });
            return session;
        } catch (error) {
            vscode.window.showErrorMessage(`Slack sign in failed: ${error.message}`);
            throw error;
        }
    }

    public async removeSession(sessionId: string): Promise<void> {
        const sessions = await this._sessions;
        const sessionIndex = sessions.findIndex(s => s.id === sessionId);
        if (sessionIndex < 0) {
            return;
        }
        const removed = sessions.splice(sessionIndex, 1);
        await this._updateSessions(sessions);
        this._onDidChangeSessions.fire({
            added: [],
            removed: removed,
            changed: []
        });
    }

    private async _login(): Promise<IUserCredentials | undefined> {
        return new Promise((resolve, reject) => {
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

    private async _exchangeCodeForCredentials(code: string): Promise<IUserCredentials> {
        const response = await fetch('https://slack.com/api/oauth.v2.access', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                code,
                client_id: SLACK_CLIENT_ID,
                client_secret: SLACK_CLIENT_SECRET,
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

    private async _getUserName(userInfo: IUserCredentials): Promise<string> {
        const userResponse = await fetch(`https://slack.com/api/users.info?user=${userInfo.userId}`, {
            headers: {
                'Authorization': `Bearer ${userInfo.token}`
            }
        });
        const userData = await userResponse.json() as IUserFetchResponse;
        if (!userData.ok) {
            return 'Slack Code Review';
        }
        return userData.user.name;
    }

    private async _loadSessionsOnStart(): Promise<vscode.AuthenticationSession[]> {
        return this._loadSessions().then((sessions: vscode.AuthenticationSession[]) => {
            this._sessions = sessions;
            if (this._sessions.length > 0) {
                this._onDidChangeSessions.fire({
                    added: this._sessions,
                    removed: [],
                    changed: []
                });
            }
            return sessions;
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

    private async _updateSessions(sessions: vscode.AuthenticationSession[]): Promise<void> {
        this._sessions = sessions;
        await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(sessions));
    }

    dispose(): void {
        this._disposables.dispose();
    }
}
