/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ExperimentationTelemetry } from './common/experimentationService';
import { AuthProviderType, UriEventHandler } from './github';
import { Log } from './common/logger';
import { isSupportedClient, isSupportedTarget } from './common/env';
import { crypto } from './node/crypto';
import { fetching } from './node/fetch';
import { ExtensionHost, GitHubTarget, getFlows } from './flows';
import { NETWORK_ERROR, USER_CANCELLATION_ERROR } from './common/errors';

// This is the error message that we throw if the login was cancelled for any reason. Extensions
// calling `getSession` can handle this error to know that the user cancelled the login.
const CANCELLATION_ERROR = 'Cancelled';

const REDIRECT_URL_STABLE = 'https://vscode.dev/redirect';
const REDIRECT_URL_INSIDERS = 'https://insiders.vscode.dev/redirect';

export interface IGitHubServer {
	login(scopes: string): Promise<string>;
	getUserInfo(token: string): Promise<{ id: string; accountName: string }>;
	sendAdditionalTelemetryInfo(session: vscode.AuthenticationSession): Promise<void>;
	friendlyName: string;
}


export class GitHubServer implements IGitHubServer {
	readonly friendlyName: string;

	private readonly _type: AuthProviderType;

	private _redirectEndpoint: string | undefined;

	constructor(
		private readonly _logger: Log,
		private readonly _telemetryReporter: ExperimentationTelemetry,
		private readonly _uriHandler: UriEventHandler,
		private readonly _extensionKind: vscode.ExtensionKind,
		private readonly _ghesUri?: vscode.Uri
	) {
		this._type = _ghesUri ? AuthProviderType.githubEnterprise : AuthProviderType.github;
		this.friendlyName = this._type === AuthProviderType.github ? 'GitHub' : _ghesUri?.authority!;
	}

	get baseUri() {
		if (this._type === AuthProviderType.github) {
			return vscode.Uri.parse('https://github.com/');
		}
		return this._ghesUri!;
	}

