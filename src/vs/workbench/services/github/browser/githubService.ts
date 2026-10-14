/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IReference, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { scopesMatch } from '../../../../base/common/oauth.js';
import { isWeb } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { COPILOT_INTEGRATION_ID } from '../../../../platform/endpoint/common/licenseAgreement.js';
import { withGitHubCredentialDeadline } from '../../../../platform/github/common/githubCredentialService.js';
import { deriveGitHubEndpoints, GITHUB_DOT_COM_COPILOT_API_BASE_URI } from '../../../../platform/github/common/githubEndpoints.js';
import { createGitHubClientMetadata } from '../../../../platform/github/common/githubRequestMetadata.js';
import { GitHubService, IGitHubClient } from '../../../../platform/github/common/githubService.js';
import { GitHubAuthorizationContext, GitHubClientOptions, GitHubCredentialChange, GitHubRequestError, IGitHubCredentialProvider } from '../../../../platform/github/common/githubTypes.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService, TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from '../../../../platform/telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../authentication/common/authentication.js';
import { IWorkbenchGitHubService } from '../common/githubService.js';

interface IGitHubSessionGrant {
	readonly accountId: string;
	readonly scopes: readonly string[];
	readonly authorizationServer: string | undefined;
}

class WorkbenchGitHubCredentialProvider extends Disposable implements IGitHubCredentialProvider {
	private readonly _sessions = new Map<string, { version: number; grants: Map<string, IGitHubSessionGrant> }>();
	private readonly _onDidChangeSessions = this._register(new Emitter<{ providerId: string; event: AuthenticationSessionsChangeEvent }>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	readonly onDidChange: Event<GitHubCredentialChange> = Event.map(this.onDidChangeSessions, event => ({
		providerId: event.providerId,
		sessionIds: [...event.event.changed ?? [], ...event.event.removed ?? []].map(session => session.id),
	}));

	constructor(private readonly _authenticationService: IAuthenticationService) {
		super();
		this._register(toDisposable(() => this._sessions.clear()));
		this._register(_authenticationService.onDidChangeSessions(event => {
			const state = this._sessions.get(event.providerId);
			const changed = event.event.changed?.filter(session => {
				const previous = state?.grants.get(session.id);
				return !previous || previous.accountId !== session.account.id
					|| previous.authorizationServer !== session.authorizationServer?.toString()
					|| !scopesMatch(previous.scopes, session.scopes);
			});
			if (state) {
				state.version++;
				for (const session of event.event.removed ?? []) {
					state.grants.delete(session.id);
				}
				for (const session of [...event.event.added ?? [], ...event.event.changed ?? []]) {
					state.grants.set(session.id, sessionGrant(session));
				}
			}
			if (event.event.added?.length || event.event.removed?.length || changed?.length) {
				this._onDidChangeSessions.fire({ providerId: event.providerId, event: { ...event.event, changed } });
			}
		}));
	}

	async getSessions(providerId: string, signal: AbortSignal): Promise<readonly AuthenticationSession[]> {
		signal.throwIfAborted();
		let state = this._sessions.get(providerId);
		if (!state) {
			state = { version: 0, grants: new Map() };
			this._sessions.set(providerId, state);
		}
		while (true) {
			const version = state.version;
			const sessions = await this._authenticationService.getSessions(providerId, [], { silent: true }, true);
			signal.throwIfAborted();
			if (state.version !== version) {
				continue;
			}
			state.grants = new Map(sessions.map(session => [session.id, sessionGrant(session)]));
			return sessions;
		}
	}

	async getToken(context: GitHubAuthorizationContext, signal: AbortSignal): Promise<string | undefined> {
		const sessions = await this.getSessions(context.providerId, signal);
		return sessions.find(session => session.id === context.sessionId
			&& session.authorizationServer?.toString() === context.authorizationServer
			&& scopesMatch(session.scopes, context.scopes))?.accessToken;
	}
}

function sessionGrant(session: AuthenticationSession): IGitHubSessionGrant {
	return { accountId: session.account.id, scopes: [...session.scopes], authorizationServer: session.authorizationServer?.toString() };
}

export class WorkbenchGitHubService extends GitHubService implements IWorkbenchGitHubService {

