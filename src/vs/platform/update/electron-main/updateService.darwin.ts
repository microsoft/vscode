/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as electron from 'electron';
import { memoize } from '../../../base/common/decorators.js';
import { Event } from '../../../base/common/event.js';
import { hash } from '../../../base/common/hash.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService, IRelaunchHandler, IRelaunchOptions } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService } from '../../request/common/request.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUpdate, State, StateType, UpdateType } from '../common/update.js';
import { AbstractUpdateService, createUpdateURL, UPDATE_RECHECK_INTERVAL, UpdateErrorClassification } from './abstractUpdateService.js';

export class DarwinUpdateService extends AbstractUpdateService implements IRelaunchHandler {

	private readonly disposables = new DisposableStore();
	private downloadedUpdate: IUpdate | undefined;
	private readyUpdateCheckHandle: ReturnType<typeof setTimeout> | undefined;

	@memoize private get onRawError(): Event<string> { return Event.fromNodeEventEmitter(electron.autoUpdater, 'error', (_, message) => message); }
	@memoize private get onRawUpdateNotAvailable(): Event<void> { return Event.fromNodeEventEmitter<void>(electron.autoUpdater, 'update-not-available'); }
	@memoize private get onRawUpdateAvailable(): Event<void> { return Event.fromNodeEventEmitter(electron.autoUpdater, 'update-available'); }
	@memoize private get onRawUpdateDownloaded(): Event<IUpdate> { return Event.fromNodeEventEmitter(electron.autoUpdater, 'update-downloaded', (_, releaseNotes, version, timestamp) => ({ version, productVersion: version, timestamp })); }

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@IProductService productService: IProductService
	) {
		super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService);

		lifecycleMainService.setRelaunchHandler(this);
	}

	handleRelaunch(options?: IRelaunchOptions): boolean {
		if (options?.addArgs || options?.removeArgs) {
			return false; // we cannot apply an update and restart with different args
		}

		if (this.state.type !== StateType.Ready) {
			return false; // we only handle the relaunch when we have a pending update
		}

		this.logService.trace('update#handleRelaunch(): running raw#quitAndInstall()');
		this.doQuitAndInstall();

		return true;
	}

	protected override async initialize(): Promise<void> {
		await super.initialize();
		this.onRawError(this.onError, this, this.disposables);
		this.onRawUpdateAvailable(this.onUpdateAvailable, this, this.disposables);
		this.onRawUpdateDownloaded(this.onUpdateDownloaded, this, this.disposables);
		this.onRawUpdateNotAvailable(this.onUpdateNotAvailable, this, this.disposables);
	}

	private onError(err: string): void {
		this.telemetryService.publicLog2<{ messageHash: string }, UpdateErrorClassification>('update:error', { messageHash: String(hash(String(err))) });
		this.logService.error('UpdateService error:', err);

		// only show message when explicitly checking for updates
		const message = (this.state.type === StateType.CheckingForUpdates && this.state.explicit) ? err : undefined;
		this.setState(State.Idle(UpdateType.Archive, message));
	}

	protected buildUpdateFeedUrl(quality: string): string | undefined {
		let assetID: string;
		if (!this.productService.darwinUniversalAssetId) {
			assetID = process.arch === 'x64' ? 'darwin' : 'darwin-arm64';
		} else {
			assetID = this.productService.darwinUniversalAssetId;
		}
		const url = createUpdateURL(assetID, quality, this.productService);
		try {
			electron.autoUpdater.setFeedURL({ url });
		} catch (e) {
			// application is very likely not signed
			this.logService.error('Failed to set update feed URL', e);
			return undefined;
		}
		return url;
	}

	protected doCheckForUpdates(explicit: boolean): void {
		if (!this.url) {
			return;
		}

		// Cancel any pending ready update checks
		this.cancelReadyUpdateCheck();

		this.setState(State.CheckingForUpdates(explicit));

		const url = explicit ? this.url : `${this.url}?bg=true`;
		electron.autoUpdater.setFeedURL({ url });
		electron.autoUpdater.checkForUpdates();
	}

	private onUpdateAvailable(): void {
		if (this.state.type !== StateType.CheckingForUpdates) {
			return;
		}

		this.setState(State.Downloading);
	}

	private onUpdateDownloaded(update: IUpdate): void {
		if (this.state.type !== StateType.Downloading) {
			return;
		}

		this.downloadedUpdate = update;
		this.setState(State.Downloaded(update));

		type UpdateDownloadedClassification = {
			owner: 'joaomoreno';
			newVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version number of the new VS Code that has been downloaded.' };
			comment: 'This is used to know how often VS Code has successfully downloaded the update.';
		};
		this.telemetryService.publicLog2<{ newVersion: String }, UpdateDownloadedClassification>('update:downloaded', { newVersion: update.version });

		this.setState(State.Ready(update));

		// Schedule periodic checks for newer updates while in Ready state
		this.scheduleReadyUpdateCheck();
	}

	private onUpdateNotAvailable(): void {
		if (this.state.type !== StateType.CheckingForUpdates) {
			return;
		}

		this.setState(State.Idle(UpdateType.Archive));
	}

	/**
	 * Schedules periodic checks for new updates while in the Ready state.
	 * If a newer update is available, it restarts the update process.
	 */
	private scheduleReadyUpdateCheck(): void {
		this.cancelReadyUpdateCheck();

		// Check periodically if there's a newer update
		this.readyUpdateCheckHandle = setTimeout(() => {
			(async () => {
				if (this.state.type !== StateType.Ready || !this.downloadedUpdate) {
					return;
				}

				this.logService.info('update#scheduleReadyUpdateCheck - checking for newer update');

				const latestUpdate = await this.getLatestAvailableUpdate();
				if (!latestUpdate) {
					// No newer update or error, schedule another check
					this.scheduleReadyUpdateCheck();
					return;
				}

				// Compare versions - if the latest is different from downloaded, restart the update process
				if (latestUpdate.version !== this.downloadedUpdate.version) {
					this.logService.info(`update#scheduleReadyUpdateCheck - newer update available: ${latestUpdate.version} (downloaded: ${this.downloadedUpdate.version})`);

					// Restart the update process to get the newer version
					this.downloadedUpdate = undefined;
					this.setState(State.Idle(UpdateType.Archive));

					// Trigger a new update check
					this.doCheckForUpdates(false);
				} else {
					// Same version, schedule another check
					this.scheduleReadyUpdateCheck();
				}
			})().catch(err => {
				this.logService.error('update#scheduleReadyUpdateCheck - error checking for updates', err);
				// Schedule another check even on error
				this.scheduleReadyUpdateCheck();
			});
		}, UPDATE_RECHECK_INTERVAL);
	}

	private cancelReadyUpdateCheck(): void {
		if (this.readyUpdateCheckHandle) {
			clearTimeout(this.readyUpdateCheckHandle);
			this.readyUpdateCheckHandle = undefined;
		}
	}

	protected override doQuitAndInstall(): void {
		this.cancelReadyUpdateCheck();
		this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');
		electron.autoUpdater.quitAndInstall();
	}

	dispose(): void {
		this.cancelReadyUpdateCheck();
		this.disposables.dispose();
	}
}
