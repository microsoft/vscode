/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cancelOnDispose, CancellationToken } from '../../../../base/common/cancellation.js';
import { asGitHubAccount } from '../../../../base/common/defaultAccount.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, IReference, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { withGitHubCredentialDeadline } from '../../../../platform/github/common/githubCredentialService.js';
import { deriveGitHubEndpoints } from '../../../../platform/github/common/githubEndpoints.js';
import { createGitHubClientMetadata } from '../../../../platform/github/common/githubRequestMetadata.js';
import { GitHubService, IGitHubClient, IGitHubRequestProviderScope } from '../../../../platform/github/common/githubService.js';
import { IGitHubAccountClient } from '../../../../platform/github/common/account/account.js';
import { AccountClient } from '../../../../platform/github/common/account/accountClient.js';
import { IGitHubAnonymousClient } from '../../../../platform/github/common/anonymous/anonymous.js';
import { GitHubClientOptions, GitHubRequestError } from '../../../../platform/github/common/githubTypes.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService, TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from '../../../../platform/telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { AuthenticationSession, IAuthenticationService } from '../../authentication/common/authentication.js';
import { IWorkbenchGitHubService, toGitHubAuthorizationContext } from '../common/githubService.js';
import { getWorkbenchMissionControlOptions, WorkbenchGitHubCredentialProvider } from './githubCredentialProvider.js';

export class WorkbenchGitHubService extends GitHubService implements IWorkbenchGitHubService {

	readonly onDidChangeDefaultClient: Event<void>;
	private readonly _credentialProvider: WorkbenchGitHubCredentialProvider;
	private readonly _defaultClient = this._register(new MutableDisposable<IReference<IGitHubClient>>());
	private readonly _apiScope = this._register(new MutableDisposable<IGitHubRequestProviderScope>());
	private readonly _disposeToken = cancelOnDispose(this._store);
	private _defaultClientGeneration = 0;
	private _defaultSessionAccountId: string | undefined;

