/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { ManagedSettingsData } from '../../../base/common/policy.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IFileManagedSettingsService } from './copilotManagedSettings.js';

export class FileManagedSettingsChannel implements IServerChannel {

	private readonly disposables = new DisposableStore();

	constructor(private readonly service: IFileManagedSettingsService) { }

	listen<T>(_: unknown, event: string): Event<T> {
		switch (event) {
			case 'onDidChangeManagedSettings': return this.service.onDidChangeManagedSettings as Event<T>;
		}

		throw new Error(`Event not found: ${event}`);
	}

	call<T>(_: unknown, command: string): Promise<T> {
		switch (command) {
			case 'getManagedSettings': return Promise.resolve(this.service.managedSettings as T);
		}

		throw new Error(`Call not found: ${command}`);
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

export class FileManagedSettingsChannelClient extends Disposable implements IFileManagedSettingsService {

	readonly _serviceBrand: undefined;

	private _managedSettings: ManagedSettingsData = {};
	get managedSettings(): ManagedSettingsData { return this._managedSettings; }
	private hasReceivedManagedSettings = false;

	private readonly _onDidChangeManagedSettings = this._register(new Emitter<ManagedSettingsData>());
	readonly onDidChangeManagedSettings = this._onDidChangeManagedSettings.event;

	constructor(channel: IChannel) {
		super();
		this._register(channel.listen<ManagedSettingsData>('onDidChangeManagedSettings')(managedSettings => this.updateManagedSettings(managedSettings, true)));
		channel.call<ManagedSettingsData>('getManagedSettings').then(managedSettings => {
			if (!this.hasReceivedManagedSettings) {
				this.updateManagedSettings(managedSettings, true);
			}
		});
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
