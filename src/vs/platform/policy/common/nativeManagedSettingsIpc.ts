/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
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
			case 'getManagedSettings': return Promise.resolve(this.service.managedSettings as T);
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

	constructor(private readonly channel: IChannel) {
		super();
		this._register(this.channel.listen<ManagedSettingsData>('onDidChangeManagedSettings')(managedSettings => this.updateManagedSettings(managedSettings, true)));
		this.channel.call<ManagedSettingsData>('getManagedSettings').then(managedSettings => {
			if (!this.hasReceivedManagedSettings) {
				this.updateManagedSettings(managedSettings, true);
			}
		});
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
