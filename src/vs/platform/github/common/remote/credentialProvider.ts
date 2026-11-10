/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { scopesMatch } from '../../../../base/common/oauth.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { parse } from '../client/schema.js';
import { normalizeReadApiBaseUri } from '../githubEndpoints.js';
import { GitHubAuthorizationContext, GitHubClientOptions, GitHubCredentialChange, GitHubRequestError, IGitHubCredentialProvider } from '../githubTypes.js';
import { MissionControlClient, parseMissionControlOptions } from '../missionControl/missionControlClient.js';
import { parseAuthorization } from './ipc.js';
import { parseClientResponse } from './serialization.js';

export class RemoteGitHubCredentialProvider extends Disposable implements IGitHubCredentialProvider {
	private readonly _onDidChange = this._register(new Emitter<GitHubCredentialChange>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _onDidChangeToken = this._register(new Emitter<GitHubCredentialChange>());
	readonly onDidChangeToken = this._onDidChangeToken.event;

	constructor(private readonly channel: IChannel) {
		super();
		this._register(channel.listen<unknown>('onDidChange')(change => this._onDidChange.fire(parseCredentialChange(change))));
		this._register(channel.listen<unknown>('onDidChangeToken')(change => this._onDidChangeToken.fire(parseCredentialChange(change))));
	}

	async resolveClient(authorization: GitHubAuthorizationContext, signal: AbortSignal): Promise<GitHubClientOptions> {
		const options = await this.call('resolveClient', authorization, signal, parseClientOptions);

		const resolved = options.authorization;
		if (resolved.providerId !== authorization.providerId
			|| resolved.sessionId !== authorization.sessionId
			|| !resolved.accountId
			|| authorization.accountId !== undefined && resolved.accountId !== authorization.accountId
			|| resolved.authorizationServer !== authorization.authorizationServer
			|| !scopesMatch(resolved.scopes, authorization.scopes)) {
			throw new GitHubRequestError('GitHub credential callback returned a different grant', 'authentication');
		}

		const apiBaseUri = normalizeReadApiBaseUri(options.apiBaseUri);
		const graphQlUri = normalizeReadApiBaseUri(options.graphQlUri);
		if (new URL(apiBaseUri).origin !== new URL(graphQlUri).origin) {
			throw new GitHubRequestError('GitHub credential callback returned mismatched endpoints', 'validation');
		}

		return {
			authorization: resolved,
			apiBaseUri,
			graphQlUri,
			missionControl: MissionControlClient.normalizeOptions(options.missionControl)
		};
	}

	async getToken(authorization: GitHubAuthorizationContext, signal: AbortSignal): Promise<string | undefined> {
		const lifetime = new DisposableStore();
		const controller = new AbortController();
		lifetime.add(this.onDidChangeToken(change => {
			if (change.providerId === authorization.providerId && (!change.sessionIds || change.sessionIds.includes(authorization.sessionId))) {
				controller.abort(new GitHubRequestError('GitHub token changed during credential resolution', 'authentication'));
			}
		}));

		try {
			return await this.call('getToken', authorization, AbortSignal.any([signal, controller.signal]), parse.optional(parse.nonEmptyString));
		} finally {
			lifetime.dispose();
		}
	}

	private async call<T>(command: string, authorization: GitHubAuthorizationContext, signal: AbortSignal, parser: parse.Parser<T>): Promise<T> {
		const lifetime = new DisposableStore();
		try {
			signal.throwIfAborted();
			const token = CancellationToken.fromAbortSignal(signal, lifetime);
			const response = await this.channel.call(command, authorization, token);
			signal.throwIfAborted();
			return parseClientResponse(response, parser);
		} catch (error) {
			signal.throwIfAborted();
			throw error;
		} finally {
			lifetime.dispose();
		}
	}
}

const parseClientOptions = parse.object<GitHubClientOptions>({
	authorization: parseAuthorization,
	apiBaseUri: parse.nonEmptyString,
	graphQlUri: parse.nonEmptyString,
	missionControl: parse.optional(parseMissionControlOptions),
});

const parseCredentialChange = parse.object<GitHubCredentialChange>({
	providerId: parse.nonEmptyString,
	sessionIds: parse.optional(parse.arrayOf(parse.nonEmptyString)),
});
