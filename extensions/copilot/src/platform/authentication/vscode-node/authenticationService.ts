/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { authentication, AuthenticationGetSessionOptions, AuthenticationSession } from 'vscode';
import { TaskSingler } from '../../../util/common/taskSingler';
import { runOnChange } from '../../../util/vs/base/common/observable';
import { AuthProviderId, ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { ILogService } from '../../log/common/logService';
import { authProviderId, BaseAuthenticationService, StrictAuthenticationPresentationOptions } from '../common/authentication';
import { ICopilotTokenManager } from '../common/copilotTokenManager';
import { ICopilotTokenStore } from '../common/copilotTokenStore';
import { authenticationSessionIdentityEquals, resolveGitHubSessionUri } from '../common/enterprise';
import { getAlignedSession, getAnyAuthSession } from './session';

export class AuthenticationService extends BaseAuthenticationService {
	private _taskSingler = new TaskSingler<AuthenticationSession | undefined>();

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
		@ICopilotTokenStore tokenStore: ICopilotTokenStore,
		@ICopilotTokenManager tokenManager: ICopilotTokenManager
	) {
		super(logService, tokenStore, tokenManager, configurationService);
		this._register(authentication.onDidChangeSessions((e) => {
			if (e.provider.id === authProviderId(configurationService) || e.provider.id === AuthProviderId.Microsoft) {
				this._logService.debug('Handling onDidChangeSession.');
				void this._handleAuthChangeEvent();
			}
		}));
		this._register(runOnChange(configurationService.getConfigObservable(ConfigKey.Shared.AuthProvider), () => {
			this._anyGitHubSession = undefined;
			this._permissiveGitHubSession = undefined;
			this.resetCopilotToken();
			this._tokenStore.githubEnterpriseUri = undefined;
			this.fireAuthenticationChange('authentication provider changed');
			this._logService.debug('Handling authentication configuration change.');
			void this._handleAuthChangeEvent();
		}));

		void this._handleAuthChangeEvent();
	}

	override async getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { createIfNone: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;
	override async getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { forceNewSession: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;
	override async getGitHubSession(kind: 'permissive' | 'any', options: Omit<AuthenticationGetSessionOptions, 'createIfNone' | 'forceNewSession'>): Promise<AuthenticationSession | undefined>;
	override async getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		const providerId = authProviderId(this._configurationService);
		const interactive = options.createIfNone || options.forceNewSession;
		const func = async () => {
			const session = kind === 'permissive' ? await getAlignedSession(this._configurationService, options) : await getAnyAuthSession(this._configurationService, options);
			if (providerId !== authProviderId(this._configurationService)) {
				throw new Error(l10n.t('The GitHub account changed while getting a session.'));
			}
			if (kind === 'permissive') {
				this._permissiveGitHubSession = session;
			} else {
				const previous = this._anyGitHubSession;
				this._anyGitHubSession = session;
				if (!authenticationSessionIdentityEquals(previous, session)) {
					this.resetCopilotToken();
				}
				this._tokenStore.githubEnterpriseUri = session && providerId === AuthProviderId.GitHubEnterprise
					? resolveGitHubSessionUri(session, providerId)
					: undefined;
			}
			return session;
		};
		const key = JSON.stringify([kind, providerId, options]);
		return interactive ? await func() : await this._taskSingler.getOrCreate(key, func);
	}

	protected async getAnyAdoSession(options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		const adoAuthProviderId = 'microsoft';
		const adoScopes = ['499b84ac-1321-427f-aa17-267ca6975798/.default', 'offline_access'];
		const func = async () => await authentication.getSession(adoAuthProviderId, adoScopes, options);
		// If we are doing an interactive flow, don't use the singler so that we don't get hung up on the user's choice
		const session = options?.createIfNone || options?.forceNewSession ? await func() : await this._taskSingler.getOrCreate('ado', func);
		this._anyAdoSession = session;
		return session;
	}

	async getAdoAccessTokenBase64(options?: AuthenticationGetSessionOptions): Promise<string | undefined> {
		const session = await this.getAnyAdoSession(options);
		return session ? Buffer.from(`PAT:${session.accessToken}`, 'utf8').toString('base64') : undefined;
	}
}
