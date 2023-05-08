/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IUpdateService, State, UpdateType } from 'vs/platform/update/common/update';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { Disposable } from 'vs/base/common/lifecycle';

export interface IUpdate {
	version: string;
}

export interface IUpdateProvider {

	/**
	 * Should return with the `IUpdate` object if an update is
	 * available or `null` otherwise to signal that there are
	 * no updates.
	 */
	checkForUpdate(): Promise<IUpdate | null>;
}

export class BrowserUpdateService extends Disposable implements IUpdateService {

	declare readonly _serviceBrand: undefined;

	private _onStateChange = this._register(new Emitter<State>());
	readonly onStateChange: Event<State> = this._onStateChange.event;

	private _state: State = State.Uninitialized;
	get state(): State { return this._state; }
	set state(state: State) {
		this._state = state;
		this._onStateChange.fire(state);
	}

	constructor(
		@IBrowserWorkbenchEnvironmentService private readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@IHostService private readonly hostService: IHostService
	) {
		super();

		this.checkForUpdates(false);
	}

	async isLatestVersion(): Promise<boolean | undefined> {
		const update = await this.doCheckForUpdates(false);
		if (update === undefined) {
			return undefined; // no update provider
		}

		return !!update;
	}

	async checkForUpdates(explicit: boolean): Promise<void> {
		await this.doCheckForUpdates(explicit);
	}

	private async doCheckForUpdates(explicit: boolean): Promise<IUpdate | null /* no update available */ | undefined /* no update provider */> {
		if (this.environmentService.options && this.environmentService.options.updateProvider) {
			const updateProvider = this.environmentService.options.updateProvider;

			// State -> Checking for Updates
			this.state = State.CheckingForUpdates(explicit);

			const update = await updateProvider.checkForUpdate();
			if (update) {
				// State -> Downloaded
				this.state = State.Ready({ version: update.version, productVersion: update.version });
			} else {
				// State -> Idle
				this.state = State.Idle(UpdateType.Archive);
			}

			return update;
		}

		return undefined; // no update provider to ask
	}

	async downloadUpdate(): Promise<void> {
		// no-op
	}

	async applyUpdate(): Promise<void> {
		this.hostService.reload();
	}

	async quitAndInstall(): Promise<void> {
		this.hostService.reload();
	}

	async _applySpecificUpdate(packagePath: string): Promise<void> {
		// noop
	}
}

registerSingleton(IUpdateService, BrowserUpdateService, InstantiationType.Eager);
