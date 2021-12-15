/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
import * as vscode from 'vscode';
import fetch, { Response } from 'node-fetch';
import { v4 as uuid } from 'uuid';
import { PromiseAdapter, promiseFromEvent } from './common/utils';
import { ExperimentationTelemetry } from './experimentationService';
import { AuthProviderType } from './github';
import { Log } from './common/logger';

const localize = nls.loadMessageBundle();
const CLIENT_ID = '01ab8ac9400c4e429b23';

const NETWORK_ERROR = 'network error';
const AUTH_RELAY_SERVER = 'vscode-auth.github.com';
// const AUTH_RELAY_STAGING_SERVER = 'client-auth-staging-14a768b.herokuapp.com';

class UriEventHandler extends vscode.EventEmitter<vscode.Uri> implements vscode.UriHandler {
	constructor(private readonly Logger: Log) {
		super();
	}

	public handleUri(uri: vscode.Uri) {
		this.Logger.trace('Handling Uri...');
		this.fire(uri);
	}
}

function parseQuery(uri: vscode.Uri) {
	return uri.query.split('&').reduce((prev: any, current) => {
		const queryString = current.split('=');
		prev[queryString[0]] = queryString[1];
		return prev;
	}, {});
}

export interface IGitHubServer extends vscode.Disposable {
	login(scopes: string): Promise<string>;
	getUserInfo(token: string): Promise<{ id: string, accountName: string }>;
	sendAdditionalTelemetryInfo(token: string): Promise<void>;
	friendlyName: string;
	type: AuthProviderType;
}

interface IGitHubDeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	interval: number;
}

async function getScopes(token: string, serverUri: vscode.Uri, logger: Log): Promise<string[]> {
	try {
		logger.info('Getting token scopes...');
		const result = await fetch(serverUri.toString(), {
			headers: {
				Authorization: `token ${token}`,
				'User-Agent': 'Visual-Studio-Code'
			}
		});

		if (result.ok) {
			const scopes = result.headers.get('X-OAuth-Scopes');
			return scopes ? scopes.split(',').map(scope => scope.trim()) : [];
		} else {
			logger.error(`Getting scopes failed: ${result.statusText}`);
			throw new Error(result.statusText);
		}
	} catch (ex) {
		logger.error(ex.message);
		throw new Error(NETWORK_ERROR);
	}
}

async function getUserInfo(token: string, serverUri: vscode.Uri, logger: Log): Promise<{ id: string, accountName: string }> {
	let result: Response;
	try {
		logger.info('Getting user info...');
		result = await fetch(serverUri.toString(), {
			headers: {
				Authorization: `token ${token}`,
				'User-Agent': 'Visual-Studio-Code'
			}
		});
	} catch (ex) {
		logger.error(ex.message);
		throw new Error(NETWORK_ERROR);
	}

	if (result.ok) {
		const json = await result.json();
		logger.info('Got account info!');
		return { id: json.id, accountName: json.login };
	} else {
		logger.error(`Getting account info failed: ${result.statusText}`);
		throw new Error(result.statusText);
	}
}

export class GitHubServer implements IGitHubServer {
	friendlyName = 'GitHub';
	type = AuthProviderType.github;
	private _statusBarItem: vscode.StatusBarItem | undefined;
	private _onDidManuallyProvideToken = new vscode.EventEmitter<string | undefined>();

	private _pendingStates = new Map<string, string[]>();
	private _codeExchangePromises = new Map<string, { promise: Promise<string>, cancel: vscode.EventEmitter<void> }>();
	private _statusBarCommandId = `${this.type}.provide-manually`;
	private _disposable: vscode.Disposable;
	private _uriHandler = new UriEventHandler(this._logger);

	constructor(private readonly _supportDeviceCodeFlow: boolean, private readonly _logger: Log, private readonly _telemetryReporter: ExperimentationTelemetry) {
		this._disposable = vscode.Disposable.from(
			vscode.commands.registerCommand(this._statusBarCommandId, () => this.manuallyProvideUri()),
			vscode.window.registerUriHandler(this._uriHandler));
	}

	dispose() {
		this._disposable.dispose();
	}

	private isTestEnvironment(url: vscode.Uri): boolean {
		return /\.azurewebsites\.net$/.test(url.authority) || url.authority.startsWith('localhost:');
	}

