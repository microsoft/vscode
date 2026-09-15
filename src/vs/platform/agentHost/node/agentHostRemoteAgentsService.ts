/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../base/common/observable.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostRemoteAgentsEnabledConfigKey, AgentHostRemoteAgentsTunnelDiscoveryEnabledConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostManagedSettingsService } from './agentHostManagedSettingsService.js';

export interface IAgentHostRemoteAgentsActivationContext {
	readonly cancellationToken: CancellationToken;
	readonly tunnelDiscoveryEnabled: IObservable<boolean>;
}

export interface IAgentHostRemoteAgentsContribution {
	activate(context: IAgentHostRemoteAgentsActivationContext): Promise<IDisposable> | IDisposable;
}

export const IAgentHostRemoteAgentsService = createDecorator<IAgentHostRemoteAgentsService>('agentHostRemoteAgentsService');

export interface IAgentHostRemoteAgentsService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly tunnelDiscoveryEnabled: IObservable<boolean>;
	activate(): IDisposable;
	registerContribution(contribution: IAgentHostRemoteAgentsContribution): IDisposable;
}

class RemoteAgentsContributionRegistration extends Disposable {
	private readonly _activation = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		private readonly _contribution: IAgentHostRemoteAgentsContribution,
		private readonly _tunnelDiscoveryEnabled: IObservable<boolean>,
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

	private readonly _contributions = new Set<RemoteAgentsContributionRegistration>();
	private _active = false;

	constructor(
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostManagedSettingsService private readonly _managedSettingsService: IAgentHostManagedSettingsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(Event.any(this._configurationService.onDidRootConfigChange, this._managedSettingsService.onDidChange)(() => this._refresh()));
		this._refresh();
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
		const registration = new RemoteAgentsContributionRegistration(contribution, this.tunnelDiscoveryEnabled, this._logService);
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
		const enabledChanged = this._enabled.get() !== enabled;

		transaction(tx => {
			this._enabled.set(enabled, tx);
			this._tunnelDiscoveryEnabled.set(tunnelDiscoveryEnabled, tx);
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
