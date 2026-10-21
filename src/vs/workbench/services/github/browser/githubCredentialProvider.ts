/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { scopesMatch } from '../../../../base/common/oauth.js';
import { localize } from '../../../../nls.js';
import { deriveGitHubEndpoints, GITHUB_DOT_COM_COPILOT_API_BASE_URI, normalizeReadApiBaseUri } from '../../../../platform/github/common/githubEndpoints.js';
import { COPILOT_INTEGRATION_ID } from '../../../../platform/endpoint/common/licenseAgreement.js';
import { MissionControlClientOptions } from '../../../../platform/github/common/missionControl/missionControlClient.js';
import { GitHubAuthorizationContext, GitHubClientOptions, GitHubCredentialChange, GitHubRequestError } from '../../../../platform/github/common/githubTypes.js';
import { IGitHubCredentialBroker } from '../../../../platform/github/common/remote/ipc.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../authentication/common/authentication.js';

interface IGitHubSessionGrant {
	readonly accountId: string;
	readonly scopes: readonly string[];
	readonly authorizationServer: string | undefined;
}

export class WorkbenchGitHubCredentialProvider extends Disposable implements IGitHubCredentialBroker {
	declare readonly _serviceBrand: undefined;

	private readonly _sessions = new Map<string, { version: number; grants: Map<string, IGitHubSessionGrant> }>();
	private readonly _onDidChangeSessions = this._register(new Emitter<{ providerId: string; event: AuthenticationSessionsChangeEvent }>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	readonly onDidChange: Event<GitHubCredentialChange> = Event.map(this.onDidChangeSessions, event => ({
		providerId: event.providerId,
		sessionIds: [...event.event.changed ?? [], ...event.event.removed ?? []].map(session => session.id),
	}));
	private readonly _onDidChangeToken = this._register(new Emitter<GitHubCredentialChange>());
	readonly onDidChangeToken = this._onDidChangeToken.event;

	constructor(@IAuthenticationService private readonly _authenticationService: IAuthenticationService) {
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
			const renewed = event.event.changed?.filter(session => !changed?.includes(session));
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
			if (renewed?.length) {
				this._onDidChangeToken.fire({ providerId: event.providerId, sessionIds: renewed.map(session => session.id) });
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

	async resolveClient(authorization: GitHubAuthorizationContext, signal: AbortSignal): Promise<GitHubClientOptions> {
		if (authorization.providerId !== 'github' && authorization.providerId !== 'github-enterprise') {
			throw new GitHubRequestError(localize('githubProviderUnavailable', "The selected authentication provider is not a GitHub provider."), 'authentication');
		}
		const session = await this.getSession(authorization, signal);
		if (!session) {
			throw new GitHubRequestError(localize('githubGrantUnavailable', "The selected GitHub session or permissions are no longer available."), 'authentication');
		}
		const issuer = session.authorizationServer?.toString();
		if (issuer !== undefined) {
			normalizeReadApiBaseUri(issuer);
		}
		const endpoints = deriveGitHubEndpoints(issuer);
		if (authorization.providerId === 'github' ? endpoints.enterpriseHost !== undefined : !issuer || endpoints.enterpriseHost === undefined) {
			throw new GitHubRequestError(localize('githubEndpointUnavailable', "The selected GitHub session does not identify a matching GitHub endpoint."), 'authentication');
		}
		return {
			authorization: {
				providerId: authorization.providerId, sessionId: session.id, accountId: session.account.id,
				scopes: [...session.scopes], authorizationServer: issuer,
			},
			apiBaseUri: endpoints.apiBaseUri,
			graphQlUri: endpoints.graphQlUri,
			missionControl: getWorkbenchMissionControlOptions(authorization.providerId, endpoints.enterpriseHost),
		};
	}

	async getToken(context: GitHubAuthorizationContext, signal: AbortSignal): Promise<string | undefined> {
		return (await this.getSession(context, signal))?.accessToken;
	}

	private async getSession(context: GitHubAuthorizationContext, signal: AbortSignal): Promise<AuthenticationSession | undefined> {
		const sessions = await this.getSessions(context.providerId, signal);
		return sessions.find(session => session.id === context.sessionId
			&& (context.accountId === undefined || session.account.id === context.accountId)
			&& session.authorizationServer?.toString() === context.authorizationServer
			&& scopesMatch(session.scopes, context.scopes));
	}
}

function sessionGrant(session: AuthenticationSession): IGitHubSessionGrant {
	return { accountId: session.account.id, scopes: [...session.scopes], authorizationServer: session.authorizationServer?.toString() };
}

registerSingleton(IGitHubCredentialBroker, WorkbenchGitHubCredentialProvider, InstantiationType.Delayed);

export function getWorkbenchMissionControlOptions(providerId: string, enterpriseHost: string | undefined): MissionControlClientOptions | undefined {
	return providerId === 'github' && enterpriseHost === undefined ? {
		endpoint: {
			apiBaseUri: `${GITHUB_DOT_COM_COPILOT_API_BASE_URI}/agents`,
			feedApiBaseUri: `${deriveGitHubEndpoints(undefined).apiBaseUri}/cmc_internal/api/agents`,
			integrationId: COPILOT_INTEGRATION_ID,
		},
	} : undefined;
}
