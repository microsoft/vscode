/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, cancelOnDispose } from '../../../../base/common/cancellation.js';
import { isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IChannel, IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../../log/common/log.js';
import { IGitHubAccountClient } from '../account/account.js';
import { AccountClient } from '../account/accountClient.js';
import { IGitHubAnonymousClient } from '../anonymous/anonymous.js';
import { AnonymousClient } from '../anonymous/anonymousClient.js';
import { ApiRequest, ApiResponse, BufferedApiRequestProvider } from '../client/request.js';
import { withGitHubCredentialDeadline } from '../githubCredentialService.js';
import { GitHubAuthorizationContext, GitHubRequestError } from '../githubTypes.js';
import { MutationUncertainError, missionControlRequestPolicy } from '../missionControl/missionControlClient.js';
import { RequestError } from '../types.js';
import { ApiRequestMessage, ApiRequestTarget, ClientResponse, IGitHubCredentialBroker, ISharedProcessGitHubService, parseAuthorization, parseBodyText, parseRequestEnvelope } from './ipc.js';
import { deserializeGitHubError, parseApiResponse, parseClientResponse, serializeGitHubError } from './serialization.js';

/** GitHub IPC channel client implementation. */
export class GitHubChannelClient implements ISharedProcessGitHubService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly channel: IChannel,
		@ILogService private readonly logService: ILogService,
	) { }

	async acquireAnonymousClient(cancellationToken: CancellationToken): Promise<IGitHubAnonymousClient> {
		return this.acquire(undefined, cancellationToken);
	}

	async acquireClient(authorization: GitHubAuthorizationContext, cancellationToken: CancellationToken): Promise<IGitHubAccountClient> {
		CancellationToken.throwIfCanceled(cancellationToken);
		return this.acquire(parseAuthorization(authorization), cancellationToken);
	}

	private acquire(authorization: undefined, cancellationToken: CancellationToken): Promise<IGitHubAnonymousClient>;
	private acquire(authorization: GitHubAuthorizationContext, cancellationToken: CancellationToken): Promise<IGitHubAccountClient>;
	private async acquire(authorization: GitHubAuthorizationContext | undefined, cancellationToken: CancellationToken): Promise<IGitHubAnonymousClient | IGitHubAccountClient> {
		CancellationToken.throwIfCanceled(cancellationToken);
		const clientId = generateUuid();
		let acquired = false;
		try {
			const resolved = authorization
				? parseClientResponse(await raceCancellationError(this.channel.call('acquireClient', { clientId, authorization }, cancellationToken), cancellationToken), parseAuthorization)
				: await raceCancellationError(this.channel.call<void>('acquireAnonymousClient', { clientId }, cancellationToken), cancellationToken);
			CancellationToken.throwIfCanceled(cancellationToken);

			const lease = new DisposableStore();
			const clientToken = cancelOnDispose(lease);
			lease.add(toDisposable(() => this.releaseClient(clientId)));
			const provider = new RemoteApiRequestProvider(this.channel, clientId, 'rest', clientToken);
			const graphql = new RemoteApiRequestProvider(this.channel, clientId, 'graphql', clientToken);
			const rawContent = new RemoteApiRequestProvider(this.channel, clientId, 'rawContent', clientToken);
			const client = resolved ? new AccountClient(resolved, {
				rest: provider, graphql, rawContent,
				missionControl: new RemoteApiRequestProvider(this.channel, clientId, 'missionControl', clientToken),
				connectors: new RemoteApiRequestProvider(this.channel, clientId, 'connectors', clientToken),
				onDidInvalidate: this.channel.listen('onDidInvalidate', { clientId }),
				onDidChangeCredentials: this.channel.listen('onDidChangeCredentials', { clientId }),
			}, lease) : new AnonymousClient(provider, rawContent, lease);
			acquired = true;
			return client;
		} finally {
			if (!acquired) {
				this.releaseClient(clientId);
			}
		}
	}

	private releaseClient(clientId: string): void {
		void this.channel.call<void>('releaseClient', { clientId }).catch(error => {
			if (!isCancellationError(error)) {
				this.logService.error('[GitHubChannelClient] Failed to release client lease', error);
			}
		});
	}
}