	readonly onDidChangeDefaultClient: Event<void>;
	private readonly _credentialProvider: WorkbenchGitHubCredentialProvider;
	private readonly _defaultClient = this._register(new MutableDisposable<IReference<IGitHubClient>>());
	private readonly _lifetime = new AbortController();
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
					|| session.id === _defaultAccountService.currentDefaultAccount?.sessionId
				), this._store)),
		);
		this._register(this.onDidChangeDefaultClient(() => {
			this._defaultClientGeneration++;
			this._defaultClient.clear();
		}));
		this._register(toDisposable(() => this._lifetime.abort(new GitHubRequestError('GitHub service was disposed', 'unknown'))));
	}

	async acquireDefaultAccountClient(signal: AbortSignal): Promise<IReference<IGitHubClient>> {
		const generation = this._defaultClientGeneration;
		const combinedSignal = AbortSignal.any([signal, this._lifetime.signal]);
		const { options, accountId } = await withGitHubCredentialDeadline(combinedSignal, signal => this._getDefaultAccountOptions(signal));
		combinedSignal.throwIfAborted();
		if (generation !== this._defaultClientGeneration) {
			throw new GitHubRequestError(localize('githubAccountChanged', "The selected GitHub account changed. Try again."), 'authentication');
		}
		this._defaultSessionAccountId = accountId;
		this._defaultClient.value = this.acquireClient(options);
		return this.acquireClient(options);
	}

	async acquireSessionClient(providerId: string, sessionId: string, signal: AbortSignal): Promise<IReference<IGitHubClient>> {
		const combinedSignal = AbortSignal.any([signal, this._lifetime.signal]);
		const options = await withGitHubCredentialDeadline(combinedSignal, signal => this._getSessionOptions(providerId, sessionId, signal));
		combinedSignal.throwIfAborted();
		return this.acquireClient(options);
	}

	private _getDefaultAccountKey(): string {
		const account = this._defaultAccountService.currentDefaultAccount;
		const provider = account?.authenticationProvider ?? this._defaultAccountService.getDefaultAccountAuthenticationProvider();
		return JSON.stringify([provider.id, account?.sessionId, provider.enterprise, provider.enterprise ? this._defaultAccountService.resolveGitHubUrl('') : undefined]);
	}

	private async _getDefaultAccountOptions(signal: AbortSignal): Promise<{ options: GitHubClientOptions; accountId: string }> {
		signal.throwIfAborted();
		const account = this._defaultAccountService.currentDefaultAccount ?? await this._defaultAccountService.getDefaultAccount();
		signal.throwIfAborted();
		if (!account) {
			throw new GitHubRequestError(localize('githubAuthenticationRequired', "Sign in to GitHub to load GitHub data."), 'authentication');
		}
		const provider = account.authenticationProvider;
		const sessions = await this._credentialProvider.getSessions(provider.id, signal);
		signal.throwIfAborted();
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
		return { options: this._sessionOptions(provider.id, repositorySession, enterpriseUri), accountId: selected.account.id };
	}

	private async _getSessionOptions(providerId: string, sessionId: string, signal: AbortSignal): Promise<GitHubClientOptions> {
		signal.throwIfAborted();
		const sessions = await this._credentialProvider.getSessions(providerId, signal);
		signal.throwIfAborted();
		const session = sessions.find(session => session.id === sessionId);
		if (!session) {
			throw new GitHubRequestError(localize('githubSessionUnavailable', "The selected GitHub session is unavailable."), 'authentication');
		}
		const enterpriseUri = session.authorizationServer?.toString();
		if (providerId !== 'github' && !enterpriseUri) {
			throw new GitHubRequestError(localize('githubUrlUnavailable', "The GitHub Enterprise URL is unavailable. Sign in and try again."), 'authentication');
		}
		return this._sessionOptions(providerId, session, enterpriseUri);
	}

	private _sessionOptions(providerId: string, session: AuthenticationSession, enterpriseUri: string | undefined): GitHubClientOptions {
		const endpoints = deriveGitHubEndpoints(enterpriseUri);
		return {
			authorization: { providerId, sessionId: session.id, scopes: session.scopes, ...(session.authorizationServer ? { authorizationServer: session.authorizationServer.toString() } : {}) },
			apiBaseUri: endpoints.apiBaseUri,
			graphQlUri: endpoints.graphQlUri,
			missionControl: providerId === 'github' && endpoints.enterpriseHost === undefined ? {
				endpoint: { apiBaseUri: `${GITHUB_DOT_COM_COPILOT_API_BASE_URI}/agents`, integrationId: COPILOT_INTEGRATION_ID },
				copilotEndpoint: { apiBaseUri: GITHUB_DOT_COM_COPILOT_API_BASE_URI, integrationId: COPILOT_INTEGRATION_ID },
			} : undefined,
		};
	}
}

registerSingleton(IWorkbenchGitHubService, WorkbenchGitHubService, InstantiationType.Delayed);
