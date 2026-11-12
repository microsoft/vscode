/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { equals } from '../../../../../../base/common/objects.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { NotificationType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';

const pendingTargetFolderTrustChecks = new WeakMap<IWorkspaceTrustManagementService, ResourceMap<Promise<boolean>>>();

/** Shares concurrent target-folder trust checks, falling back to workspace trust only when no folder is known. */
export async function isAgentHostTargetFolderTrusted(workingDirectory: URI | undefined, workspaceTrustManagementService: IWorkspaceTrustManagementService): Promise<boolean> {
	if (!workingDirectory) {
		return workspaceTrustManagementService.isWorkspaceTrusted();
	}
	let checks = pendingTargetFolderTrustChecks.get(workspaceTrustManagementService);
	if (!checks) {
		checks = new ResourceMap();
		pendingTargetFolderTrustChecks.set(workspaceTrustManagementService, checks);
	}
	let check = checks.get(workingDirectory);
	if (!check) {
		check = workspaceTrustManagementService.getUriTrustInfo(workingDirectory).then(info => info.trusted);
		checks.set(workingDirectory, check);
	}
	try {
		return await check;
	} finally {
		if (checks.get(workingDirectory) === check) {
			checks.delete(workingDirectory);
		}
	}
}

/** Shares initial config reads until the chat, owning connection, backend, working directory, defaults or trust change. */
export class AgentHostInitialSessionConfig extends Disposable {
	private readonly _onDidInvalidate = this._register(new Emitter<void>());
	readonly onDidInvalidate = this._onDidInvalidate.event;
	private _generation = 0;
	private _trustCheckGeneration: number | undefined;
	private _value: ResolveSessionConfigResult | undefined;
	private _request: {
		readonly sessionResource: URI;
		readonly provider: string;
		readonly resolution: IAgentHostSessionResolution;
		readonly workingDirectory: URI | undefined;
		readonly config: Record<string, unknown> | undefined;
		readonly promise: Promise<ResolveSessionConfigResult | undefined>;
	} | undefined;

	constructor(
		private readonly _onError: (error: unknown) => void,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super();
		this._register(toDisposable(() => this.clear()));
		const invalidate = () => {
			this.clear();
			this._onDidInvalidate.fire();
		};
		this._register(this._workspaceTrustManagementService.onDidChangeTrust(invalidate));
		this._register(this._workspaceTrustManagementService.onDidChangeTrustedFolders(() => {
			// A pending source lookup returns current trust after its own folder notifications.
			if (this._trustCheckGeneration === undefined) {
				invalidate();
			}
		}));
	}

	get value(): ResolveSessionConfigResult | undefined { return this._value; }

	isPending(sessionResource: URI, resolution: IAgentHostSessionResolution): boolean {
		return this._value === undefined && this.isCurrent(sessionResource, resolution);
	}

	isCurrent(sessionResource: URI, resolution: IAgentHostSessionResolution): boolean {
		const request = this._request;
		return !!request && isEqual(request.sessionResource, sessionResource)
			&& request.resolution.connection === resolution.connection
			&& request.resolution.connectionAuthority === resolution.connectionAuthority
			&& isEqual(request.resolution.backendSession, resolution.backendSession);
	}

	clear(): void {
		this._generation++;
		this._trustCheckGeneration = undefined;
		this._request = undefined;
		this._value = undefined;
	}

	resolve(sessionResource: URI, provider: string, resolution: IAgentHostSessionResolution, workingDirectory: URI | undefined, config?: Record<string, unknown>): Promise<ResolveSessionConfigResult | undefined> {
		if (this._store.isDisposed) {
			return Promise.resolve(undefined);
		}
		const current = this._request;
		if (current && current.provider === provider && this.isCurrent(sessionResource, resolution) && isEqual(current.workingDirectory, workingDirectory) && equals(current.config, config)) {
			return current.promise;
		}
		const generation = ++this._generation;
		this._trustCheckGeneration = generation;
		this._value = undefined;
		const operation = Promise.resolve().then(async () => {
			if (generation !== this._generation) {
				return undefined;
			}
			let trusted: boolean;
			try {
				trusted = await isAgentHostTargetFolderTrusted(workingDirectory, this._workspaceTrustManagementService);
			} finally {
				if (this._trustCheckGeneration === generation) {
					this._trustCheckGeneration = undefined;
				}
			}
			if (!trusted || generation !== this._generation) {
				return undefined;
			}
			return resolution.connection.resolveSessionConfig({
				provider,
				workingDirectory,
				...(config ? { config } : {}),
			});
		});
		const promise = this._read(operation, generation);
		this._request = { sessionResource, provider, resolution, workingDirectory, config, promise };
		return promise;
	}

	private async _read(operation: Promise<ResolveSessionConfigResult | undefined>, generation: number): Promise<ResolveSessionConfigResult | undefined> {
		try {
			const result = await operation;
			if (generation === this._generation) {
				if (result === undefined) {
					this.clear();
				} else {
					this._value = result;
				}
				return result;
			}
			return undefined;
		} catch (error) {
			if (generation === this._generation) {
				this.clear();
				this._onError(error);
			}
			return undefined;
		}
	}
}

/** Retries an early subscription failure once the host announces that the session exists. */
export function retrySessionConfigSubscriptionOnCreation(connection: IAgentConnection, session: URI, subscription: IAgentSubscription<SessionState>, retry: () => void): IDisposable {
	const store = new DisposableStore();
	let creationAnnounced = false;
	const retryIfFailed = () => {
		if (creationAnnounced && subscription.value instanceof Error) {
			creationAnnounced = false;
			// Let every consumer observe the error before retrying disposes the shared subscription.
			queueMicrotask(() => {
				if (!store.isDisposed) {
					retry();
				}
			});
		}
	};
	store.add(connection.onDidNotification(notification => {
		if (notification.type === NotificationType.SessionAdded && isEqual(URI.parse(notification.summary.resource), session)) {
			creationAnnounced = subscription.value === undefined || subscription.value instanceof Error;
			retryIfFailed();
		}
	}));
	store.add(subscription.onDidChange(() => creationAnnounced = false));
	if (subscription.onDidError) {
		store.add(subscription.onDidError(retryIfFailed));
	}
	return store;
}
