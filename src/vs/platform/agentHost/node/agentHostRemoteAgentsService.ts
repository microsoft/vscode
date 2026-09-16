/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../base/common/arrays.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue, transaction } from '../../../base/common/observable.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import type { IAgentHostRemoteTargetConnector, IAgentHostRemoteTargetHandle } from '../common/agentHostRemoteAgents.js';
import { AgentHostRemoteAgentsEnabledConfigKey, AgentHostRemoteAgentsTunnelDiscoveryEnabledConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { TunnelAgentHostDiscoveryDisabledError, type TunnelAgentHostDiscoveryState } from '../common/tunnelAgentHostDiscovery.js';
import { TunnelAgentHostsSettingId, type HostedTunnelIdentity } from '../common/tunnelAgentHost.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import type { IAgentHostFeatureAuthenticationRegistry } from './agentHostFeatureAuthentication.js';
import { IAgentHostManagedSettingsService } from './agentHostManagedSettingsService.js';
import { AgentHostRemoteTargetRegistry } from './agentHostRemoteTargetRegistry.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';
import { TunnelAgentHostRemoteTargetConnector } from './tunnelAgentHostRemoteTargetConnector.js';
import { TunnelAgentHostMainService } from './tunnelAgentHostService.js';

export interface IAgentHostRemoteAgentsActivationContext {
	readonly cancellationToken: CancellationToken;
	readonly tunnelDiscoveryEnabled: IObservable<boolean>;
	/** Registers a connector for this activation lifetime. */
	registerTargetConnector(connector: IAgentHostRemoteTargetConnector): void;
}

export interface IAgentHostRemoteAgentsContribution {
	activate(context: IAgentHostRemoteAgentsActivationContext): Promise<IDisposable> | IDisposable;
}

export const IAgentHostRemoteAgentsService = createDecorator<IAgentHostRemoteAgentsService>('agentHostRemoteAgentsService');

export interface IAgentHostRemoteAgentsService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly tunnelDiscoveryEnabled: IObservable<boolean>;
	readonly tunnelDiscoveryState?: IObservable<TunnelAgentHostDiscoveryState>;
	readonly targets: IObservable<readonly IAgentHostRemoteTargetHandle[]>;
	refreshTunnelDiscovery?(): Promise<void>;
	registerTunnelDiscovery?(authenticationRegistry: IAgentHostFeatureAuthenticationRegistry, hostedTunnel?: IObservable<HostedTunnelIdentity>): IDisposable;
	activate(): IDisposable;
	registerContribution(contribution: IAgentHostRemoteAgentsContribution): IDisposable;
}

class RemoteAgentsContributionRegistration extends Disposable {
	private readonly _activation = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		private readonly _contribution: IAgentHostRemoteAgentsContribution,
		private readonly _tunnelDiscoveryEnabled: IObservable<boolean>,
		private readonly _registerTargetConnector: (connector: IAgentHostRemoteTargetConnector) => IDisposable,
		private readonly _logService: ILogService,
	) {
		super();
	}

	setEnabled(enabled: boolean): void {
		this._activation.clear();
		if (!enabled) {
			return;
		}

		const activation = new DisposableStore();
		const cancellation = new CancellationTokenSource();
		activation.add(toDisposable(() => cancellation.dispose(true)));
		this._activation.value = activation;

		Promise.resolve().then(() => {
			if (cancellation.token.isCancellationRequested) {
				return undefined;
			}
			return this._contribution.activate({
				cancellationToken: cancellation.token,
				tunnelDiscoveryEnabled: this._tunnelDiscoveryEnabled,
				registerTargetConnector: connector => {
					if (!cancellation.token.isCancellationRequested) {
						activation.add(this._registerTargetConnector(connector));
					}
				},
			});
		}).then(disposable => {
			if (!disposable) {
				return;
			}
			if (cancellation.token.isCancellationRequested) {
				disposable.dispose();
				return;
			}
			activation.add(disposable);
		}, error => {
			if (!cancellation.token.isCancellationRequested && !isCancellationError(error)) {
				this._logService.error('[AgentHostRemoteAgents] Contribution activation failed', error);
				this._activation.clear();
			}
		});
	}
}

export class AgentHostRemoteAgentsService extends Disposable implements IAgentHostRemoteAgentsService {
	declare readonly _serviceBrand: undefined;

	private readonly _enabled = observableValue(this, false);
	readonly enabled: IObservable<boolean> = this._enabled;

	private readonly _tunnelDiscoveryEnabled = observableValue(this, false);
	readonly tunnelDiscoveryEnabled: IObservable<boolean> = this._tunnelDiscoveryEnabled;
	private readonly _additionalTunnelNames = observableValue<readonly string[]>(this, []);