	private async getRedirectEndpoint(): Promise<string> {
		if (this._redirectEndpoint) {
			return this._redirectEndpoint;
		}
		if (this._type === AuthProviderType.github) {
			const proxyEndpoints = await vscode.commands.executeCommand<{ [providerId: string]: string } | undefined>('workbench.getCodeExchangeProxyEndpoints');
			// If we are running in insiders vscode.dev, then ensure we use the redirect route on that.
			this._redirectEndpoint = REDIRECT_URL_STABLE;
			if (proxyEndpoints?.github && new URL(proxyEndpoints.github).hostname === 'insiders.vscode.dev') {
				this._redirectEndpoint = REDIRECT_URL_INSIDERS;
			}
		} else {
			// GHE only supports a single redirect endpoint, so we can't use
			// insiders.vscode.dev/redirect when we're running in Insiders, unfortunately.
			// Additionally, we make the assumption that this function will only be used
			// in flows that target supported GHE targets, not on-prem GHES. Because of this
			// assumption, we can assume that the GHE version used is at least 3.8 which is
			// the version that changed the redirect endpoint to this URI from the old
			// GitHub maintained server.
			this._redirectEndpoint = 'https://vscode.dev/redirect';
		}
		return this._redirectEndpoint;
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
		const promptToContinue = async (mode: string) => {
			if (userCancelled === undefined) {
				// We haven't had a failure yet so wait to prompt
				return;
			}
			const message = userCancelled
				? vscode.l10n.t('Having trouble logging in? Would you like to try a different way? ({0})', mode)
				: vscode.l10n.t('You have not yet finished authorizing this extension to use GitHub. Would you like to try a different way? ({0})', mode);
			const result = await vscode.window.showWarningMessage(message, yes, no);
			if (result !== yes) {
				throw new Error(CANCELLATION_ERROR);
			}
		};

		const nonce: string = crypto.getRandomValues(new Uint32Array(2)).reduce((prev, curr) => prev += curr.toString(16), '');
		const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.github-authentication/did-authenticate?nonce=${encodeURIComponent(nonce)}`));

		const supportedClient = isSupportedClient(callbackUri);
		const supportedTarget = isSupportedTarget(this._type, this._ghesUri);

		const flows = getFlows({
			target: this._type === AuthProviderType.github
				? GitHubTarget.DotCom
				: supportedTarget ? GitHubTarget.HostedEnterprise : GitHubTarget.Enterprise,
			extensionHost: typeof navigator === 'undefined'
				? this._extensionKind === vscode.ExtensionKind.UI ? ExtensionHost.Local : ExtensionHost.Remote
				: ExtensionHost.WebWorker,
			isSupportedClient: supportedClient
		});


		for (const flow of flows) {
			try {
				if (flow !== flows[0]) {
					await promptToContinue(flow.label);
				}
				return await flow.trigger({
					scopes,
					callbackUri,
					nonce,
					baseUri: this.baseUri,
					logger: this._logger,
					uriHandler: this._uriHandler,
					enterpriseUri: this._ghesUri,
					redirectUri: vscode.Uri.parse(await this.getRedirectEndpoint()),
				});
			} catch (e) {
				userCancelled = this.processLoginError(e);
			}
		}

		throw new Error(userCancelled ? CANCELLATION_ERROR : 'No auth flow succeeded.');
	}

	private getServerUri(path: string = '') {
		const apiUri = this.baseUri;
		// github.com and Hosted GitHub Enterprise instances
		if (isSupportedTarget(this._type, this._ghesUri)) {
			return vscode.Uri.parse(`${apiUri.scheme}://api.${apiUri.authority}`).with({ path });
		}
		// GitHub Enterprise Server (aka on-prem)
		return vscode.Uri.parse(`${apiUri.scheme}://${apiUri.authority}/api/v3${path}`);
	}

	public async getUserInfo(token: string): Promise<{ id: string; accountName: string }> {
		let result;
		try {
			this._logger.info('Getting user info...');
			result = await fetching(this.getServerUri('/user').toString(), {
				headers: {
					Authorization: `token ${token}`,
					'User-Agent': `${vscode.env.appName} (${vscode.env.appHost})`
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

	public async sendAdditionalTelemetryInfo(session: vscode.AuthenticationSession): Promise<void> {
		if (!vscode.env.isTelemetryEnabled) {
			return;
		}
		const nocors = await this.isNoCorsEnvironment();

		if (nocors) {
			return;
		}

		if (this._type === AuthProviderType.github) {
			return await this.checkUserDetails(session);
		}

		// GHES
		await this.checkEnterpriseVersion(session.accessToken);
	}

	private async checkUserDetails(session: vscode.AuthenticationSession): Promise<void> {
		let edu: string | undefined;

		try {
			const result = await fetching('https://education.github.com/api/user', {
				headers: {
					Authorization: `token ${session.accessToken}`,
					'faculty-check-preview': 'true',
					'User-Agent': `${vscode.env.appName} (${vscode.env.appHost})`
				}
			});

			if (result.ok) {
				const json: { student: boolean; faculty: boolean } = await result.json();
				edu = json.student
					? 'student'
					: json.faculty
						? 'faculty'
						: 'none';
			} else {
				edu = 'unknown';
			}
		} catch (e) {
			edu = 'unknown';
		}

		/* __GDPR__
			"session" : {
				"owner": "TylerLeonhardt",
				"isEdu": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"isManaged": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this._telemetryReporter.sendTelemetryEvent('session', {
			isEdu: edu,
			// Apparently, this is how you tell if a user is an EMU...
			isManaged: session.account.label.includes('_') ? 'true' : 'false'
		});
	}

	private async checkEnterpriseVersion(token: string): Promise<void> {
		try {
			let version: string;
			if (!isSupportedTarget(this._type, this._ghesUri)) {
				const result = await fetching(this.getServerUri('/meta').toString(), {
					headers: {
						Authorization: `token ${token}`,
						'User-Agent': `${vscode.env.appName} (${vscode.env.appHost})`
					}
				});

				if (!result.ok) {
					return;
				}

				const json: { verifiable_password_authentication: boolean; installed_version: string } = await result.json();
				version = json.installed_version;
			} else {
				version = 'hosted';
			}

			/* __GDPR__
				"ghe-session" : {
					"owner": "TylerLeonhardt",
					"version": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this._telemetryReporter.sendTelemetryEvent('ghe-session', {
				version
			});
		} catch {
			// No-op
		}
	}

	private processLoginError(error: Error): boolean {
		if (error.message === CANCELLATION_ERROR) {
			throw error;
		}
		this._logger.error(error.message ?? error);
		return error.message === USER_CANCELLATION_ERROR;
	}
}
