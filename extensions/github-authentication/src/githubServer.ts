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
import { isSupportedEnvironment } from './common/env';

const localize = nls.loadMessageBundle();
const CLIENT_ID = '01ab8ac9400c4e429b23';
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
// TODO: change to stable when that happens
const GITHUB_TOKEN_URL = 'https://vscode.dev/codeExchangeProxyEndpoints/github/login/oauth/access_token';
const NETWORK_ERROR = 'network error';

const REDIRECT_URL_STABLE = 'https://vscode.dev/redirect';
const REDIRECT_URL_INSIDERS = 'https://insiders.vscode.dev/redirect';

class UriEventHandler extends vscode.EventEmitter<vscode.Uri> implements vscode.UriHandler {
	constructor(private readonly Logger: Log) {
		super();
	}

	public handleUri(uri: vscode.Uri) {
		this.Logger.trace('Handling Uri...');
		this.fire(uri);
	}
}

export interface IGitHubServer extends vscode.Disposable {
	login(scopes: string): Promise<string>;
	getUserInfo(token: string): Promise<{ id: string; accountName: string }>;
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

async function getUserInfo(token: string, serverUri: vscode.Uri, logger: Log): Promise<{ id: string; accountName: string }> {
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
		// either display the response message or the http status text
		let errorMessage = result.statusText;
		try {
			const json = await result.json();
			if (json.message) {
				errorMessage = json.message;
			}
		} catch (err) {
			// noop
		}
		logger.error(`Getting account info failed: ${errorMessage}`);
		throw new Error(errorMessage);
	}
}

export class GitHubServer implements IGitHubServer {
	friendlyName = 'GitHub';
	type = AuthProviderType.github;
	private _onDidManuallyProvideToken = new vscode.EventEmitter<string | undefined>();

	private _pendingNonces = new Map<string, string[]>();
	private _codeExchangePromises = new Map<string, { promise: Promise<string>; cancel: vscode.EventEmitter<void> }>();
	private _disposable: vscode.Disposable;
	private _uriHandler = new UriEventHandler(this._logger);

	constructor(private readonly _supportDeviceCodeFlow: boolean, private readonly _logger: Log, private readonly _telemetryReporter: ExperimentationTelemetry) {
		this._disposable = vscode.window.registerUriHandler(this._uriHandler);
	}

	dispose() {
		this._disposable.dispose();
	}

