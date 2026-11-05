/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../base/common/stopwatch.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IReference, toDisposable } from '../../../base/common/lifecycle.js';
import { CloudSandboxDiscovery } from '../../agentHost/common/cloudSandboxDiscovery.js';
import { CloudSandboxRequestError, ICloudSandboxDiscoveryOptions } from '../../agentHost/common/cloudSandboxAgentHost.js';
import { CloudSandboxDiscoveryCoordinator, ICloudSandboxDiscoverySubscription } from '../../agentHost/common/cloudSandboxDiscoveryService.js';
import { CloudSandboxSessionFeed, SessionFeedSocket, validateSessionFeedConnection } from '../../agentHost/common/cloudSandboxSessionFeed.js';
import { CloudSandboxDiscoveryTelemetry } from '../../agentHost/common/cloudSandboxDiscoveryTelemetry.js';
import { replayTaskAhpEvents } from '../../agentHost/common/taskEventReplay.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AccountClient } from './account/accountClient.js';
import { IGitHubAccountClient } from './account/account.js';
import { AuthenticatedRequestProviders } from './githubService.js';
import { GitHubClientOptions, GitHubRequestError } from './githubTypes.js';
import { ApiRequestError } from './missionControl/missionControlClient.js';
import { ListTasksOptions } from './missionControl/tasks.js';

interface DiscoveryEntry {
	readonly key: string;
	readonly token: string;
	readonly coordinator: CloudSandboxDiscoveryCoordinator;
	readonly clients: Set<IGitHubAccountClient>;
}

/** Shares only identical credentials and approved endpoint/profile/grant bindings. */
export class CloudSandboxDiscoveryRegistry extends Disposable {
	private readonly _entries = new Set<DiscoveryEntry>();
	private readonly _telemetry: CloudSandboxDiscoveryTelemetry;

	constructor(
		private readonly _createSocket: (url: string, protocol: string) => SessionFeedSocket | Promise<SessionFeedSocket>,
		private readonly _logService: ILogService,
		telemetryService: ITelemetryService,
	) {
		super();
		this._telemetry = new CloudSandboxDiscoveryTelemetry(telemetryService);
		this._register(toDisposable(() => {
			for (const entry of this._entries) {
				entry.coordinator.dispose();
				for (const client of entry.clients) {
					client.dispose();
				}
			}
			this._entries.clear();
		}));
	}

