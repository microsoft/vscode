/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { env, window } from 'vscode';
import { TaskSingler } from '../../../util/common/taskSingler';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { IDomainService } from '../../endpoint/common/domainService';
import { IEnvService } from '../../env/common/envService';
import { BaseOctoKitService } from '../../github/common/githubService';
import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { CopilotToken, ExtendedTokenInfo, TokenErrorNotificationId, TokenInfoOrError } from '../common/copilotToken';
import { nowSeconds } from '../common/copilotTokenManager';
import { BaseCopilotTokenManager } from '../node/copilotTokenManager';
import { getAnyAuthSession } from './session';

//Flag if we've shown message about broken oauth token.
let shown401Message = false;

export class NotSignedUpError extends Error { }
export class SubscriptionExpiredError extends Error { }
export class ContactSupportError extends Error { }
export class EnterpriseManagedError extends Error { }
export class InvalidTokenError extends Error { }
export class RateLimitedError extends Error { }
export class GitHubLoginFailedError extends Error { }

export class VSCodeCopilotTokenManager extends BaseCopilotTokenManager {
	private _taskSingler = new TaskSingler<TokenInfoOrError>();

	constructor(
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IDomainService domainService: IDomainService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IFetcherService fetcherService: IFetcherService,
		@IEnvService envService: IEnvService,
		@IConfigurationService protected readonly configurationService: IConfigurationService
	) {
		super(new BaseOctoKitService(capiClientService, fetcherService, logService, telemetryService), logService, telemetryService, domainService, capiClientService, fetcherService, envService);
	}

	async getCopilotToken(force?: boolean): Promise<CopilotToken> {
		const failWith = this.configurationService.getConfig(ConfigKey.Advanced.DebugGitHubAuthFailWith);
		if (failWith) {
			this.copilotToken = undefined;
		}

		if (!this.copilotToken || this.copilotToken.expires_at - (60 * 5 /* 5min */) < nowSeconds() || force) {
			try {
				this._logService.debug(`Getting CopilotToken (force: ${force})...`);
				this.copilotToken = await this._authShowWarnings();
				this._logService.debug(`Got CopilotToken (force: ${force}).`);
			} catch (e) {
				this._logService.debug(`Getting CopilotToken (force: ${force}) threw error: ${e}`);
				this.copilotToken = undefined;
				throw e;
			}
		}
		return new CopilotToken(this.copilotToken);
	}

	private async _auth(): Promise<TokenInfoOrError> {
		const failWith = this.configurationService.getConfig(ConfigKey.Advanced.DebugGitHubAuthFailWith);
		if (failWith) {
			return { kind: 'failure', reason: failWith };
		}

		const allowNoAuthAccess = this.configurationService.getNonExtensionConfig<boolean>('chat.allowAnonymousAccess');
		const session = await getAnyAuthSession(this.configurationService, { silent: true });
		if (!session && !allowNoAuthAccess) {
			this._logService.warn('GitHub login failed');
			this._telemetryService.sendGHTelemetryErrorEvent('auth.github_login_failed');
			return { kind: 'failure', reason: 'GitHubLoginFailed' };
		}
		if (session) {
			// Log the steps by default, but only log actual token values when the log level is set to debug.
			this._logService.info(`Logged in as ${session.account.label}`);
			const tokenResult = await this.authFromGitHubToken(session.accessToken, session.account.label);
			if (tokenResult.kind === 'success') {
				this._logService.info(`Got Copilot token for ${session.account.label}`);
				this._logService.info(`Copilot Chat: ${this._envService.getVersion()}, VS Code: ${this._envService.vscodeVersion}`);
			}
			return tokenResult;
		} else {
			this._logService.info(`Allowing anonymous access with devDeviceId`);
			const tokenResult = await this.authFromDevDeviceId(env.devDeviceId);
			if (tokenResult.kind === 'success') {
				this._logService.info(`Got Copilot token for devDeviceId`);
				this._logService.info(`Copilot Chat: ${this._envService.getVersion()}, VS Code: ${this._envService.vscodeVersion}`);
			} else {
				this._logService.warn('GitHub login failed');
				return { kind: 'failure', reason: 'GitHubLoginFailed' };
			}
			return tokenResult;
		}
	}

	private async _authShowWarnings(): Promise<ExtendedTokenInfo> {
		const tokenResult = await this._taskSingler.getOrCreate('auth', () => this._auth());
		this.sendTokenResultErrorTelemetry(tokenResult);

		if (tokenResult.kind === 'failure' && tokenResult.reason === 'NotAuthorized') {
			const message = tokenResult.message;
			switch (tokenResult.notification_id) {
				case TokenErrorNotificationId.NotSignedUp:
				case TokenErrorNotificationId.NoCopilotAccess:
					throw new NotSignedUpError(message ?? 'User not authorized');
				case TokenErrorNotificationId.SubscriptionEnded:
					throw new SubscriptionExpiredError(message);
				case TokenErrorNotificationId.EnterPriseManagedUserAccount:
					throw new EnterpriseManagedError(message);
				case TokenErrorNotificationId.ServerError:
				case TokenErrorNotificationId.FeatureFlagBlocked:
				case TokenErrorNotificationId.SpammyUser:
				case TokenErrorNotificationId.SnippyNotConfigured:
					throw new ContactSupportError(message);
			}
		}
		if (tokenResult.kind === 'failure' && tokenResult.reason === 'HTTP401') {
			const message =
				'Your GitHub token is invalid. Please sign out from your GitHub account using the VS Code accounts menu and try again.';
			if (!shown401Message) {
				shown401Message = true;
				window.showWarningMessage(message);
			}
			throw new InvalidTokenError(message);
		}

		if (tokenResult.kind === 'failure' && tokenResult.reason === 'GitHubLoginFailed') {
			throw new GitHubLoginFailedError('GitHubLoginFailed');
		}

		if (tokenResult.kind === 'failure' && tokenResult.reason === 'RateLimited') {
			throw new RateLimitedError(`Your account has exceeded GitHub's API rate limit. Please try again later.`);
		}

		if (tokenResult.kind === 'failure') {
			throw Error('Failed to get copilot token. reason: ' + tokenResult.reason);
		}

		return tokenResult;
	}

	private sendTokenResultErrorTelemetry(tokenResult: TokenInfoOrError): void {
		if (tokenResult.kind === 'success') {
			return;
		}

		/* __GDPR__
			"copilotTokenFetching.error" : {
				"owner": "TylerLeonhardt",
				"comment": "Report on the frequency of token retrieval failures.",
				"reason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The reason for the token retrieval failure" },
				"notification_id": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The notification ID associated with the failure, if any" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('copilotTokenFetching.error', {
			reason: tokenResult.reason,
			notification_id: tokenResult.notification_id,
		});
	}
}
