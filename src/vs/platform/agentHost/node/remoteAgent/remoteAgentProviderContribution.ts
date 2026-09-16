/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, MutableDisposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ILogService } from '../../../log/common/log.js';
import type { IAgentHostRemoteTargetHandle } from '../../common/agentHostRemoteAgents.js';
import { isRemoteAgentHostSessionType } from '../../common/agentHostSessionType.js';
import type { IAgentConnection } from '../../common/agentService.js';
import type { AgentInfo } from '../../common/state/protocol/state.js';
import { IAgentHostProviderService } from '../agentHostProviderService.js';
import { IAgentHostRemoteAgentsService } from '../agentHostRemoteAgentsService.js';
import { RemoteAgent, type IRemoteAgentResidentChat } from './remoteAgent.js';

class RemoteProviderRegistration extends Disposable {
	constructor(
		readonly agent: RemoteAgent,
		registration: IDisposable,
	) {
		super();
		this._register(registration);
	}
}

class RemoteTargetProviderContribution extends Disposable {
	private readonly _providers = this._register(new DisposableMap<string, RemoteProviderRegistration>());
	private readonly _connectionListener = this._register(new MutableDisposable<DisposableStore>());
	private readonly _residentChats: Map<string, readonly IRemoteAgentResidentChat[]>;
	private _connection: IAgentConnection | undefined;
	private _label: string;

	constructor(
		private readonly _target: IAgentHostRemoteTargetHandle,
		private readonly _providerService: IAgentHostProviderService,
		private readonly _logService: ILogService,
		residentChats?: ReadonlyMap<string, readonly IRemoteAgentResidentChat[]>,
	) {
		super();
		this._residentChats = new Map(residentChats);
		this._label = _target.label.get();
		this._register(_target.onDidDispose(() => this.dispose()));
		this._register(autorun(reader => {
			const label = _target.label.read(reader);
			const connection = _target.connection.read(reader);
			this._label = label;
			if (connection) {
				this._setConnection(connection);
			} else {
				this._clearConnection();
				for (const provider of this._providers.values()) {
					provider.agent.updateLabel(label);
				}
			}
		}));
	}

	private _setConnection(connection: IAgentConnection): void {
		if (this._connection === connection) {
			this._reconcileCatalog(connection);
			return;
		}
		this._connection = connection;
		const listeners = new DisposableStore();
		listeners.add(connection.rootState.onDidChange(() => this._reconcileCatalog(connection)));
		if (connection.rootState.onDidError) {
			listeners.add(connection.rootState.onDidError(error => {
				this._logService.warn(`[RemoteAgent] Root catalog failed for ${this._target.connectorId}/${this._target.targetId}: ${error.message}`);
			}));
		}
		this._connectionListener.value = listeners;
		this._reconcileCatalog(connection);
	}

	private _clearConnection(): void {
		this._connection = undefined;
		this._connectionListener.clear();
	}

	private _reconcileCatalog(connection: IAgentConnection): void {
		if (this._connection !== connection) {
			return;
		}
		const rootState = connection.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return;
		}
		const desired = new Map<string, AgentInfo>();
		for (const agentInfo of rootState.agents) {
			if (isRemoteAgentHostSessionType(agentInfo.provider)) {
				continue;
			}
			if (desired.has(agentInfo.provider)) {
				this._logService.error(`[RemoteAgent] Downstream target ${this._target.connectorId}/${this._target.targetId} advertised duplicate provider '${agentInfo.provider}'.`);
				continue;
			}
			desired.set(agentInfo.provider, agentInfo);
		}

		for (const [provider, registration] of this._providers) {
			const agentInfo = desired.get(provider);
			if (agentInfo) {
				registration.agent.update(agentInfo, this._label);
			} else {
				this._captureProviderResidentChats(provider, registration);
				this._providers.deleteAndDispose(provider);
			}
		}
		for (const [provider, agentInfo] of desired) {
			if (this._providers.has(provider)) {
				continue;
			}
			const residentChats = this._residentChats.get(provider) ?? [];
			const agent = new RemoteAgent(this._target, agentInfo, this._label, this._logService, residentChats);
			if (this._providerService.getProvider(agent.id)) {
				this._logService.error(`[RemoteAgent] Cannot register duplicate remote provider '${agent.id}'.`);
				agent.dispose();
				continue;
			}
			try {
				const registration = this._providerService.registerProvider(agent, { canBeDefault: false });
				this._providers.set(provider, new RemoteProviderRegistration(agent, registration));
				this._residentChats.delete(provider);
				agent.activateResidentChats();
			} catch (error) {
				this._logService.error(error, `[RemoteAgent] Failed to register provider '${agent.id}'.`);
				agent.dispose();
			}
		}
	}

	captureResidentChats(): ReadonlyMap<string, readonly IRemoteAgentResidentChat[]> {
		for (const [provider, registration] of this._providers) {
			this._captureProviderResidentChats(provider, registration);
		}
		return new Map(this._residentChats);
	}

	private _captureProviderResidentChats(provider: string, registration: RemoteProviderRegistration): void {
		const residentChats = registration.agent.captureResidentChats();
		if (residentChats.length > 0) {
			this._residentChats.set(provider, residentChats);
		}
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this.captureResidentChats();
		this._providers.clearAndDisposeAll();
		super.dispose();
	}
}

/**
 * Mirrors every admitted downstream target/provider pair into the ordinary provider registry.
 */
export class AgentHostRemoteAgentProviderContribution extends Disposable {
	private readonly _targets = this._register(new DisposableMap<IAgentHostRemoteTargetHandle, RemoteTargetProviderContribution>());
	private readonly _residentTargets = new Map<string, ReadonlyMap<string, readonly IRemoteAgentResidentChat[]>>();

	constructor(
		@IAgentHostRemoteAgentsService remoteAgentsService: IAgentHostRemoteAgentsService,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(autorun(reader => this._reconcileTargets(remoteAgentsService.targets.read(reader))));
	}

	private _reconcileTargets(targets: readonly IAgentHostRemoteTargetHandle[]): void {
		const desired = new Set(targets);
		for (const [target, contribution] of this._targets) {
			if (!desired.has(target)) {
				const residentChats = contribution.captureResidentChats();
				const targetKey = this._targetKey(target);
				if (residentChats.size > 0) {
					this._residentTargets.set(targetKey, residentChats);
				}
				this._targets.deleteAndDispose(target);
			}
		}
		for (const target of targets) {
			if (!this._targets.has(target)) {
				const targetKey = this._targetKey(target);
				const contribution = new RemoteTargetProviderContribution(target, this._providerService, this._logService, this._residentTargets.get(targetKey));
				this._targets.set(target, contribution);
				this._residentTargets.delete(targetKey);
			}
		}
	}

	private _targetKey(target: IAgentHostRemoteTargetHandle): string {
		return JSON.stringify([target.connectorId, target.targetId]);
	}

	override dispose(): void {
		this._targets.clearAndDisposeAll();
		super.dispose();
	}
}
