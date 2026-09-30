/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IReference, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { withGitHubCredentialDeadline } from '../../../../platform/github/common/githubCredentialService.js';
import { deriveGitHubEndpoints } from '../../../../platform/github/common/githubEndpoints.js';
import { createGitHubClientMetadata } from '../../../../platform/github/common/githubRequestMetadata.js';
import { GitHubService, IGitHubClient } from '../../../../platform/github/common/githubService.js';
import { GitHubAuthorizationContext, GitHubClientOptions, GitHubCredentialChange, GitHubRequestError, IGitHubCredentialProvider } from '../../../../platform/github/common/githubTypes.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService, TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from '../../../../platform/telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { AuthenticationSession, IAuthenticationService } from '../../authentication/common/authentication.js';
import { IWorkbenchGitHubService } from '../common/githubService.js';

class WorkbenchGitHubCredentialProvider implements IGitHubCredentialProvider {
	readonly onDidChange: Event<GitHubCredentialChange>;

	constructor(private readonly _authenticationService: IAuthenticationService) {
		this.onDidChange = Event.map(_authenticationService.onDidChangeSessions, event => ({
			providerId: event.providerId,
			sessionIds: [...event.event.changed ?? [], ...event.event.removed ?? []].map(session => session.id),
		}));
	}

	async getToken(context: GitHubAuthorizationContext, signal: AbortSignal): Promise<string | undefined> {
		signal.throwIfAborted();
		const sessions = await this._authenticationService.getSessions(context.providerId, [], { silent: true }, true);
		signal.throwIfAborted();
		return sessions.find(session => session.id === context.sessionId
			&& session.scopes.length === context.scopes.length
			&& session.authorizationServer?.toString() === context.authorizationServer
			&& context.scopes.every(scope => session.scopes.includes(scope)))?.accessToken;
	}
}

export class WorkbenchGitHubService extends GitHubService implements IWorkbenchGitHubService {

	readonly onDidChangeDefaultClient: Event<void>;
	private readonly _defaultClient = this._register(new MutableDisposable<IReference<IGitHubClient>>());
	private readonly _lifetime = new AbortController();
	private _defaultClientGeneration = 0;
	private _defaultSessionAccountId: string | undefined;

	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super({
			credentialProvider: new WorkbenchGitHubCredentialProvider(_authenticationService),
			telemetrySource: isWeb ? 'web' : 'workbench',
			clientMetadata: createGitHubClientMetadata(productService, 'workbench', 'browser'),
			onDidChangeTelemetryLevel: Event.map(Event.filter(configurationService.onDidChangeConfiguration, event =>
				event.affectsConfiguration(TELEMETRY_SETTING_ID)
				|| event.affectsConfiguration(TELEMETRY_OLD_SETTING_ID)
				|| event.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID)
			), () => getTelemetryLevel(configurationService)),
		}, logService, telemetryService);
		this.onDidChangeDefaultClient = Event.any(
			Event.map(_defaultAccountService.onDidChangeDefaultAccount, () => {
				this._defaultSessionAccountId = undefined;
			}, this._store),
			Event.signal(Event.filter(_authenticationService.onDidChangeSessions, event =>
				event.providerId === _defaultAccountService.getDefaultAccountAuthenticationProvider().id
				&& [...event.event.added ?? [], ...event.event.changed ?? [], ...event.event.removed ?? []].some(session =>
					!this._defaultSessionAccountId || session.account.id === this._defaultSessionAccountId
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

	private async _getDefaultAccountOptions(signal: AbortSignal): Promise<{ options: GitHubClientOptions; accountId: string }> {
		signal.throwIfAborted();
		const account = this._defaultAccountService.currentDefaultAccount ?? await this._defaultAccountService.getDefaultAccount();
		signal.throwIfAborted();
		if (!account) {
			throw new GitHubRequestError(localize('githubAuthenticationRequired', "Sign in to GitHub to load GitHub data."), 'authentication');
		}
		const provider = account.authenticationProvider;
		const sessions = await this._authenticationService.getSessions(provider.id, [], { silent: true }, true);
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
		const sessions = await this._authenticationService.getSessions(providerId, [], { silent: true }, true);
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
		};
	}
}

registerSingleton(IWorkbenchGitHubService, WorkbenchGitHubService, InstantiationType.Delayed);
