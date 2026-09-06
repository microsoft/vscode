/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { deriveGitHubEndpoints } from '../../../../platform/agentHost/common/githubEndpoints.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { GitHubService, IGitHubService } from '../../../../platform/github/common/githubService.js';
import { IGitHubEndpointProvider, IGitHubTokenProvider } from '../../../../platform/github/common/githubTypes.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAuthenticationService } from '../../authentication/common/authentication.js';

class WorkbenchGitHubEndpointProvider implements IGitHubEndpointProvider {

	readonly onDidChange: Event<void>;

	constructor(private readonly _defaultAccountService: IDefaultAccountService) {
		this.onDidChange = Event.map(_defaultAccountService.onDidChangeDefaultAccount, () => undefined);
	}

	getApiBaseUri(): string {
		return this._getEndpoints().apiBaseUri;
	}

	getGraphQlUri(): string {
		return this._getEndpoints().graphQlUri;
	}

	private _getEndpoints() {
		const authenticationProvider = this._defaultAccountService.getDefaultAccountAuthenticationProvider();
		const enterpriseUri = authenticationProvider.enterprise ? this._defaultAccountService.resolveGitHubUrl('') : undefined;
		return deriveGitHubEndpoints(enterpriseUri);
	}
}

export class WorkbenchGitHubTokenProvider implements IGitHubTokenProvider {

	readonly onDidChangeToken: Event<void>;

	constructor(
		private readonly _authenticationService: IAuthenticationService,
		private readonly _defaultAccountService: IDefaultAccountService,
		private readonly _logService: ILogService,
	) {
		this.onDidChangeToken = Event.any(
			Event.map(Event.filter(
				_authenticationService.onDidChangeSessions,
				event => event.providerId === _defaultAccountService.getDefaultAccountAuthenticationProvider().id,
			), () => undefined),
			Event.map(_defaultAccountService.onDidChangeDefaultAccount, () => undefined),
		);
	}

	async getToken(): Promise<string | undefined> {
		const provider = this._defaultAccountService.getDefaultAccountAuthenticationProvider();
		const defaultAccount = this._defaultAccountService.currentDefaultAccount ?? await this._defaultAccountService.getDefaultAccount();
		const sessions = await this._authenticationService.getSessions(provider.id, [], { silent: true }, true);
		const defaultSession = defaultAccount
			? sessions.find(session => session.id === defaultAccount.sessionId)
			: undefined;
		if (defaultAccount && !defaultSession) {
			this._logService.warn(`[WorkbenchGitHubTokenProvider] Default account session was not found for provider '${provider.id}' among ${sessions.length} session(s)`);
			return undefined;
		}
		const repositorySession = sessions.find(session =>
			session.scopes.includes('repo')
			&& (!defaultSession || session.account.id === defaultSession.account.id)
		);
		if (repositorySession) {
			this._logService.trace(`[WorkbenchGitHubTokenProvider] Reusing a repository-capable session for provider '${provider.id}' with scopes [${repositorySession.scopes.join(', ')}]`);
			return repositorySession.accessToken;
		}
		const repositorySessions = await this._authenticationService.getSessions(provider.id, ['repo'], {
			createIfNone: true,
			...(defaultSession ? { account: defaultSession.account } : {}),
		}, true);
		const resolvedSession = repositorySessions.find(session => !defaultSession || session.account.id === defaultSession.account.id);
		if (!resolvedSession) {
			this._logService.warn(`[WorkbenchGitHubTokenProvider] No repository-capable session resolved for provider '${provider.id}'; initial session scopes: ${formatSessionScopes(sessions)}; repository query scopes: ${formatSessionScopes(repositorySessions)}`);
		}
		return resolvedSession?.accessToken;
	}
}

function formatSessionScopes(sessions: readonly { readonly scopes: readonly string[] }[]): string {
	return sessions.length ? sessions.map(session => `[${session.scopes.join(', ')}]`).join(', ') : 'none';
}

export class WorkbenchGitHubService extends GitHubService {

	constructor(
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IDefaultAccountService defaultAccountService: IDefaultAccountService,
		@ILogService logService: ILogService,
	) {
		super({
			endpoint: new WorkbenchGitHubEndpointProvider(defaultAccountService),
			tokenProvider: new WorkbenchGitHubTokenProvider(authenticationService, defaultAccountService, logService),
		}, logService);
	}
}

registerSingleton(IGitHubService, WorkbenchGitHubService, InstantiationType.Delayed);
