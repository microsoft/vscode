/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { v4 as uuid } from 'uuid';
import { Keychain } from './common/keychain';
import { GitHubServer, uriHandler } from './githubServer';
import Logger from './common/logger';
import { arrayEquals } from './common/utils';
import { ExperimentationTelemetry } from './experimentationService';
import TelemetryReporter from 'vscode-extension-telemetry';

interface SessionData {
	id: string;
	account?: {
		label?: string;
		displayName?: string;
		id: string;
	}
	scopes: string[];
	accessToken: string;
}

export enum AuthProviderType {
	github = 'github',
	githubEnterprise = 'github-enterprise'
}

export class GitHubAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
	private _sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	private _githubServer: GitHubServer;
	private _telemetryReporter: ExperimentationTelemetry;

	private _keychain: Keychain;
	private _sessionsPromise: Promise<vscode.AuthenticationSession[]>;
	private _disposable: vscode.Disposable;

	constructor(private context: vscode.ExtensionContext, private type: AuthProviderType) {
		const { name, version, aiKey } = context.extension.packageJSON as { name: string, version: string, aiKey: string };
		this._telemetryReporter = new ExperimentationTelemetry(context, new TelemetryReporter(name, version, aiKey));

		this._keychain = new Keychain(context, `${type}.auth`);
		this._githubServer = new GitHubServer(type, this._telemetryReporter);

		// Contains the current state of the sessions we have available.
		this._sessionsPromise = this.readAndVerifySessions(true);

		const friendlyName = this.type === AuthProviderType.github ? 'GitHub' : 'GitHub Enterprise';
		this._disposable = vscode.Disposable.from(
			this._telemetryReporter,
			this.type === AuthProviderType.github ? vscode.window.registerUriHandler(uriHandler) : { dispose() { } },
			vscode.commands.registerCommand(`${this.type}.provide-token`, () => this.manuallyProvideToken()),
			vscode.authentication.registerAuthenticationProvider(this.type, friendlyName, this, { supportsMultipleAccounts: false }),
			this.context.secrets.onDidChange(() => this.checkForUpdates())
		);
	}

	dispose() {
		this._disposable.dispose();
	}

	get onDidChangeSessions() {
		return this._sessionChangeEmitter.event;
	}

	async getSessions(scopes?: string[]): Promise<vscode.AuthenticationSession[]> {
		Logger.info(`Getting sessions for ${scopes?.join(',') || 'all scopes'}...`);
		const sessions = await this._sessionsPromise;
		const finalSessions = scopes
			? sessions.filter(session => arrayEquals([...session.scopes].sort(), scopes.sort()))
			: sessions;

		Logger.info(`Got ${finalSessions.length} sessions for ${scopes?.join(',') || 'all scopes'}...`);
		return finalSessions;
	}

	private async afterTokenLoad(token: string): Promise<void> {
		if (this.type === AuthProviderType.github) {
			this._githubServer.checkIsEdu(token);
		}
		if (this.type === AuthProviderType.githubEnterprise) {
			this._githubServer.checkEnterpriseVersion(token);
		}
	}

	private async checkForUpdates() {
		const previousSessions = await this._sessionsPromise;
		this._sessionsPromise = this.readAndVerifySessions(false);
		const storedSessions = await this._sessionsPromise;

		const added: vscode.AuthenticationSession[] = [];
		const removed: vscode.AuthenticationSession[] = [];

		storedSessions.forEach(session => {
			const matchesExisting = previousSessions.some(s => s.id === session.id);
			// Another window added a session to the keychain, add it to our state as well
			if (!matchesExisting) {
				Logger.info('Adding session found in keychain');
				added.push(session);
			}
		});

		previousSessions.forEach(session => {
			const matchesExisting = storedSessions.some(s => s.id === session.id);
			// Another window has logged out, remove from our state
			if (!matchesExisting) {
				Logger.info('Removing session no longer found in keychain');
				removed.push(session);
			}
		});

		if (added.length || removed.length) {
			this._sessionChangeEmitter.fire({ added, removed, changed: [] });
		}
	}

	private async readAndVerifySessions(force: boolean): Promise<vscode.AuthenticationSession[]> {
		let sessionData: SessionData[];
		try {
			Logger.info('Reading sessions from keychain...');
			const storedSessions = await this._keychain.getToken() || await this._keychain.tryMigrate();
			if (!storedSessions) {
				return [];
			}
			Logger.info('Got stored sessions!');

			try {
				sessionData = JSON.parse(storedSessions);
			} catch (e) {
				await this._keychain.deleteToken();
				throw e;
			}
		} catch (e) {
			Logger.error(`Error reading token: ${e}`);
			return [];
		}

		const sessionPromises = sessionData.map(async (session: SessionData) => {
			let userInfo: { id: string, accountName: string } | undefined;
			if (force || !session.account) {
				try {
					userInfo = await this._githubServer.getUserInfo(session.accessToken);
					setTimeout(() => this.afterTokenLoad(session.accessToken), 1000);
					Logger.info(`Verified session with the following scopes: ${session.scopes}`);
				} catch (e) {
					// Remove sessions that return unauthorized response
					if (e.message === 'Unauthorized') {
						return undefined;
					}
				}
			}

			Logger.trace(`Read the following session from the keychain with the following scopes: ${session.scopes}`);
			return {
				id: session.id,
				account: {
					label: session.account
						? session.account.label ?? session.account.displayName ?? '<unknown>'
						: userInfo?.accountName ?? '<unknown>',
					id: session.account?.id ?? userInfo?.id ?? '<unknown>'
				},
				scopes: session.scopes,
				accessToken: session.accessToken
			};
		});

		const verifiedSessions = (await Promise.allSettled(sessionPromises))
			.filter(p => p.status === 'fulfilled')
			.map(p => (p as PromiseFulfilledResult<vscode.AuthenticationSession | undefined>).value)
			.filter(<T>(p?: T): p is T => Boolean(p));

		Logger.info(`Got ${verifiedSessions.length} verified sessions.`);
		if (verifiedSessions.length !== sessionData.length) {
			await this.storeSessions(verifiedSessions);
		}

		return verifiedSessions;
	}

	private async storeSessions(sessions: vscode.AuthenticationSession[]): Promise<void> {
		Logger.info(`Storing ${sessions.length} sessions...`);
		this._sessionsPromise = Promise.resolve(sessions);
		await this._keychain.setToken(JSON.stringify(sessions));
		Logger.info(`Stored ${sessions.length} sessions!`);
	}

	public async createSession(scopes: string[]): Promise<vscode.AuthenticationSession> {
		try {
			/* __GDPR__
				"login" : {
					"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
				}
			*/
			this._telemetryReporter?.sendTelemetryEvent('login', {
				scopes: JSON.stringify(scopes),
			});

			const token = await this._githubServer.login(scopes.join(' '));
			this.afterTokenLoad(token);
			const session = await this.tokenToSession(token, scopes);

			const sessions = await this._sessionsPromise;
			const sessionIndex = sessions.findIndex(s => s.id === session.id);
			if (sessionIndex > -1) {
				sessions.splice(sessionIndex, 1, session);
			} else {
				sessions.push(session);
			}
			await this.storeSessions(sessions);

			this._sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] });

			Logger.info('Login success!');

			return session;
		} catch (e) {
			// If login was cancelled, do not notify user.
			if (e === 'Cancelled') {
				/* __GDPR__
					"loginCancelled" : { }
				*/
				this._telemetryReporter?.sendTelemetryEvent('loginCancelled');
				throw e;
			}

			/* __GDPR__
				"loginFailed" : { }
			*/
			this._telemetryReporter?.sendTelemetryEvent('loginFailed');

			vscode.window.showErrorMessage(`Sign in failed: ${e}`);
			Logger.error(e);
			throw e;
		}
	}

	public async manuallyProvideToken(): Promise<void> {
		this._githubServer.manuallyProvideToken();
	}

	private async tokenToSession(token: string, scopes: string[]): Promise<vscode.AuthenticationSession> {
		const userInfo = await this._githubServer.getUserInfo(token);
		return {
			id: uuid(),
			accessToken: token,
			account: { label: userInfo.accountName, id: userInfo.id },
			scopes
		};
	}

	public async removeSession(id: string) {
		try {
			/* __GDPR__
				"logout" : { }
			*/
			this._telemetryReporter?.sendTelemetryEvent('logout');

			Logger.info(`Logging out of ${id}`);

			const sessions = await this._sessionsPromise;
			const sessionIndex = sessions.findIndex(session => session.id === id);
			if (sessionIndex > -1) {
				const session = sessions[sessionIndex];
				sessions.splice(sessionIndex, 1);

				await this.storeSessions(sessions);

				this._sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });
			} else {
				Logger.error('Session not found');
			}
		} catch (e) {
			/* __GDPR__
				"logoutFailed" : { }
			*/
			this._telemetryReporter?.sendTelemetryEvent('logoutFailed');

			vscode.window.showErrorMessage(`Sign out failed: ${e}`);
			Logger.error(e);
			throw e;
		}
	}
}