/** Serves credentials only on the acquiring renderer's reverse channel. */
export class GitHubCredentialsChannel extends Disposable implements IServerChannel<string> {
	private readonly _disposeToken = cancelOnDispose(this._store);

	constructor(private readonly broker: IGitHubCredentialBroker) {
		super();
	}

	async call<T>(_ctx: string, command: string, arg?: unknown, cancellationToken: CancellationToken = CancellationToken.None): Promise<T> {
		const lifetime = new DisposableStore();
		try {
			const authorization = parseAuthorization(arg);
			const combinedToken = CancellationToken.any([cancellationToken, this._disposeToken], lifetime);
			const value = await withGitHubCredentialDeadline(combinedToken, async cancellationToken => {
				switch (command) {
					case 'resolveClient': return this.broker.resolveClient(authorization, cancellationToken);
					case 'getToken': return this.broker.getToken(authorization, cancellationToken);
				}
				throw new Error(`Unknown command: ${command}`);
			});
			return [{ type: 'success', value }, undefined] satisfies ClientResponse<typeof value> as T;
		} catch (error) {
			return serializeGitHubError(error) as T;
		} finally {
			lifetime.dispose();
		}
	}

	listen<T>(_ctx: string, event: string): Event<T> {
		if (this._store.isDisposed) {
			throw new GitHubRequestError('GitHub credential callback was disposed', 'authentication');
		}
		switch (event) {
			case 'onDidChange': return this.broker.onDidChange as Event<T>;
			case 'onDidChangeToken': return (this.broker.onDidChangeToken ?? Event.None) as Event<T>;
		}
		throw new Error(`Unknown event: ${event}`);
	}
}

/** Forwards serialized bodies for one lease and parses responses in the calling process. */
export class RemoteApiRequestProvider extends BufferedApiRequestProvider {
	constructor(
		private readonly channel: IChannel,
		private readonly clientId: string,
		private readonly target: ApiRequestTarget,
		clientToken: CancellationToken,
	) {
		super(clientToken);
	}

	protected override checkResponseCancellation(request: Omit<ApiRequest, 'body'>, cancellationToken: CancellationToken): void {
		if (cancellationToken.isCancellationRequested && this.tracksOutcome && missionControlRequestPolicy(request).mutation) {
			throw new MutationUncertainError('unknown');
		}
		CancellationToken.throwIfCanceled(cancellationToken);
	}

	private get tracksOutcome(): boolean {
		return this.target === 'missionControl';
	}

	protected async execute(request: Omit<ApiRequest, 'body'>, cancellationToken: CancellationToken, bodyText?: string): Promise<ApiResponse<string | undefined>> {
		const lifetime = new DisposableStore();
		let sent = false;
		let received = false;
		try {
			const token = cancellationToken;
			const requestId = this.tracksOutcome ? generateUuid() : undefined;
			const message: ApiRequestMessage = [parseRequestEnvelope({ clientId: this.clientId, target: this.target, request, requestId }), parseBodyText(bodyText)];
			if (requestId) {
				lifetime.add(token.onCancellationRequested(() => {
					void this.channel.call('cancelRequest', { clientId: this.clientId, requestId }).catch(error => {
						if (!isCancellationError(error)) {
							onUnexpectedError(error);
						}
					});
				}));
			}
			sent = true;
			const [metadata, responseText] = parseApiResponse(await this.channel.call('request', message, requestId ? CancellationToken.None : token));
			received = true;
			if (metadata.type === 'error') {
				throw deserializeGitHubError(metadata.error, responseText);
			}
			this.checkResponseCancellation(request, cancellationToken);
			return { data: responseText, status: metadata.status, ...(metadata.metadata ? { metadata: metadata.metadata } : {}) };
		} catch (error) {
			if (this.tracksOutcome && sent && !received && missionControlRequestPolicy(request).mutation) {
				throw new MutationUncertainError(error instanceof RequestError ? error.kind : 'unknown');
			}
			throw error;
		} finally {
			lifetime.dispose();
		}
	}
}
