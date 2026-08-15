/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { authentication, AuthenticationGetSessionOptions, AuthenticationSession } from 'vscode';
import { TaskSingler } from '../../../util/common/taskSingler';
import { AuthProviderId, IConfigurationService } from '../../configuration/common/configurationService';
import { IDomainService } from '../../endpoint/common/domainService';
import { ILogService } from '../../log/common/logService';
import { authProviderId, BaseAuthenticationService, StrictAuthenticationPresentationOptions } from '../common/authentication';
import { ICopilotTokenManager } from '../common/copilotTokenManager';
import { ICopilotTokenStore } from '../common/copilotTokenStore';
import { getAlignedSession, getAnyAuthSession } from './session';

export class AuthenticationService extends BaseAuthenticationService {
	private _taskSingler = new TaskSingler<AuthenticationSession | undefined>();

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IDomainService private readonly _domainService: IDomainService,
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
		this._register(this._domainService.onDidChangeDomains((e) => {
			if (e.dotcomUrlChanged) {
				this._logService.debug('Handling onDidChangeDomains.');
				void this._handleAuthChangeEvent();
			}
		}));

		void this._handleAuthChangeEvent();
	}

	override async getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { createIfNone: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;
	override async getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { forceNewSession: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;
	override async getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		if (kind === 'permissive') {
			const func = () => getAlignedSession(this._configurationService, options);
			// If we are doing an interactive flow, don't use the singler so that we don't get hung up on the user's choice
			const session = options?.createIfNone || options?.forceNewSession ? await func() : await this._taskSingler.getOrCreate('permissive', func);
			this._permissiveGitHubSession = session;
			return session;
		} else {
			const func = () => getAnyAuthSession(this._configurationService, options);
			// If we are doing an interactive flow, don't use the singler so that we don't get hung up on the user's choice
			const session = options?.createIfNone || options?.forceNewSession ? await func() : await this._taskSingler.getOrCreate('any', func);
			this._anyGitHubSession = session;
			return session;
		}
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
