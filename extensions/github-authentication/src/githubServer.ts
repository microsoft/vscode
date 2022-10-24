/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import fetch, { Response } from 'node-fetch';
import { v4 as uuid } from 'uuid';
import { PromiseAdapter, promiseFromEvent } from './common/utils';
import { ExperimentationTelemetry } from './experimentationService';
import { AuthProviderType } from './github';
import { Log } from './common/logger';
import { isSupportedEnvironment } from './common/env';
import { LoopbackAuthServer } from './authServer';
import path = require('path');

const CLIENT_ID = '01ab8ac9400c4e429b23';
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

export class GitHubServer implements IGitHubServer {
	readonly friendlyName: string;

	private _pendingNonces = new Map<string, string[]>();
	private _codeExchangePromises = new Map<string, { promise: Promise<string>; cancel: vscode.EventEmitter<void> }>();
	private _disposable: vscode.Disposable | undefined;
	private static _uriHandler: UriEventHandler | undefined;
	private _redirectEndpoint: string | undefined;

	constructor(
		public readonly type: AuthProviderType,
		private readonly _supportDeviceCodeFlow: boolean,
		private readonly _logger: Log,
		private readonly _telemetryReporter: ExperimentationTelemetry
	) {
		this.friendlyName = type === AuthProviderType.github ? 'GitHub' : 'GitHub Enterprise';

		if (!GitHubServer._uriHandler) {
			GitHubServer._uriHandler = new UriEventHandler(this._logger);
			this._disposable = vscode.window.registerUriHandler(GitHubServer._uriHandler);
		}
	}

	get baseUri() {
		if (this.type === AuthProviderType.github) {
			return vscode.Uri.parse('https://github.com/');
		}
		return vscode.Uri.parse(vscode.workspace.getConfiguration('github-enterprise').get<string>('uri') || '', true);
	}

	private async getRedirectEndpoint(): Promise<string> {
		if (this._redirectEndpoint) {
			return this._redirectEndpoint;
		}
		if (this.type === AuthProviderType.github) {
			const proxyEndpoints = await vscode.commands.executeCommand<{ [providerId: string]: string } | undefined>('workbench.getCodeExchangeProxyEndpoints');
			// If we are running in insiders vscode.dev, then ensure we use the redirect route on that.
			this._redirectEndpoint = REDIRECT_URL_STABLE;
			if (proxyEndpoints?.github && new URL(proxyEndpoints.github).hostname === 'insiders.vscode.dev') {
				this._redirectEndpoint = REDIRECT_URL_INSIDERS;
			}
			return this._redirectEndpoint;
		} else {
			// GHES
			const result = await fetch(this.getServerUri('/meta').toString(true));
			if (result.ok) {
				try {
					const json: { installed_version: string } = await result.json();
					const [majorStr, minorStr, _patch] = json.installed_version.split('.');
					const major = Number(majorStr);
					const minor = Number(minorStr);
					if (major >= 4 || major === 3 && minor >= 8
					) {
						// GHES 3.8 and above used vscode.dev/redirect as the route.
						// It only supports a single redirect endpoint, so we can't use
						// insiders.vscode.dev/redirect when we're running in Insiders, unfortunately.
						this._redirectEndpoint = 'https://vscode.dev/redirect';
					}
				} catch (e) {
					this._logger.error(e);
				}
			}

			// TODO in like 1 year change the default vscode.dev/redirect maybe
			this._redirectEndpoint = 'https://vscode-auth.github.com/';
		}
		return this._redirectEndpoint;
	}

	dispose() {
		this._disposable?.dispose();
	}

