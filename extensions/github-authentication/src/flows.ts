/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ProgressLocation, Uri, commands, env, l10n, window } from 'vscode';
import { Log } from './common/logger';
import { Config } from './config';
import { UriEventHandler } from './github';
import { fetching } from './node/fetch';
import { LoopbackAuthServer } from './node/authServer';
import { promiseFromEvent } from './common/utils';
import { isHostedGitHubEnterprise } from './common/env';
import { NETWORK_ERROR, TIMED_OUT_ERROR, USER_CANCELLATION_ERROR } from './common/errors';

interface IGitHubDeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	interval: number;
}

interface IFlowOptions {
	// GitHub.com
	readonly supportsGitHubDotCom: boolean;
	// A GitHub Enterprise Server that is hosted by an organization
	readonly supportsGitHubEnterpriseServer: boolean;
	// A GitHub Enterprise Server that is hosted by GitHub for an organization
	readonly supportsHostedGitHubEnterprise: boolean;

	// Runtimes - there are constraints on which runtimes support which flows
	readonly supportsWebWorkerExtensionHost: boolean;
	readonly supportsRemoteExtensionHost: boolean;

	// Clients - see `isSupportedClient` in `common/env.ts` for what constitutes a supported client
	readonly supportsSupportedClients: boolean;
	readonly supportsUnsupportedClients: boolean;

	// Configurations - some flows require a client secret
	readonly supportsNoClientSecret: boolean;
}

export const enum GitHubTarget {
	DotCom,
	Enterprise,
	HostedEnterprise
}

export const enum ExtensionHost {
	WebWorker,
	Remote,
	Local
}

interface IFlowQuery {
	target: GitHubTarget;
	extensionHost: ExtensionHost;
	isSupportedClient: boolean;
}

interface IFlowTriggerOptions {
	scopes: string;
	baseUri: Uri;
	logger: Log;
	redirectUri: Uri;
	nonce: string;
	callbackUri: Uri;
	uriHandler: UriEventHandler;
	enterpriseUri?: Uri;
}

interface IFlow {
	label: string;
	options: IFlowOptions;
	trigger(options: IFlowTriggerOptions): Promise<string>;
}

