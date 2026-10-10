/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../base/common/collections.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
import { INativeManagedSettingsService, ManagedSettingsData } from './copilotManagedSettings.js';
import { PolicyDefinition } from './policy.js';

export class NativeManagedSettingsChannel implements IServerChannel {

	private readonly disposables = new DisposableStore();

	constructor(private readonly service: INativeManagedSettingsService) { }

	listen<T>(_: unknown, event: string): Event<T> {
		switch (event) {
			case 'onDidChangeManagedSettings': return this.service.onDidChangeManagedSettings as Event<T>;
		}

		throw new Error(`Event not found: ${event}`);
	}

	call<T>(_: unknown, command: string, arg?: unknown): Promise<T> {
		switch (command) {
			case 'getManagedSettings': return this.service.initialize() as Promise<T>;
			case 'updatePolicyDefinitions': return this.service.updatePolicyDefinitions(arg as IStringDictionary<PolicyDefinition>) as Promise<T>;
		}

		throw new Error(`Call not found: ${command}`);
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

export class NativeManagedSettingsChannelClient extends Disposable implements INativeManagedSettingsService {

	readonly _serviceBrand: undefined;

	private _managedSettings: ManagedSettingsData = {};
	get managedSettings(): ManagedSettingsData { return this._managedSettings; }
	private hasReceivedManagedSettings = false;

	private readonly _onDidChangeManagedSettings = this._register(new Emitter<ManagedSettingsData>());
	readonly onDidChangeManagedSettings = this._onDidChangeManagedSettings.event;
	private initializationPromise: Promise<void> | undefined;

	constructor(
		private readonly channel: IChannel,
		private readonly logService: ILogService,
	) {
		super();
		this._register(this.channel.listen<ManagedSettingsData>('onDidChangeManagedSettings')(managedSettings => this.updateManagedSettings(managedSettings, true)));
		void this.initializeInBackground();
	}

	private async initializeInBackground(): Promise<void> {
		try {
			await this.initialize();
		} catch (error) {
			this.logService.warn('NativeManagedSettingsChannelClient#initialize - Failed to initialize native managed settings', getErrorMessage(error));
		}
	}

	async initialize(): Promise<ManagedSettingsData> {
		const initializationPromise = this.initializationPromise ?? this.initializeFromChannel();
		this.initializationPromise = initializationPromise;
		try {
			await initializationPromise;
		} catch (error) {
			if (this.initializationPromise === initializationPromise) {
				this.initializationPromise = undefined;
			}
			throw error;
		}
		return this._managedSettings;
	}

	private async initializeFromChannel(): Promise<void> {
		const managedSettings = await this.channel.call<ManagedSettingsData>('getManagedSettings');
		if (!this.hasReceivedManagedSettings) {
			this.updateManagedSettings(managedSettings, true);
		}
	}

	async updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<ManagedSettingsData> {
		this.updateManagedSettings(await this.channel.call<ManagedSettingsData>('updatePolicyDefinitions', policyDefinitions), false);
		return this._managedSettings;
	}

	private updateManagedSettings(managedSettings: ManagedSettingsData, fireEvent: boolean): void {
		this.hasReceivedManagedSettings = true;
		if (equals(this._managedSettings, managedSettings)) {
			return;
		}

		this._managedSettings = managedSettings;
		if (fireEvent) {
			this._onDidChangeManagedSettings.fire(this._managedSettings);
		}
	}
}