	// TODO@joaomoreno TODO@TylerLeonhardt
	private async isNoCorsEnvironment(): Promise<boolean> {
		const uri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.github-authentication/dummy`));
		return (uri.scheme === 'https' && /^((insiders\.)?vscode|github)\./.test(uri.authority)) || (uri.scheme === 'http' && /^localhost/.test(uri.authority));
	}

	public async login(scopes: string): Promise<string> {
		this._logger.info(`Logging in for the following scopes: ${scopes}`);

		// Used for showing a friendlier message to the user when the explicitly cancel a flow.
		let userCancelled: boolean | undefined;
		const yes = vscode.l10n.t('Yes');
		const no = vscode.l10n.t('No');
		const promptToContinue = async () => {
			if (userCancelled === undefined) {
				// We haven't had a failure yet so wait to prompt
				return;
			}
			const message = userCancelled
				? vscode.l10n.t('Having trouble logging in? Would you like to try a different way?')
				: vscode.l10n.t('You have not yet finished authorizing this extension to use GitHub. Would you like to keep trying?');
			const result = await vscode.window.showWarningMessage(message, yes, no);
			if (result !== yes) {
				throw new Error('Cancelled');
			}
		};

		const nonce = uuid();
		const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.github-authentication/did-authenticate?nonce=${encodeURIComponent(nonce)}`));

		const supported = isSupportedEnvironment(callbackUri);
		if (supported) {
			try {
				return await this.doLoginWithoutLocalServer(scopes, nonce, callbackUri);
			} catch (e) {
				this._logger.error(e);
				userCancelled = e.message ?? e === 'User Cancelled';
			}
		}

		// Starting a local server isn't supported in web
		if (vscode.env.uiKind === vscode.UIKind.Desktop) {
			try {
				await promptToContinue();
				return await this.doLoginWithLocalServer(scopes);
			} catch (e) {
				this._logger.error(e);
				userCancelled = e.message ?? e === 'User Cancelled';
			}
		}

		if (this._supportDeviceCodeFlow) {
			try {
				await promptToContinue();
				return await this.doLoginDeviceCodeFlow(scopes);
			} catch (e) {
				this._logger.error(e);
				userCancelled = e.message ?? e === 'User Cancelled';
			}
		} else if (!supported) {
			try {
				await promptToContinue();
				return await this.doLoginWithPat(scopes);
			} catch (e) {
				this._logger.error(e);
				userCancelled = e.message ?? e === 'User Cancelled';
			}
		}

		throw new Error(userCancelled ? 'Cancelled' : 'No auth flow succeeded.');
	}

	private async doLoginWithoutLocalServer(scopes: string, nonce: string, callbackUri: vscode.Uri): Promise<string> {
		this._logger.info(`Trying without local server... (${scopes})`);
		return await vscode.window.withProgress<string>({
			location: vscode.ProgressLocation.Notification,
			title: vscode.l10n.t({
				message: 'Signing in to {0}...',
				args: [this.baseUri.authority],
				comment: ['The {0} will be a url, e.g. github.com']
			}),
			cancellable: true
		}, async (_, token) => {
			const existingNonces = this._pendingNonces.get(scopes) || [];
			this._pendingNonces.set(scopes, [...existingNonces, nonce]);
			const redirectUri = await this.getRedirectEndpoint();
			const searchParams = new URLSearchParams([
				['client_id', CLIENT_ID],
				['redirect_uri', redirectUri],
				['scope', scopes],
				['state', encodeURIComponent(callbackUri.toString(true))]
			]);

			const uri = vscode.Uri.parse(this.baseUri.with({
				path: '/login/oauth/authorize',
				query: searchParams.toString()
			}).toString(true));
			await vscode.env.openExternal(uri);

			// Register a single listener for the URI callback, in case the user starts the login process multiple times
			// before completing it.
			let codeExchangePromise = this._codeExchangePromises.get(scopes);
			if (!codeExchangePromise) {
				codeExchangePromise = promiseFromEvent(GitHubServer._uriHandler!.event, this.handleUri(scopes));
				this._codeExchangePromises.set(scopes, codeExchangePromise);
			}

			try {
				return await Promise.race([
					codeExchangePromise.promise,
					new Promise<string>((_, reject) => setTimeout(() => reject('Timed out'), 300_000)), // 5min timeout
					promiseFromEvent<any, any>(token.onCancellationRequested, (_, __, reject) => { reject('User Cancelled'); }).promise
				]);
			} finally {
				this._pendingNonces.delete(scopes);
				codeExchangePromise?.cancel.fire();
				this._codeExchangePromises.delete(scopes);
			}
		});
	}

	private async doLoginWithLocalServer(scopes: string): Promise<string> {
		this._logger.info(`Trying with local server... (${scopes})`);
		return await vscode.window.withProgress<string>({
			location: vscode.ProgressLocation.Notification,
			title: vscode.l10n.t({
				message: 'Signing in to {0}...',
				args: [this.baseUri.authority],
				comment: ['The {0} will be a url, e.g. github.com']
			}),
			cancellable: true
		}, async (_, token) => {
			const redirectUri = await this.getRedirectEndpoint();
			const searchParams = new URLSearchParams([
				['client_id', CLIENT_ID],
				['redirect_uri', redirectUri],
				['scope', scopes],
			]);

			const loginUrl = this.baseUri.with({
				path: '/login/oauth/authorize',
				query: searchParams.toString()
			});
			const server = new LoopbackAuthServer(path.join(__dirname, '../media'), loginUrl.toString(true));
			const port = await server.start();

			let codeToExchange;
			try {
				vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${port}/signin?nonce=${encodeURIComponent(server.nonce)}`));
				const { code } = await Promise.race([
					server.waitForOAuthResponse(),
					new Promise<any>((_, reject) => setTimeout(() => reject('Timed out'), 300_000)), // 5min timeout
					promiseFromEvent<any, any>(token.onCancellationRequested, (_, __, reject) => { reject('User Cancelled'); }).promise
				]);
				codeToExchange = code;
			} finally {
				setTimeout(() => {
					void server.stop();
				}, 5000);
			}

			const accessToken = await this.exchangeCodeForToken(codeToExchange);
			return accessToken;
		});
	}

	private async doLoginDeviceCodeFlow(scopes: string): Promise<string> {
		this._logger.info(`Trying device code flow... (${scopes})`);

		// Get initial device code
		const uri = this.baseUri.with({
			path: '/login/device/code',
			query: `client_id=${CLIENT_ID}&scope=${scopes}`
		});
		const result = await fetch(uri.toString(true), {
			method: 'POST',
			headers: {
				Accept: 'application/json'
			}
		});
		if (!result.ok) {
			throw new Error(`Failed to get one-time code: ${await result.text()}`);
		}

		const json = await result.json() as IGitHubDeviceCodeResponse;

		const button = vscode.l10n.t('Copy & Continue to GitHub');
		const modalResult = await vscode.window.showInformationMessage(
			vscode.l10n.t({ message: 'Your Code: {0}', args: [json.user_code], comment: ['The {0} will be a code, e.g. 123-456'] }),
			{
				modal: true,
				detail: vscode.l10n.t('To finish authenticating, navigate to GitHub and paste in the above one-time code.')
			}, button);

		if (modalResult !== button) {
			throw new Error('User Cancelled');
		}

		await vscode.env.clipboard.writeText(json.user_code);

		const uriToOpen = await vscode.env.asExternalUri(vscode.Uri.parse(json.verification_uri));
		await vscode.env.openExternal(uriToOpen);

		return await this.waitForDeviceCodeAccessToken(json);
	}

	private async doLoginWithPat(scopes: string): Promise<string> {
		this._logger.info(`Trying to retrieve PAT... (${scopes})`);
		const token = await vscode.window.showInputBox({ prompt: 'GitHub Personal Access Token', ignoreFocusOut: true });
		if (!token) { throw new Error('User Cancelled'); }

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

	private async waitForDeviceCodeAccessToken(
		json: IGitHubDeviceCodeResponse,
	): Promise<string> {
		return await vscode.window.withProgress<string>({
			location: vscode.ProgressLocation.Notification,
			cancellable: true,
			title: vscode.l10n.t({
				message: 'Open [{0}]({0}) in a new tab and paste your one-time code: {1}',
				args: [json.verification_uri, json.user_code],
				comment: [
					'The [{0}]({0}) will be a url and the {1} will be a code, e.g. 123-456',
					'{Locked="[{0}]({0})"}'
				]
			})
		}, async (_, token) => {
			const refreshTokenUri = this.baseUri.with({
				path: '/login/oauth/access_token',
				query: `client_id=${CLIENT_ID}&device_code=${json.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`
			});

			// Try for 2 minutes
			const attempts = 120 / json.interval;
			for (let i = 0; i < attempts; i++) {
				await new Promise(resolve => setTimeout(resolve, json.interval * 1000));
				if (token.isCancellationRequested) {
					throw new Error('User Cancelled');
				}
				let accessTokenResult;
				try {
					accessTokenResult = await fetch(refreshTokenUri.toString(true), {
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
		});
	}

	private handleUri: (scopes: string) => PromiseAdapter<vscode.Uri, string> =
		(scopes) => (uri, resolve, reject) => {
			const query = new URLSearchParams(uri.query);
			const code = query.get('code');
			const nonce = query.get('nonce');
			if (!code) {
				reject(new Error('No code'));
				return;
			}
			if (!nonce) {
				reject(new Error('No nonce'));
				return;
			}

			const acceptedNonces = this._pendingNonces.get(scopes) || [];
			if (!acceptedNonces.includes(nonce)) {
				// A common scenario of this happening is if you:
				// 1. Trigger a sign in with one set of scopes
				// 2. Before finishing 1, you trigger a sign in with a different set of scopes
				// In this scenario we should just return and wait for the next UriHandler event
				// to run as we are probably still waiting on the user to hit 'Continue'
				this._logger.info('Nonce not found in accepted nonces. Skipping this execution...');
				return;
			}

			resolve(this.exchangeCodeForToken(code));
		};

	private async exchangeCodeForToken(code: string): Promise<string> {
		this._logger.info('Exchanging code for token...');

		const proxyEndpoints: { [providerId: string]: string } | undefined = await vscode.commands.executeCommand('workbench.getCodeExchangeProxyEndpoints');
		const endpointUrl = proxyEndpoints?.github ? `${proxyEndpoints.github}login/oauth/access_token` : GITHUB_TOKEN_URL;

		const body = new URLSearchParams([['code', code]]);
		if (this.type === AuthProviderType.githubEnterprise) {
			body.append('github_enterprise', this.baseUri.toString(true));
			body.append('redirect_uri', await this.getRedirectEndpoint());
		}
		const result = await fetch(endpointUrl, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/x-www-form-urlencoded',
				'Content-Length': body.toString()

			},
			body: body.toString()
		});

		if (result.ok) {
			const json = await result.json();
			this._logger.info('Token exchange success!');
			return json.access_token;
		} else {
			const text = await result.text();
			const error = new Error(text);
			error.name = 'GitHubTokenExchangeError';
			throw error;
		}
	}

	private getServerUri(path: string = '') {
		if (this.type === AuthProviderType.github) {
			return vscode.Uri.parse('https://api.github.com').with({ path });
		}
		// GHES
		const apiUri = vscode.Uri.parse(vscode.workspace.getConfiguration('github-enterprise').get<string>('uri') || '', true);
		return vscode.Uri.parse(`${apiUri.scheme}://${apiUri.authority}/api/v3${path}`);
	}

	public async getUserInfo(token: string): Promise<{ id: string; accountName: string }> {
		let result: Response;
		try {
			this._logger.info('Getting user info...');
			result = await fetch(this.getServerUri('/user').toString(), {
				headers: {
					Authorization: `token ${token}`,
					'User-Agent': 'Visual-Studio-Code'
				}
			});
		} catch (ex) {
			this._logger.error(ex.message);
			throw new Error(NETWORK_ERROR);
		}

		if (result.ok) {
			try {
				const json = await result.json();
				this._logger.info('Got account info!');
				return { id: json.id, accountName: json.login };
			} catch (e) {
				this._logger.error(`Unexpected error parsing response from GitHub: ${e.message ?? e}`);
				throw e;
			}
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
			this._logger.error(`Getting account info failed: ${errorMessage}`);
			throw new Error(errorMessage);
		}
	}

	public async sendAdditionalTelemetryInfo(token: string): Promise<void> {
		if (!vscode.env.isTelemetryEnabled) {
			return;
		}
		const nocors = await this.isNoCorsEnvironment();

		if (nocors) {
			return;
		}

		if (this.type === AuthProviderType.github) {
			return await this.checkEduDetails(token);
		}

		// GHES
		await this.checkEnterpriseVersion(token);
	}

	private async checkEduDetails(token: string): Promise<void> {
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
						"owner": "TylerLeonhardt",
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

	private async checkEnterpriseVersion(token: string): Promise<void> {
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
					"owner": "TylerLeonhardt",
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
