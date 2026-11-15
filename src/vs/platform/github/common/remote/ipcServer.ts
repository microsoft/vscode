/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ChannelServer, IChannel, IPCServer, IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { parse, SchemaError } from '../client/schema.js';
import { withGitHubCredentialDeadline } from '../githubCredentialService.js';
import { ApiRequestProviders, IGitHubRequestProviderScope, IGitHubService } from '../githubService.js';
import { GitHubAuthorizationContext, GitHubRequestError } from '../githubTypes.js';
import { RemoteGitHubCredentialProvider } from './credentialProvider.js';
import { AcquireClientRequest, ApiRequestMessage, ApiResponseMessage, ClientRequest, ClientResponse, GITHUB_CHANNEL_NAME, GITHUB_CREDENTIALS_CHANNEL_NAME, parseAuthorization, parseBodyText, parseRequestEnvelope } from './ipc.js';
import { serializeGitHubError } from './serialization.js';

/** Registers a separate lease owner for each physical connection, even when connection contexts repeat. */
export function registerGitHubChannel(server: IPCServer<string>, service: IGitHubService): IDisposable {
	const lifetime = new DisposableStore();
	const channels = lifetime.add(new DisposableMap<ChannelServer<string>, GitHubChannel>());
	const register = (connection: IPCServer<string>['connections'][number]) => {
		const channel = new GitHubChannel(connection.channelClient.getChannel(GITHUB_CREDENTIALS_CHANNEL_NAME), service);
		channels.set(connection.channelServer, channel);
		connection.channelServer.registerChannel(GITHUB_CHANNEL_NAME, channel);
	};
	lifetime.add(server.onDidAddConnection(register));
	lifetime.add(server.onDidRemoveConnection(connection => channels.deleteAndDispose(connection.channelServer)));
	for (const connection of server.connections) {
		register(connection);
	}
	return lifetime;
}

/** Owns one connection's leases; per-call cancellation never owns an acquired lease. */
class GitHubChannel extends Disposable implements IServerChannel<string> {
	private readonly clients = this._register(new DisposableMap<string, IReference<ApiRequestProviders>>());
	private readonly pendingAcquisitions = this._register(new DisposableMap<string, DisposableStore>());
	private readonly pendingRequests = this._register(new DisposableMap<string, DisposableStore>());
	private readonly credentials = this._register(new MutableDisposable<RemoteGitHubCredentialProvider>());
	private readonly credentialScope = this._register(new MutableDisposable<IGitHubRequestProviderScope>());

	constructor(
		private readonly credentialsChannel: IChannel,
		@IGitHubService private readonly service: IGitHubService,
	) {
		super();
	}

