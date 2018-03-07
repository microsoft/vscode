/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { Throttler } from 'vs/base/common/async';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import product from 'vs/platform/node/product';
import { TPromise } from 'vs/base/common/winjs.base';
import { IUpdateService, State, StateType, AvailableForDownload } from 'vs/platform/update/common/update';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';

export function createUpdateURL(platform: string, quality: string): string {
	return `${product.updateUrl}/api/update/${platform}/${quality}/${product.commit}`;
}

export abstract class AbstractUpdateService implements IUpdateService {

	_serviceBrand: any;

	private _state: State = State.Uninitialized;
	private throttler: Throttler = new Throttler();

	private _onStateChange = new Emitter<State>();
	get onStateChange(): Event<State> { return this._onStateChange.event; }

	get state(): State {
		return this._state;
	}

	protected setState(state: State): void {
		this.logService.info('update#setState', state.type);
		this._state = state;
		this._onStateChange.fire(state);
	}

	constructor(
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILogService protected logService: ILogService
	) {
		if (this.environmentService.disableUpdates) {
			this.logService.info('update#ctor - updates are disabled');
			return;
		}

		if (!product.updateUrl || !product.commit) {
			this.logService.info('update#ctor - updates are disabled');
			return;
		}

		const quality = this.getProductQuality();

		if (!quality) {
			this.logService.info('update#ctor - updates are disabled');
			return;
		}

		if (!this.setUpdateFeedUrl(quality)) {
			this.logService.info('update#ctor - updates are disabled');
			return;
		}

		this.setState({ type: StateType.Idle });

		// Start checking for updates after 30 seconds
		this.scheduleCheckForUpdates(30 * 1000)
			.done(null, err => this.logService.error(err));
	}

	private getProductQuality(): string {
		const quality = this.configurationService.getValue<string>('update.channel');
		return quality === 'none' ? null : product.quality;
	}

	private scheduleCheckForUpdates(delay = 60 * 60 * 1000): TPromise<void> {
		return TPromise.timeout(delay)
			.then(() => this.checkForUpdates(null))
			.then(update => {
				if (update) {
					// Update found, no need to check more
					return TPromise.as(null);
				}

				// Check again after 1 hour
				return this.scheduleCheckForUpdates(60 * 60 * 1000);
			});
	}

	checkForUpdates(context: any): TPromise<void> {
		this.logService.trace('update#checkForUpdates, state = ', this.state.type);

		if (this.state.type !== StateType.Idle) {
			return TPromise.as(null);
		}

		return this.throttler.queue(() => TPromise.as(this.doCheckForUpdates(context)));
	}

	downloadUpdate(): TPromise<void> {
		this.logService.trace('update#downloadUpdate, state = ', this.state.type);

		if (this.state.type !== StateType.AvailableForDownload) {
			return TPromise.as(null);
		}

		return this.doDownloadUpdate(this.state);
	}

	protected doDownloadUpdate(state: AvailableForDownload): TPromise<void> {
		return TPromise.as(null);
	}

	applyUpdate(): TPromise<void> {
		this.logService.trace('update#applyUpdate, state = ', this.state.type);

		if (this.state.type !== StateType.Downloaded) {
			return TPromise.as(null);
		}

		return this.doApplyUpdate();
	}

	protected doApplyUpdate(): TPromise<void> {
		return TPromise.as(null);
	}

	quitAndInstall(): TPromise<void> {
		this.logService.trace('update#quitAndInstall, state = ', this.state.type);

		if (this.state.type !== StateType.Ready) {
			return TPromise.as(null);
		}

		this.logService.trace('update#quitAndInstall(): before lifecycle quit()');

		this.lifecycleService.quit(true /* from update */).done(vetod => {
			this.logService.trace(`update#quitAndInstall(): after lifecycle quit() with veto: ${vetod}`);
			if (vetod) {
				return;
			}

			this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');
			this.doQuitAndInstall();
		});

		return TPromise.as(null);
	}

	protected doQuitAndInstall(): void {
		// noop
	}

	protected abstract setUpdateFeedUrl(quality: string): boolean;
	protected abstract doCheckForUpdates(context: any): void;
}