async function exchangeCodeForToken(
	logger: Log,
	endpointUri: Uri,
	redirectUri: Uri,
	code: string,
	enterpriseUri?: Uri
): Promise<string> {
	logger.info('Exchanging code for token...');

	const clientSecret = Config.gitHubClientSecret;
	if (!clientSecret) {
		throw new Error('No client secret configured for GitHub authentication.');
	}

	const body = new URLSearchParams([
		['code', code],
		['client_id', Config.gitHubClientId],
		['redirect_uri', redirectUri.toString(true)],
		['client_secret', clientSecret]
	]);
	if (enterpriseUri) {
		body.append('github_enterprise', enterpriseUri.toString(true));
	}
	const result = await fetching(endpointUri.toString(true), {
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
		logger.info('Token exchange success!');
		return json.access_token;
	} else {
		const text = await result.text();
		const error = new Error(text);
		error.name = 'GitHubTokenExchangeError';
		throw error;
	}
}

const allFlows: IFlow[] = [
	new class UrlHandlerFlow implements IFlow {
		label = l10n.t('url handler');
		options: IFlowOptions = {
			supportsGitHubDotCom: true,
			// Supporting GHES would be challenging because different versions
			// used a different client ID. We could try to detect the version
			// and use the right one, but that's a lot of work when we have
			// other flows that work well.
			supportsGitHubEnterpriseServer: false,
			supportsHostedGitHubEnterprise: true,
			supportsRemoteExtensionHost: true,
			supportsWebWorkerExtensionHost: true,
			// exchanging a code for a token requires a client secret
			supportsNoClientSecret: false,
			supportsSupportedClients: true,
			supportsUnsupportedClients: false
		};

		async trigger({
			scopes,
			baseUri,
			redirectUri,
			logger,
			nonce,
			callbackUri,
			uriHandler,
			enterpriseUri
		}: IFlowTriggerOptions): Promise<string> {
			logger.info(`Trying without local server... (${scopes})`);
			return await window.withProgress<string>({
				location: ProgressLocation.Notification,
				title: l10n.t({
					message: 'Signing in to {0}...',
					args: [baseUri.authority],
					comment: ['The {0} will be a url, e.g. github.com']
				}),
				cancellable: true
			}, async (_, token) => {
				const promise = uriHandler.waitForCode(logger, scopes, nonce, token);

				const searchParams = new URLSearchParams([
					['client_id', Config.gitHubClientId],
					['redirect_uri', redirectUri.toString(true)],
					['scope', scopes],
					['state', encodeURIComponent(callbackUri.toString(true))]
				]);

				// The extra toString, parse is apparently needed for env.openExternal
				// to open the correct URL.
				const uri = Uri.parse(baseUri.with({
					path: '/login/oauth/authorize',
					query: searchParams.toString()
				}).toString(true));
				await env.openExternal(uri);

				const code = await promise;

				const proxyEndpoints: { [providerId: string]: string } | undefined = await commands.executeCommand('workbench.getCodeExchangeProxyEndpoints');
				const endpointUrl = proxyEndpoints?.github
					? Uri.parse(`${proxyEndpoints.github}login/oauth/access_token`)
					: baseUri.with({ path: '/login/oauth/access_token' });

				const accessToken = await exchangeCodeForToken(logger, endpointUrl, redirectUri, code, enterpriseUri);
				return accessToken;
			});
		}
	},
	new class LocalServerFlow implements IFlow {
		label = l10n.t('local server');
		options: IFlowOptions = {
			supportsGitHubDotCom: true,
			// Supporting GHES would be challenging because different versions
			// used a different client ID. We could try to detect the version
			// and use the right one, but that's a lot of work when we have
			// other flows that work well.
			supportsGitHubEnterpriseServer: false,
			supportsHostedGitHubEnterprise: true,
			supportsRemoteExtensionHost: true,
			// Web worker can't open a port to listen for the redirect
			supportsWebWorkerExtensionHost: false,
			// exchanging a code for a token requires a client secret
			supportsNoClientSecret: false,
			supportsSupportedClients: true,
			supportsUnsupportedClients: true
		};
		async trigger({
			scopes,
			baseUri,
			redirectUri,
			logger,
			enterpriseUri
		}: IFlowTriggerOptions): Promise<string> {
			logger.info(`Trying with local server... (${scopes})`);
			return await window.withProgress<string>({
				location: ProgressLocation.Notification,
				title: l10n.t({
					message: 'Signing in to {0}...',
					args: [baseUri.authority],
					comment: ['The {0} will be a url, e.g. github.com']
				}),
				cancellable: true
			}, async (_, token) => {
				const searchParams = new URLSearchParams([
					['client_id', Config.gitHubClientId],
					['redirect_uri', redirectUri.toString(true)],
					['scope', scopes],
				]);

				const loginUrl = baseUri.with({
					path: '/login/oauth/authorize',
					query: searchParams.toString()
				});
				const server = new LoopbackAuthServer(path.join(__dirname, '../media'), loginUrl.toString(true));
				const port = await server.start();

				let codeToExchange;
				try {
					env.openExternal(Uri.parse(`http://127.0.0.1:${port}/signin?nonce=${encodeURIComponent(server.nonce)}`));
					const { code } = await Promise.race([
						server.waitForOAuthResponse(),
						new Promise<any>((_, reject) => setTimeout(() => reject(TIMED_OUT_ERROR), 300_000)), // 5min timeout
						promiseFromEvent<any, any>(token.onCancellationRequested, (_, __, reject) => { reject(USER_CANCELLATION_ERROR); }).promise
					]);
					codeToExchange = code;
				} finally {
					setTimeout(() => {
						void server.stop();
					}, 5000);
				}

				const accessToken = await exchangeCodeForToken(
					logger,
					baseUri.with({ path: '/login/oauth/access_token' }),
					redirectUri,
					codeToExchange,
					enterpriseUri);
				return accessToken;
			});
		}
	},
	new class DeviceCodeFlow implements IFlow {
		label = l10n.t('device code');
		options: IFlowOptions = {
			supportsGitHubDotCom: true,
			supportsGitHubEnterpriseServer: true,
			supportsHostedGitHubEnterprise: true,
			supportsRemoteExtensionHost: true,
			// CORS prevents this from working in web workers
			supportsWebWorkerExtensionHost: false,
			supportsNoClientSecret: true,
			supportsSupportedClients: true,
			supportsUnsupportedClients: true
		};
		async trigger({ scopes, baseUri, logger }: IFlowTriggerOptions) {
			logger.info(`Trying device code flow... (${scopes})`);

			// Get initial device code
			const uri = baseUri.with({
				path: '/login/device/code',
				query: `client_id=${Config.gitHubClientId}&scope=${scopes}`
			});
			const result = await fetching(uri.toString(true), {
				method: 'POST',
				headers: {
					Accept: 'application/json'
				}
			});
			if (!result.ok) {
				throw new Error(`Failed to get one-time code: ${await result.text()}`);
			}

			const json = await result.json() as IGitHubDeviceCodeResponse;

			const button = l10n.t('Copy & Continue to GitHub');
			const modalResult = await window.showInformationMessage(
				l10n.t({ message: 'Your Code: {0}', args: [json.user_code], comment: ['The {0} will be a code, e.g. 123-456'] }),
				{
					modal: true,
					detail: l10n.t('To finish authenticating, navigate to GitHub and paste in the above one-time code.')
				}, button);

			if (modalResult !== button) {
				throw new Error(USER_CANCELLATION_ERROR);
			}

			await env.clipboard.writeText(json.user_code);

			const uriToOpen = await env.asExternalUri(Uri.parse(json.verification_uri));
			await env.openExternal(uriToOpen);

			return await this.waitForDeviceCodeAccessToken(baseUri, json);
		}

		private async waitForDeviceCodeAccessToken(
			baseUri: Uri,
			json: IGitHubDeviceCodeResponse,
		): Promise<string> {
			return await window.withProgress<string>({
				location: ProgressLocation.Notification,
				cancellable: true,
				title: l10n.t({
					message: 'Open [{0}]({0}) in a new tab and paste your one-time code: {1}',
					args: [json.verification_uri, json.user_code],
					comment: [
						'The [{0}]({0}) will be a url and the {1} will be a code, e.g. 123-456',
						'{Locked="[{0}]({0})"}'
					]
				})
			}, async (_, token) => {
				const refreshTokenUri = baseUri.with({
					path: '/login/oauth/access_token',
					query: `client_id=${Config.gitHubClientId}&device_code=${json.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`
				});

				// Try for 2 minutes
				const attempts = 120 / json.interval;
				for (let i = 0; i < attempts; i++) {
					await new Promise(resolve => setTimeout(resolve, json.interval * 1000));
					if (token.isCancellationRequested) {
						throw new Error(USER_CANCELLATION_ERROR);
					}
					let accessTokenResult;
					try {
						accessTokenResult = await fetching(refreshTokenUri.toString(true), {
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

				throw new Error(TIMED_OUT_ERROR);
			});
		}
	},
	new class PatFlow implements IFlow {
		label = l10n.t('personal access token');
		options: IFlowOptions = {
			supportsGitHubDotCom: true,
			supportsGitHubEnterpriseServer: true,
			supportsHostedGitHubEnterprise: true,
			supportsRemoteExtensionHost: true,
			supportsWebWorkerExtensionHost: true,
			supportsNoClientSecret: true,
			// PATs can't be used with Settings Sync so we don't enable this flow
			// for supported clients
			supportsSupportedClients: false,
			supportsUnsupportedClients: true
		};

		async trigger({ scopes, baseUri, logger, enterpriseUri }: IFlowTriggerOptions) {
			logger.info(`Trying to retrieve PAT... (${scopes})`);

			const button = l10n.t('Continue to GitHub');
			const modalResult = await window.showInformationMessage(
				l10n.t('Continue to GitHub to create a Personal Access Token (PAT)'),
				{
					modal: true,
					detail: l10n.t('To finish authenticating, navigate to GitHub to create a PAT then paste the PAT into the input box.')
				}, button);

			if (modalResult !== button) {
				throw new Error(USER_CANCELLATION_ERROR);
			}

			const description = `${env.appName} (${scopes})`;
			const uriToOpen = await env.asExternalUri(baseUri.with({ path: '/settings/tokens/new', query: `description=${description}&scopes=${scopes.split(' ').join(',')}` }));
			await env.openExternal(uriToOpen);
			const token = await window.showInputBox({ placeHolder: `ghp_1a2b3c4...`, prompt: `GitHub Personal Access Token - ${scopes}`, ignoreFocusOut: true });
			if (!token) { throw new Error(USER_CANCELLATION_ERROR); }

			const appUri = !enterpriseUri || isHostedGitHubEnterprise(enterpriseUri)
				? Uri.parse(`${baseUri.scheme}://api.${baseUri.authority}`)
				: Uri.parse(`${baseUri.scheme}://${baseUri.authority}/api/v3`);

			const tokenScopes = await this.getScopes(token, appUri, logger); // Example: ['repo', 'user']
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

		private async getScopes(token: string, serverUri: Uri, logger: Log): Promise<string[]> {
			try {
				logger.info('Getting token scopes...');
				const result = await fetching(serverUri.toString(), {
					headers: {
						Authorization: `token ${token}`,
						'User-Agent': `${env.appName} (${env.appHost})`
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
	}
];

export function getFlows(query: IFlowQuery) {
	return allFlows.filter(flow => {
		let useFlow: boolean = true;
		switch (query.target) {
			case GitHubTarget.DotCom:
				useFlow &&= flow.options.supportsGitHubDotCom;
				break;
			case GitHubTarget.Enterprise:
				useFlow &&= flow.options.supportsGitHubEnterpriseServer;
				break;
			case GitHubTarget.HostedEnterprise:
				useFlow &&= flow.options.supportsHostedGitHubEnterprise;
				break;
		}

		switch (query.extensionHost) {
			case ExtensionHost.Remote:
				useFlow &&= flow.options.supportsRemoteExtensionHost;
				break;
			case ExtensionHost.WebWorker:
				useFlow &&= flow.options.supportsWebWorkerExtensionHost;
				break;
		}

		if (!Config.gitHubClientSecret) {
			useFlow &&= flow.options.supportsNoClientSecret;
		}

		if (query.isSupportedClient) {
			// TODO: revisit how we support PAT in GHES but not DotCom... but this works for now since
			// there isn't another flow that has supportsSupportedClients = false
			useFlow &&= (flow.options.supportsSupportedClients || query.target !== GitHubTarget.DotCom);
		} else {
			useFlow &&= flow.options.supportsUnsupportedClients;
		}
		return useFlow;
	});
}