	// TODO@joaomoreno TODO@TylerLeonhardt
	private async isNoCorsEnvironment(): Promise<boolean> {
		const uri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.github-authentication/dummy`));
		return (uri.scheme === 'https' && /^((insiders\.)?vscode|github)\./.test(uri.authority)) || (uri.scheme === 'http' && /^localhost/.test(uri.authority));
	}

	public async login(scopes: string): Promise<string> {
		this._logger.info(`Logging in for the following scopes: ${scopes}`);

		const nonce = uuid();
		const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.github-authentication/did-authenticate?nonce=${encodeURIComponent(nonce)}`));

		if (!isSupportedEnvironment(callbackUri)) {
			const token = this._supportDeviceCodeFlow
				? await this.doDeviceCodeFlow(scopes)
				: await vscode.window.showInputBox({ prompt: 'GitHub Personal Access Token', ignoreFocusOut: true });

			if (!token) { throw new Error('No token provided'); }

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

		const existingNonces = this._pendingNonces.get(scopes) || [];
		this._pendingNonces.set(scopes, [...existingNonces, nonce]);

		const proxyEndpoints: { [providerId: string]: string } | undefined = await vscode.commands.executeCommand('workbench.getCodeExchangeProxyEndpoints');
		// If we are running in insiders vscode.dev, then ensure we use the redirect route on that.
		const redirectUri = proxyEndpoints?.github?.includes('https://insiders.vscode.dev') ? REDIRECT_URL_INSIDERS : REDIRECT_URL_STABLE;
		const searchParams = new URLSearchParams([
			['client_id', CLIENT_ID],
			['redirect_uri', redirectUri],
			['scope', scopes],
			['state', encodeURIComponent(callbackUri.toString(true))]
		]);
		const uri = vscode.Uri.parse(`${GITHUB_AUTHORIZE_URL}?${searchParams.toString()}`);

		return vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: localize('signingIn', " $(mark-github) Signing in to github.com..."),
		}, async () => {
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
				this._pendingNonces.delete(scopes);
				codeExchangePromise?.cancel.fire();
				this._codeExchangePromises.delete(scopes);
			});
		});
	}

	private async doDeviceCodeFlow(scopes: string): Promise<string> {
		// Get initial device code
		const uri = `https://github.com/login/device/code?client_id=${CLIENT_ID}&scope=${scopes}`;
		const result = await fetch(uri, {
			method: 'POST',
			headers: {
				Accept: 'application/json'
			}
		});
		if (!result.ok) {
			throw new Error(`Failed to get one-time code: ${await result.text()}`);
		}

		const json = await result.json() as IGitHubDeviceCodeResponse;


		const modalResult = await vscode.window.showInformationMessage(
			localize('code.title', "Your Code: {0}", json.user_code),
			{
				modal: true,
				detail: localize('code.detail', "To finish authenticating, navigate to GitHub and paste in the above one-time code.")
			}, 'Copy & Continue to GitHub');

		if (modalResult !== 'Copy & Continue to GitHub') {
			throw new Error('Cancelled');
		}

		await vscode.env.clipboard.writeText(json.user_code);

		const uriToOpen = await vscode.env.asExternalUri(vscode.Uri.parse(json.verification_uri));
		await vscode.env.openExternal(uriToOpen);

		return await vscode.window.withProgress<string>({
			location: vscode.ProgressLocation.Notification,
			cancellable: true,
			title: localize(
				'progress',
				"Open [{0}]({0}) in a new tab and paste your one-time code: {1}",
				json.verification_uri,
				json.user_code)
		}, async (_, token) => {
			return await this.waitForDeviceCodeAccessToken(json, token);
		});
	}

	private async waitForDeviceCodeAccessToken(
		json: IGitHubDeviceCodeResponse,
		token: vscode.CancellationToken
	): Promise<string> {

		const refreshTokenUri = `https://github.com/login/oauth/access_token?client_id=${CLIENT_ID}&device_code=${json.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`;

		// Try for 2 minutes
		const attempts = 120 / json.interval;
		for (let i = 0; i < attempts; i++) {
			await new Promise(resolve => setTimeout(resolve, json.interval * 1000));
			if (token.isCancellationRequested) {
				throw new Error('Cancelled');
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

		throw new Error('Cancelled');
	}

	private exchangeCodeForToken: (scopes: string) => PromiseAdapter<vscode.Uri, string> =
		(scopes) => async (uri, resolve, reject) => {
			const query = new URLSearchParams(uri.query);
			const code = query.get('code');

			const acceptedNonces = this._pendingNonces.get(scopes) || [];
			const nonce = query.get('nonce');
			if (!nonce) {
				this._logger.error('No nonce in response.');
				return;
			}
			if (!acceptedNonces.includes(nonce)) {
				// A common scenario of this happening is if you:
				// 1. Trigger a sign in with one set of scopes
				// 2. Before finishing 1, you trigger a sign in with a different set of scopes
				// In this scenario we should just return and wait for the next UriHandler event
				// to run as we are probably still waiting on the user to hit 'Continue'
				this._logger.info('Nonce not found in accepted nonces. Skipping this execution...');
				return;
			}

			this._logger.info('Exchanging code for token...');

			const proxyEndpoints: { [providerId: string]: string } | undefined = await vscode.commands.executeCommand('workbench.getCodeExchangeProxyEndpoints');
			const endpointUrl = proxyEndpoints?.github ? `${proxyEndpoints.github}/login/oauth/access_token` : GITHUB_TOKEN_URL;

			try {
				const body = `code=${code}`;
				const result = await fetch(endpointUrl, {
					method: 'POST',
					headers: {
						Accept: 'application/json',
						'Content-Type': 'application/x-www-form-urlencoded',
						'Content-Length': body.toString()

					},
					body
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

	public getUserInfo(token: string): Promise<{ id: string; accountName: string }> {
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
				const json: { student: boolean; faculty: boolean } = await result.json();

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

			const json: { verifiable_password_authentication: boolean; installed_version: string } = await result.json();

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

	constructor(private readonly _logger: Log, private readonly telemetryReporter: ExperimentationTelemetry) { }

	dispose() { }

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

	public async getUserInfo(token: string): Promise<{ id: string; accountName: string }> {
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

			const json: { verifiable_password_authentication: boolean; installed_version: string } = await result.json();

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