	acquire(options: GitHubClientOptions, credential: string, profile: string, reference: IReference<AuthenticatedRequestProviders>): ICloudSandboxDiscoverySubscription {
		const lifetime = new DisposableStore();
		const client = lifetime.add(new AccountClient(options.authorization, reference.object, reference));
		if (!options.missionControl || !credential) {
			lifetime.dispose();
			throw new GitHubRequestError('Cloud discovery requires an approved Mission Control grant', 'authorization');
		}
		const key = JSON.stringify([profile, options.authorization.providerId, options.authorization.sessionId, options.authorization.accountId,
			[...options.authorization.scopes].sort(), options.authorization.authorizationServer, options.apiBaseUri, options.missionControl]);
		let entry = [...this._entries].find(entry => entry.key === key && entry.token === credential);
		if (!entry) {
			const clients = new Set<IGitHubAccountClient>();
			const getClient = () => {
				const current = clients.values().next().value;
				if (!current) {
					throw new GitHubRequestError('No live window supplies the cloud discovery credential', 'authentication');
				}
				return current;
			};
			const source = new CloudSandboxDiscovery({
				apiBaseUri: options.missionControl.endpoint.apiBaseUri,
				listTasks: async (url, token, onRequest) => {
					const query = new URL(url).searchParams;
					const filters: NonNullable<ListTasksOptions['query']> = {
						per_page: Number(query.get('per_page')),
						...(query.has('page') ? { page: Number(query.get('page')) } : {}),
						sort: 'updated_at', direction: 'desc',
						with_repo: query.get('with_repo') === 'true', is_archived: query.get('is_archived') === 'true',
						...(query.has('since') ? { since: query.get('since')!, include_environment_kinds: 'managed-sandbox' } : {}),
					};
					// Preserve cursor parameters without accepting a response-supplied host.
					onRequest();
					const response = await withRead(token, signal => getClient().tasks.list(signal, { query: { ...Object.fromEntries(query), ...filters }, caller: 'mc.taskClient.list', priority: 'background', noCache: true }));
					return { tasks: response.data.tasks, serverDate: response.serverDate, link: response.nextLink ? `<${response.nextLink}>; rel="next"` : undefined };
				},
				getTask: (id, token) => withRead(token, signal => getClient().tasks.get(id, signal, { caller: 'mc.taskClient.get', priority: 'background', noCache: true })),
				resolveRepositoryName: async (id, token) => {
					try {
						return (await withRead(token, signal => getClient().repositories.getById(id, signal, { caller: 'mc.repositoryClient.get', priority: 'background' }))).full_name;
					} catch (error) {
						if (token.isCancellationRequested) {
							throw error;
						}
						this._logService.warn('[CloudSandboxDiscovery] Repository lookup failed');
						return undefined;
					}
				},
				getSessionHistory: async (id, token) => {
					const response = await withRead(token, signal => getClient().tasks.getAhpEvents(id, signal, { caller: 'mc.taskClient.getEvents', priority: 'background' }));
					return replayTaskAhpEvents(response.events);
				},
				reportDiscovery: data => this._telemetry.reportDiscovery(data),
			}, this._logService);
			const feed = new CloudSandboxSessionFeed(refresh => {
				void coordinator.refresh(refresh.reason === 'change' ? { taskIds: refresh.taskIds }
					: { incremental: refresh.reason === 'renewal', trigger: refresh.reason === 'renewal' ? 'feedRenewal' : 'feedReconnect' });
			}, this._createSocket, () => StopWatch.create(), {
				connectSessionFeed: async token => {
					try {
						const connection = await withRead(token, signal => getClient().tasks.connectFeed(signal, { caller: 'mc.sessionFeed.connect', deadline: Date.now() + 10_000 }));
						validateSessionFeedConnection(connection);
						return connection;
					} catch (error) {
						if (error instanceof CloudSandboxRequestError && (error.statusCode === 403 || error.statusCode === 404)) {
							return undefined;
						}
						throw error;
					}
				},
			}, this._logService, this._telemetry);
			const coordinator = new CloudSandboxDiscoveryCoordinator(source, feed, this._logService);
			entry = { key, token: credential, coordinator, clients };
			this._entries.add(entry);
		}
		const owned = entry;
		owned.clients.add(client);
		const invalidated = lifetime.add(new Emitter<void>());
		let disposed = false;
		const release = toDisposable(() => {
			disposed = true;
			owned.coordinator.removeConsumer(client);
			owned.clients.delete(client);
			if (!owned.clients.size) {
				this._entries.delete(owned);
				owned.coordinator.dispose();
			}
		});
		lifetime.add(release);
		const invalidate = () => {
			if (!disposed) {
				release.dispose();
				invalidated.fire();
				lifetime.dispose();
			}
		};
		lifetime.add(client.onDidInvalidate(invalidate));
		lifetime.add(client.onDidChangeCredentials(invalidate));
		const checkAvailable = () => {
			if (disposed) {
				throw new GitHubRequestError('Cloud discovery subscription was released', 'authorization');
			}
		};
		return {
			onDidChange: (listener, thisArgs, disposables) => {
				checkAvailable();
				const subscription = owned.coordinator.onDidChange(listener, thisArgs, disposables);
				listener.call(thisArgs, owned.coordinator.snapshot);
				return subscription;
			},
			onDidInvalidate: invalidated.event,
			refresh: (options: ICloudSandboxDiscoveryOptions, token: CancellationToken) => {
				checkAvailable();
				return owned.coordinator.refresh(options, token);
			},
			setDemand: async (archived, focused) => {
				checkAvailable();
				owned.coordinator.setDemand(client, archived, focused);
			},
			reconcile: mutation => {
				checkAvailable();
				return owned.coordinator.reconcile(mutation);
			},
			dispose: () => lifetime.dispose(),
		};
	}
}

async function withRead<T>(token: CancellationToken, read: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const store = new DisposableStore();
	try {
		return await read(CancellationToken.toAbortSignal(token, store));
	} catch (error) {
		if (error instanceof ApiRequestError) {
			throw new CloudSandboxRequestError(error.statusCode, error.message, error.retryAfterSeconds);
		}
		throw error;
	} finally {
		store.dispose();
	}
}