	async call<T>(_ctx: string, command: string, arg?: unknown, token: CancellationToken = CancellationToken.None): Promise<T> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this._store.isDisposed) {
			throw new GitHubRequestError('GitHub connection was disposed', 'unknown');
		}
		switch (command) {
			case 'cancelRequest': {
				const { clientId, requestId } = parseCancellation(arg);
				this.pendingRequests.deleteAndDispose(`${clientId}\0${requestId}`);
				return undefined as T;
			}
			case 'acquireAnonymousClient': {
				const { clientId } = parseClientRequest(arg);
				this.checkAvailableClientId(clientId);
				this.clients.set(clientId, this.service.acquireAnonymousRequestProviders());
				return undefined as T;
			}
			case 'releaseClient': {
				const { clientId } = parseClientRequest(arg);
				this.pendingAcquisitions.deleteAndDispose(clientId);
				this.clients.deleteAndDispose(clientId);
				return undefined as T;
			}
			case 'acquireClient':
				return await this.acquireClient(parseAcquireClientRequest(arg), token) as T;
			case 'request':
				return await this.request(arg, token) as T;
		}
		throw new Error(`Unknown command: ${command}`);
	}

	private checkAvailableClientId(clientId: string): void {
		if (this.clients.has(clientId) || this.pendingAcquisitions.has(clientId)) {
			throw new GitHubRequestError('GitHub client lease already exists', 'validation');
		}
	}

	private async acquireClient(request: AcquireClientRequest, cancellationToken: CancellationToken): Promise<ClientResponse<GitHubAuthorizationContext>> {
		this.checkAvailableClientId(request.clientId);
		const lifetime = new DisposableStore();
		this.pendingAcquisitions.set(request.clientId, lifetime);
		const controller = new AbortController();
		lifetime.add(toDisposable(() => controller.abort(new CancellationError())));
		try {
			const credentials = this.credentials.value ??= new RemoteGitHubCredentialProvider(this.credentialsChannel);
			const scope = this.credentialScope.value ??= this.service.createRequestProviderScope(credentials);
			lifetime.add(credentials.onDidChange(change => {
				if (change.providerId === request.authorization.providerId && (!change.sessionIds || change.sessionIds.includes(request.authorization.sessionId))) {
					controller.abort(new GitHubRequestError('GitHub client grant changed during acquisition', 'authentication'));
				}
			}));
			const signal = AbortSignal.any([controller.signal, CancellationToken.toAbortSignal(cancellationToken, lifetime)]);
			const options = await withGitHubCredentialDeadline(signal, signal => credentials.resolveClient(request.authorization, signal));
			signal.throwIfAborted();
			const client = scope.acquireClient(options);
			this.clients.set(request.clientId, client);
			return [{ type: 'success', value: client.object.authorization }, undefined];
		} catch (error) {
			return serializeGitHubError(error);
		} finally {
			if (this.pendingAcquisitions.get(request.clientId) === lifetime) {
				this.pendingAcquisitions.deleteAndDispose(request.clientId);
			}
		}
	}

	private async request(arg: unknown, cancellationToken: CancellationToken): Promise<ApiResponseMessage> {
		const lifetime = new DisposableStore();
		let pendingKey: string | undefined;
		try {
			const [metadata, bodyText] = parseApiRequest(arg);
			const client = this.clients.get(metadata.clientId);
			if (!client) {
				throw new GitHubRequestError('GitHub client lease is not available for this connection', 'authorization');
			}
			const provider = client.object[metadata.target];
			if (!provider) {
				if (metadata.target === 'graphql') {
					throw new GitHubRequestError('GitHub GraphQL requests require an authenticated client', 'authentication');
				}
				throw new GitHubRequestError('The requested API endpoint is not configured for this client', 'validation');
			}
			const controller = new AbortController();
			lifetime.add(toDisposable(() => controller.abort(new CancellationError())));
			if (metadata.requestId) {
				pendingKey = `${metadata.clientId}\0${metadata.requestId}`;
				if (this.pendingRequests.has(pendingKey)) {
					pendingKey = undefined;
					throw new GitHubRequestError('GitHub request is already in progress', 'validation');
				}
				this.pendingRequests.set(pendingKey, lifetime);
			}
			const signal = AbortSignal.any([CancellationToken.toAbortSignal(cancellationToken, lifetime), controller.signal]);
			const response = await provider.requestText(metadata.request, signal, bodyText);
			return [{ type: 'success', status: response.status, ...(response.metadata ? { metadata: response.metadata } : {}) }, response.data];
		} catch (error) {
			return serializeGitHubError(error);
		} finally {
			if (pendingKey && this.pendingRequests.get(pendingKey) === lifetime) {
				this.pendingRequests.deleteAndDispose(pendingKey);
			}
			lifetime.dispose();
		}
	}

	listen<T>(_ctx: string, event: string, arg?: unknown): Event<T> {
		const client = this.clients.get(parseClientRequest(arg).clientId);
		if (!client) {
			throw new GitHubRequestError('GitHub client lease is not available for this connection', 'authorization');
		}
		switch (event) {
			case 'onDidInvalidate': return (client.object.onDidInvalidate ?? Event.None) as Event<T>;
			case 'onDidChangeCredentials': return (client.object.onDidChangeCredentials ?? Event.None) as Event<T>;
		}
		throw new Error(`Unknown event: ${event}`);
	}
}

const parseClientRequest = parse.object<ClientRequest>({ clientId: parse.nonEmptyString });
const parseCancellation = parse.object({ clientId: parse.nonEmptyString, requestId: parse.nonEmptyString });

const parseAcquireClientRequest = parse.object<AcquireClientRequest>({
	clientId: parse.nonEmptyString,
	authorization: parseAuthorization,
});

function parseApiRequest(value: unknown): ApiRequestMessage {
	if (!Array.isArray(value) || value.length !== 2) {
		throw new SchemaError('Expected an API request tuple');
	}
	return [parseRequestEnvelope(value[0]), parseBodyText(value[1])];
}