	constructor(
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		const credentialProvider = new WorkbenchGitHubCredentialProvider(authenticationService);
		super({
			credentialProvider,
			useBrowserRedirects: true,
			connectorsApiBaseUri: productService.defaultChatAgent?.mcpConnectorsUrl,
			telemetrySource: isWeb ? 'web' : 'workbench',
			clientMetadata: createGitHubClientMetadata(productService, 'workbench', 'browser'),
			onDidChangeTelemetryLevel: Event.map(Event.filter(configurationService.onDidChangeConfiguration, event =>
				event.affectsConfiguration(TELEMETRY_SETTING_ID)
				|| event.affectsConfiguration(TELEMETRY_OLD_SETTING_ID)
				|| event.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID)
			), () => getTelemetryLevel(configurationService)),
		}, logService, telemetryService);
		this._credentialProvider = this._register(credentialProvider);
		let defaultAccountKey = this._getDefaultAccountKey();
		this.onDidChangeDefaultClient = Event.any(
			Event.signal(Event.filter(_defaultAccountService.onDidChangeDefaultAccount, () => {
				const key = this._getDefaultAccountKey();
				if (key === defaultAccountKey) {
					return false;
				}
				defaultAccountKey = key;
				this._defaultSessionAccountId = undefined;
				return true;
			}, this._store)),
			Event.signal(Event.filter(credentialProvider.onDidChangeSessions, event =>
				event.providerId === _defaultAccountService.getDefaultAccountAuthenticationProvider().id
				&& [...event.event.added ?? [], ...event.event.changed ?? [], ...event.event.removed ?? []].some(session =>
					!this._defaultSessionAccountId || session.account.id === this._defaultSessionAccountId
					|| session.id === this._defaultClient.value?.object.authorization.sessionId
					|| session.id === asGitHubAccount(_defaultAccountService.currentDefaultAccount)?.sessionId
				), this._store)),
		);
		this._register(this.onDidChangeDefaultClient(() => {
			this._defaultClientGeneration++;
			this._defaultClient.clear();
		}));
	}

	async acquireAnonymousApiClient(cancellationToken: CancellationToken): Promise<IGitHubAnonymousClient> {
		CancellationToken.throwIfCanceled(cancellationToken);
		return this.acquireAnonymousClient();
	}

	async acquireDefaultAccountClient(cancellationToken: CancellationToken): Promise<IReference<IGitHubClient>> {
		return this.withLifetime(cancellationToken, async token => {
			const { options } = await this.resolveDefaultAccountOptions(token);
			this._defaultClient.value = this.acquireClient(options);
			return this.acquireClient(options);
		});
	}

	async acquireAccountApiClient(providerId: string, session: AuthenticationSession, cancellationToken: CancellationToken): Promise<IGitHubAccountClient> {
		const authorization = toGitHubAuthorizationContext(providerId, session);
		return this.withLifetime(cancellationToken, async token => {
			const options = await withGitHubCredentialDeadline(token, token => this._credentialProvider.resolveClient(authorization, token));
			CancellationToken.throwIfCanceled(token);
			const client = await this.acquireApiClient(options, token);
			if (token.isCancellationRequested) {
				client.dispose();
				CancellationToken.throwIfCanceled(token);
			}
			return client;
		});
	}

	async acquireDefaultAccountApiClient(cancellationToken: CancellationToken): Promise<IGitHubAccountClient> {
		return this.withLifetime(cancellationToken, async token => {
			const { options, accountId, generation } = await this.resolveDefaultAccountOptions(token);
			const client = await this.acquireApiClient({ ...options, authorization: { ...options.authorization, accountId } }, token);
			try {
				CancellationToken.throwIfCanceled(token);
				if (generation !== this._defaultClientGeneration) {
					throw new GitHubRequestError(localize('githubAccountChanged', "The selected GitHub account changed. Try again."), 'authentication');
				}
				return client;
			} catch (error) {
				client.dispose();
				throw error;
			}
		});
	}

	protected async acquireApiClient(options: GitHubClientOptions, cancellationToken: CancellationToken): Promise<IGitHubAccountClient> {
		CancellationToken.throwIfCanceled(cancellationToken);
		const scope = this._apiScope.value ??= this.createRequestProviderScope(this._credentialProvider);
		const reference = scope.acquireClient(options);
		return new AccountClient(reference.object.authorization, reference.object, reference);
	}

	private async resolveDefaultAccountOptions(cancellationToken: CancellationToken): Promise<{ options: GitHubClientOptions; accountId: string; generation: number }> {
		const { options, accountId, generation } = await withGitHubCredentialDeadline(cancellationToken, cancellationToken => this._getDefaultAccountOptions(cancellationToken));
		CancellationToken.throwIfCanceled(cancellationToken);
		if (generation !== this._defaultClientGeneration) {
			throw new GitHubRequestError(localize('githubAccountChanged', "The selected GitHub account changed. Try again."), 'authentication');
		}
		this._defaultSessionAccountId = accountId;
		return { options, accountId, generation };
	}

	private async withLifetime<T>(token: CancellationToken, task: (token: CancellationToken) => Promise<T>): Promise<T> {
		const lifetime = new DisposableStore();
		try {
			return await task(CancellationToken.any([token, this._disposeToken], lifetime));
		} catch (error) {
			if (isCancellationError(error) && this._disposeToken.isCancellationRequested && !token.isCancellationRequested) {
				throw new GitHubRequestError('GitHub service was disposed', 'unknown');
			}
			throw error;
		} finally {
			lifetime.dispose();
		}
	}

	private _getDefaultAccountKey(): string {
		const account = asGitHubAccount(this._defaultAccountService.currentDefaultAccount);
		const provider = account?.authenticationProvider ?? this._defaultAccountService.getDefaultAccountAuthenticationProvider();
		return JSON.stringify([provider.id, account?.sessionId, provider.enterprise, provider.enterprise ? this._defaultAccountService.resolveGitHubUrl('') : undefined]);
	}

	private async _getDefaultAccountOptions(cancellationToken: CancellationToken): Promise<{ options: GitHubClientOptions; accountId: string; generation: number }> {
		CancellationToken.throwIfCanceled(cancellationToken);
		const account = asGitHubAccount(this._defaultAccountService.currentDefaultAccount ?? await this._defaultAccountService.getDefaultAccount());
		CancellationToken.throwIfCanceled(cancellationToken);
		if (!account) {
			throw new GitHubRequestError(localize('githubAuthenticationRequired', "Sign in to GitHub to load GitHub data."), 'authentication');
		}
		const generation = this._defaultClientGeneration;
		const current = asGitHubAccount(this._defaultAccountService.currentDefaultAccount);
		if (!current || account.sessionId !== current.sessionId || account.authenticationProvider.id !== current.authenticationProvider.id) {
			throw new GitHubRequestError(localize('githubAccountChanged', "The selected GitHub account changed. Try again."), 'authentication');
		}
		const provider = account.authenticationProvider;
		const sessions = await this._credentialProvider.getSessions(provider.id, cancellationToken);
		CancellationToken.throwIfCanceled(cancellationToken);
		const selected = sessions.find(session => session.id === account.sessionId);
		if (!selected) {
			throw new GitHubRequestError(localize('githubSessionUnavailable', "The selected GitHub session is unavailable."), 'authentication');
		}
		const repositorySession = sessions
			.filter(session => session.account.id === selected.account.id
				&& session.authorizationServer?.toString() === selected.authorizationServer?.toString()
				&& session.scopes.includes('repo'))
			.sort((a, b) => a.scopes.length - b.scopes.length)[0];
		if (!repositorySession) {
			throw new GitHubRequestError(localize('githubRepositoryAccessRequired', "Sign in to GitHub with repository access to load GitHub data."), 'authentication');
		}
		const enterpriseUri = provider.enterprise ? this._defaultAccountService.resolveGitHubUrl('') : undefined;
		if (provider.enterprise && !enterpriseUri) {
			throw new GitHubRequestError(localize('githubUrlUnavailable', "The GitHub Enterprise URL is unavailable. Sign in and try again."), 'authentication');
		}
		const endpoints = deriveGitHubEndpoints(enterpriseUri);
		return {
			options: {
				authorization: {
					providerId: provider.id,
					sessionId: repositorySession.id,
					scopes: repositorySession.scopes,
					...(repositorySession.authorizationServer ? { authorizationServer: repositorySession.authorizationServer.toString() } : {}),
				},
				apiBaseUri: endpoints.apiBaseUri,
				graphQlUri: endpoints.graphQlUri,
				missionControl: getWorkbenchMissionControlOptions(provider.id, endpoints.enterpriseHost),
			},
			accountId: selected.account.id,
			generation,
		};
	}
}

registerSingleton(IWorkbenchGitHubService, WorkbenchGitHubService, InstantiationType.Delayed);