	// TODO@joaomoreno TODO@TylerLeonhardt
	private async isNoCorsEnvironment(): Promise<boolean> {
		const uri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.github-authentication/dummy`));
		return (uri.scheme === 'https' && /^((insiders\.)?vscode|github)\./.test(uri.authority)) || (uri.scheme === 'http' && /^localhost/.test(uri.authority));
	}

	public async login(scopes: string): Promise<string> {
		this._logger.info(`Logging in for the following scopes: ${scopes}`);

		const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.github-authentication/did-authenticate`));

		if (this.isTestEnvironment(callbackUri)) {
			let token: string | undefined;
			if (this._supportDeviceCodeFlow) {
				try {
					token = await this.doDeviceCodeFlow(scopes);
				} catch (ex) {
					this._logger.error(ex.message);
				}
			} else {
				token = await vscode.window.showInputBox({ prompt: 'GitHub Personal Access Token', ignoreFocusOut: true });
			}

			if (!token) { throw new Error('Sign in failed: No token provided'); }

			const tokenScopes = await getScopes(token, this.getServerUri('/'), this._logger); // Example: ['repo', 'user']
			const scopesList = scopes.split(' '); // Example: 'read:user repo user:email'
			if (!scopesList.every(scope => {
				const included = tokenScopes.includes(scope);
				if (included || !scope.includes(':')) {
					return included;
				}

				return scope.split(':').some(splitScopes => {
					return tokenScopes.includes(splitScopes);
				});
			})) {
				throw new Error(`The provided token does not match the requested scopes: ${scopes}`);
			}

			return token;
		}

		this.updateStatusBarItem(true);

		const state = uuid();
		const existingStates = this._pendingStates.get(scopes) || [];
		this._pendingStates.set(scopes, [...existingStates, state]);

		const uri = vscode.Uri.parse(`https://${AUTH_RELAY_SERVER}/authorize/?callbackUri=${encodeURIComponent(callbackUri.toString())}&scope=${scopes}&state=${state}&responseType=code&authServer=https://github.com`);
		await vscode.env.openExternal(uri);

		// Register a single listener for the URI callback, in case the user starts the login process multiple times
		// before completing it.
		let codeExchangePromise = this._codeExchangePromises.get(scopes);
		if (!codeExchangePromise) {
			codeExchangePromise = promiseFromEvent(this._uriHandler.event, this.exchangeCodeForToken(scopes));
			this._codeExchangePromises.set(scopes, codeExchangePromise);
		}

		return Promise.race([
			codeExchangePromise.promise,
			promiseFromEvent<string | undefined, string>(this._onDidManuallyProvideToken.event, (token: string | undefined, resolve, reject): void => {
				if (!token) {
					reject('Cancelled');
				} else {
					resolve(token);
				}
			}).promise,
			new Promise<string>((_, reject) => setTimeout(() => reject('Cancelled'), 60000))
		]).finally(() => {
			this._pendingStates.delete(scopes);
			codeExchangePromise?.cancel.fire();
			this._codeExchangePromises.delete(scopes);
			this.updateStatusBarItem(false);
		});
	}

	private async doDeviceCodeFlow(scopes: string): Promise<string> {
		const uri = `https://github.com/login/device/code?client_id=${CLIENT_ID}&scope=${scopes}`;
		const result = await fetch(uri, {
			method: 'POST',
			headers: {
				Accept: 'application/json'
			}
		});
		if (!result.ok) {
			throw new Error(`Failed to get device code: ${await result.text()}`);
		}

		const json = await result.json() as IGitHubDeviceCodeResponse;

		await vscode.env.clipboard.writeText(json.user_code);

		const modalResult = await vscode.window.showInformationMessage(
			localize('code.title', "Your Code: {0}", json.user_code),
			{
				modal: true,
				detail: localize('code.detail', "The above one-time code has been copied to your clipboard. Continue to {0}  to finish authenticating?", json.verification_uri)
			}, 'OK');

		if (modalResult !== 'OK') {
			throw new Error('Cancelled');
		}

		const uriToOpen = await vscode.env.asExternalUri(vscode.Uri.parse(json.verification_uri));
		await vscode.env.openExternal(uriToOpen);

		return await vscode.window.withProgress<string>({
			location: vscode.ProgressLocation.Notification,
			cancellable: true,
			title: localize('progress', "• Code: {0} • Url: {1} • Polling GitHub to finish authenticating", json.user_code, json.verification_uri)
		}, async (progress, token) => {
			return await this.waitForDeviceCodeAccessToken(json, progress, token);
		});
	}

	private async waitForDeviceCodeAccessToken(
		json: IGitHubDeviceCodeResponse,
		progress: vscode.Progress<{ message?: string | undefined; increment?: number | undefined; }>,
		token: vscode.CancellationToken
	): Promise<string> {

		const refreshTokenUri = `https://github.com/login/oauth/access_token?client_id=${CLIENT_ID}&device_code=${json.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`;
		const attempts = 120 / json.interval;
		for (let i = 0; i < attempts; i++) {
			await new Promise(resolve => setTimeout(resolve, json.interval * 1000));
			progress.report({ message: localize('progress.update', "attempt {0} of {1}", i + 1, attempts + 1) });
			if (token.isCancellationRequested) {
				throw new Error(localize('cancelled', "Cancelled"));
			}
			let accessTokenResult;
			try {
				accessTokenResult = await fetch(refreshTokenUri, {
					method: 'POST',
					headers: {
						Accept: 'application/json'
					}
				});
			} catch {
				continue;
			}

			if (!accessTokenResult.ok) {
				continue;
			}

			const accessTokenJson = await accessTokenResult.json();

			if (accessTokenJson.error === 'authorization_pending') {
				continue;
			}

			if (accessTokenJson.error) {
				throw new Error(accessTokenJson.error_description);
			}

			return accessTokenJson.access_token;
		}

		throw new Error('Failed to get access token');
	}

	private exchangeCodeForToken: (scopes: string) => PromiseAdapter<vscode.Uri, string> =
		(scopes) => async (uri, resolve, reject) => {
			const query = parseQuery(uri);
			const code = query.code;

			const acceptedStates = this._pendingStates.get(scopes) || [];
			if (!acceptedStates.includes(query.state)) {
				// A common scenario of this happening is if you:
				// 1. Trigger a sign in with one set of scopes
				// 2. Before finishing 1, you trigger a sign in with a different set of scopes
				// In this scenario we should just return and wait for the next UriHandler event
				// to run as we are probably still waiting on the user to hit 'Continue'
				this._logger.info('State not found in accepted state. Skipping this execution...');
				return;
			}

			const url = `https://${AUTH_RELAY_SERVER}/token?code=${code}&state=${query.state}`;
			this._logger.info('Exchanging code for token...');

			try {
				const result = await fetch(url, {
					method: 'POST',
					headers: {
						Accept: 'application/json'
					}
				});

				if (result.ok) {
					const json = await result.json();
					this._logger.info('Token exchange success!');
					resolve(json.access_token);
				} else {
					reject(result.statusText);
				}
			} catch (ex) {
				reject(ex);
			}
		};

	private getServerUri(path: string = '') {
		const apiUri = vscode.Uri.parse('https://api.github.com');
		return vscode.Uri.parse(`${apiUri.scheme}://${apiUri.authority}${path}`);
	}

	private updateStatusBarItem(isStart?: boolean) {
		if (isStart && !this._statusBarItem) {
			this._statusBarItem = vscode.window.createStatusBarItem('status.git.signIn', vscode.StatusBarAlignment.Left);
			this._statusBarItem.name = localize('status.git.signIn.name', "GitHub Sign-in");
			this._statusBarItem.text = localize('signingIn', "$(mark-github) Signing in to github.com...");
			this._statusBarItem.command = this._statusBarCommandId;
			this._statusBarItem.show();
		}

		if (!isStart && this._statusBarItem) {
			this._statusBarItem.dispose();
			this._statusBarItem = undefined;
		}
	}

	private async manuallyProvideUri() {
		const uri = await vscode.window.showInputBox({
			prompt: 'Uri',
			ignoreFocusOut: true,
			validateInput(value) {
				if (!value) {
					return undefined;
				}
				const error = localize('validUri', "Please enter a valid Uri from the GitHub login page.");
				try {
					const uri = vscode.Uri.parse(value.trim());
					if (!uri.scheme || uri.scheme === 'file') {
						return error;
					}
				} catch (e) {
					return error;
				}
				return undefined;
			}
		});
		if (!uri) {
			return;
		}

		this._uriHandler.handleUri(vscode.Uri.parse(uri.trim()));
	}

	public getUserInfo(token: string): Promise<{ id: string, accountName: string }> {
		return getUserInfo(token, this.getServerUri('/user'), this._logger);
	}

	public async sendAdditionalTelemetryInfo(token: string): Promise<void> {
		if (!vscode.env.isTelemetryEnabled) {
			return;
		}
		const nocors = await this.isNoCorsEnvironment();

		if (nocors) {
			return;
		}

		try {
			const result = await fetch('https://education.github.com/api/user', {
				headers: {
					Authorization: `token ${token}`,
					'faculty-check-preview': 'true',
					'User-Agent': 'Visual-Studio-Code'
				}
			});

			if (result.ok) {
				const json: { student: boolean, faculty: boolean } = await result.json();

				/* __GDPR__
					"session" : {
						"isEdu": { "classification": "NonIdentifiableDemographicInfo", "purpose": "FeatureInsight" }
					}
				*/
				this._telemetryReporter.sendTelemetryEvent('session', {
					isEdu: json.student
						? 'student'
						: json.faculty
							? 'faculty'
							: 'none'
				});
			}
		} catch (e) {
			// No-op
		}
	}

	public async checkEnterpriseVersion(token: string): Promise<void> {
		try {

			const result = await fetch(this.getServerUri('/meta').toString(), {
				headers: {
					Authorization: `token ${token}`,
					'User-Agent': 'Visual-Studio-Code'
				}
			});

			if (!result.ok) {
				return;
			}

			const json: { verifiable_password_authentication: boolean, installed_version: string } = await result.json();

			/* __GDPR__
				"ghe-session" : {
					"version": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this._telemetryReporter.sendTelemetryEvent('ghe-session', {
				version: json.installed_version
			});
		} catch {
			// No-op
		}
	}
}

export class GitHubEnterpriseServer implements IGitHubServer {
	friendlyName = 'GitHub Enterprise';
	type = AuthProviderType.githubEnterprise;

	private _onDidManuallyProvideToken = new vscode.EventEmitter<string | undefined>();
	private _statusBarCommandId = `github-enterprise.provide-manually`;
	private _disposable: vscode.Disposable;

	constructor(private readonly _logger: Log, private readonly telemetryReporter: ExperimentationTelemetry) {
		this._disposable = vscode.commands.registerCommand(this._statusBarCommandId, async () => {
			const token = await vscode.window.showInputBox({ prompt: 'Token', ignoreFocusOut: true });
			this._onDidManuallyProvideToken.fire(token);
		});
	}

	dispose() {
		this._disposable.dispose();
	}

	public async login(scopes: string): Promise<string> {
		this._logger.info(`Logging in for the following scopes: ${scopes}`);

		const token = await vscode.window.showInputBox({ prompt: 'GitHub Personal Access Token', ignoreFocusOut: true });
		if (!token) { throw new Error('Sign in failed: No token provided'); }

		const tokenScopes = await getScopes(token, this.getServerUri('/'), this._logger); // Example: ['repo', 'user']
		const scopesList = scopes.split(' '); // Example: 'read:user repo user:email'
		if (!scopesList.every(scope => {
			const included = tokenScopes.includes(scope);
			if (included || !scope.includes(':')) {
				return included;
			}

			return scope.split(':').some(splitScopes => {
				return tokenScopes.includes(splitScopes);
			});
		})) {
			throw new Error(`The provided token does not match the requested scopes: ${scopes}`);
		}

		return token;
	}

	private getServerUri(path: string = '') {
		const apiUri = vscode.Uri.parse(vscode.workspace.getConfiguration('github-enterprise').get<string>('uri') || '', true);
		return vscode.Uri.parse(`${apiUri.scheme}://${apiUri.authority}/api/v3${path}`);
	}

	public async getUserInfo(token: string): Promise<{ id: string, accountName: string }> {
		return getUserInfo(token, this.getServerUri('/user'), this._logger);
	}

	public async sendAdditionalTelemetryInfo(token: string): Promise<void> {
		try {

			const result = await fetch(this.getServerUri('/meta').toString(), {
				headers: {
					Authorization: `token ${token}`,
					'User-Agent': 'Visual-Studio-Code'
				}
			});

			if (!result.ok) {
				return;
			}

			const json: { verifiable_password_authentication: boolean, installed_version: string } = await result.json();

			/* __GDPR__
				"ghe-session" : {
					"version": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryReporter.sendTelemetryEvent('ghe-session', {
				version: json.installed_version
			});
		} catch {
			// No-op
		}
	}
}