	private readonly _contributions = new Set<RemoteAgentsContributionRegistration>();
	private readonly _targetRegistry: AgentHostRemoteTargetRegistry;
	private readonly _tunnelDiscoveryState = observableValue<TunnelAgentHostDiscoveryState>(this, { kind: 'disabled' });
	readonly tunnelDiscoveryState: IObservable<TunnelAgentHostDiscoveryState> = this._tunnelDiscoveryState;
	readonly targets: IObservable<readonly IAgentHostRemoteTargetHandle[]>;
	private _tunnelConnector: TunnelAgentHostRemoteTargetConnector | undefined;
	private _active = false;

	constructor(
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostManagedSettingsService private readonly _managedSettingsService: IAgentHostManagedSettingsService,
		@IAgentHostStorageService private readonly _storageService: IAgentHostStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._targetRegistry = this._register(new AgentHostRemoteTargetRegistry(_storageService, _logService));
		this.targets = this._targetRegistry.targets;
		this._register(Event.any(this._configurationService.onDidRootConfigChange, this._managedSettingsService.onDidChange)(() => this._refresh()));
		this._refresh();
	}

	refreshTunnelDiscovery(): Promise<void> {
		return this._tunnelConnector?.refresh() ?? Promise.reject(new TunnelAgentHostDiscoveryDisabledError());
	}

	registerTunnelDiscovery(authenticationRegistry: IAgentHostFeatureAuthenticationRegistry, hostedTunnel: IObservable<HostedTunnelIdentity> = constObservable<HostedTunnelIdentity>({ kind: 'unknown' })): IDisposable {
		if (this._tunnelConnector) {
			throw new Error('Tunnel Agent Host discovery is already registered.');
		}
		const resources = new DisposableStore();
		const tunnelService = resources.add(new TunnelAgentHostMainService(this._logService));
		const connector = resources.add(new TunnelAgentHostRemoteTargetConnector(
			tunnelService,
			authenticationRegistry,
			this._storageService,
			this._logService,
			hostedTunnel,
			this._additionalTunnelNames,
		));
		this._tunnelConnector = connector;

		const registration = new DisposableStore();
		try {
			registration.add(this.registerContribution(connector));
			registration.add(autorun(reader => this._tunnelDiscoveryState.set(connector.discoveryState.read(reader), undefined)));
			registration.add(toDisposable(() => {
				if (this._tunnelConnector === connector) {
					this._tunnelConnector = undefined;
					this._tunnelDiscoveryState.set({ kind: 'disabled' }, undefined);
				}
			}));
			registration.add(resources);
			return registration;
		} catch (error) {
			this._tunnelConnector = undefined;
			registration.dispose();
			resources.dispose();
			throw error;
		}
	}

	activate(): IDisposable {
		if (this._active) {
			throw new Error('Remote Agent Host lifecycle is already active.');
		}
		this._active = true;
		this._updateContributions();
		return toDisposable(() => {
			if (!this._active) {
				return;
			}
			this._active = false;
			this._updateContributions();
		});
	}

	registerContribution(contribution: IAgentHostRemoteAgentsContribution): IDisposable {
		const registration = new RemoteAgentsContributionRegistration(
			contribution,
			this.tunnelDiscoveryEnabled,
			connector => this._targetRegistry.registerConnector(connector),
			this._logService,
		);
		this._contributions.add(registration);
		registration.setEnabled(this._active && this._enabled.get());
		return toDisposable(() => {
			if (this._contributions.delete(registration)) {
				registration.dispose();
			}
		});
	}

	private _refresh(): void {
		const enabled = this._configurationService.getRootValue(platformRootSchema, AgentHostRemoteAgentsEnabledConfigKey) === true
			&& this._managedSettingsService.remoteAgentHostsEnabled === true;
		const tunnelDiscoveryEnabled = enabled
			&& this._configurationService.getRootValue(platformRootSchema, AgentHostRemoteAgentsTunnelDiscoveryEnabledConfigKey) === true;
		const additionalTunnelNames = this._configurationService.getRootValue(platformRootSchema, TunnelAgentHostsSettingId) ?? [];
		const enabledChanged = this._enabled.get() !== enabled;

		transaction(tx => {
			this._enabled.set(enabled, tx);
			this._tunnelDiscoveryEnabled.set(tunnelDiscoveryEnabled, tx);
			if (!equals(this._additionalTunnelNames.get(), additionalTunnelNames)) {
				this._additionalTunnelNames.set([...additionalTunnelNames], tx);
			}
		});

		if (enabledChanged) {
			this._updateContributions();
		}
	}

	private _updateContributions(): void {
		const enabled = this._active && this._enabled.get();
		for (const contribution of this._contributions) {
			contribution.setEnabled(enabled);
		}
	}

	override dispose(): void {
		for (const contribution of this._contributions) {
			contribution.dispose();
		}
		this._contributions.clear();
		super.dispose();
	}
}
