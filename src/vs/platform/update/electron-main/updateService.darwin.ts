/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as electron from 'electron';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { memoize } from '../../../base/common/decorators.js';
import { Event } from '../../../base/common/event.js';
import { hash } from '../../../base/common/hash.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService, IRelaunchHandler, IRelaunchOptions } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, IRequestService } from '../../request/common/request.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AvailableForDownload, ENABLE_EARLY_STAGING_SETTING, IQuitAndInstallOptions, IUpdate, State, StateType, UpdateType } from '../common/update.js';
import { IMeteredConnectionService } from '../../meteredConnection/common/meteredConnection.js';
import { AbstractUpdateService, createUpdateURL, getUpdateRequestHeaders, IUpdateURLOptions, UpdateErrorClassification } from './abstractUpdateService.js';

export interface IDarwinUpdateHost {
	readonly onError: Event<string>;
	readonly onCheckingForUpdate: Event<void>;
	readonly onUpdateNotAvailable: Event<void>;
	readonly onUpdateAvailable: Event<void>;
	readonly onUpdateDownloaded: Event<IUpdate>;
	registerEarlyStaging(enabled: boolean): void;
	setFeedURL(url: string, headers: Record<string, string> | undefined): void;
	checkForUpdates(): void;
	quitAndInstall(): void;
}

function createElectronHost(): IDarwinUpdateHost {
	return {
		onError: Event.fromNodeEventEmitter(electron.autoUpdater, 'error', (_, message: string) => message),
		onCheckingForUpdate: Event.fromNodeEventEmitter<void>(electron.autoUpdater, 'checking-for-update'),
		onUpdateNotAvailable: Event.fromNodeEventEmitter<void>(electron.autoUpdater, 'update-not-available'),
		onUpdateAvailable: Event.fromNodeEventEmitter<void>(electron.autoUpdater, 'update-available'),
		onUpdateDownloaded: Event.fromNodeEventEmitter(electron.autoUpdater, 'update-downloaded', (_, version: string, productVersion: string, releaseDate: Date | number) => ({
			version,
			productVersion,
			timestamp: releaseDate instanceof Date ? releaseDate.getTime() || undefined : releaseDate,
		})),
		registerEarlyStaging: enabled => electron.systemPreferences.registerDefaults({ SquirrelMacEnableEarlyStaging: enabled }),
		setFeedURL: (url, headers) => electron.autoUpdater.setFeedURL({ url, headers }),
		checkForUpdates: () => electron.autoUpdater.checkForUpdates(),
		quitAndInstall: () => electron.autoUpdater.quitAndInstall(),
	};
}

export class DarwinUpdateService extends AbstractUpdateService implements IRelaunchHandler {

	private earlyStagingDefault: boolean | undefined;

	@memoize protected get host(): IDarwinUpdateHost { return createElectronHost(); }

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@IProductService productService: IProductService,
		@IApplicationStorageMainService applicationStorageMainService: IApplicationStorageMainService,
		@IMeteredConnectionService meteredConnectionService: IMeteredConnectionService,
	) {
		super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService, telemetryService, applicationStorageMainService, meteredConnectionService, true);

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

		this.host.onError(this.onError, this, this._store);
		this.host.onCheckingForUpdate(this.onCheckingForUpdate, this, this._store);
		this.host.onUpdateAvailable(this.onUpdateAvailable, this, this._store);
		this.host.onUpdateDownloaded(this.onUpdateDownloaded, this, this._store);
		this.host.onUpdateNotAvailable(this.onUpdateNotAvailable, this, this._store);
	}

	override async setEarlyStagingDefault(enabled: boolean): Promise<void> {
		this.logService.trace('update#setEarlyStagingDefault', { enabled });
		this.earlyStagingDefault = enabled;
	}

	private isEarlyStagingEnabled(): boolean {
		const { policyValue, userValue, defaultValue } = this.configurationService.inspect<boolean>(ENABLE_EARLY_STAGING_SETTING);
		if (typeof policyValue === 'boolean') {
			return policyValue;
		}
		if (typeof userValue === 'boolean') {
			return userValue;
		}

		return this.earlyStagingDefault ?? defaultValue ?? false;
	}

	private onCheckingForUpdate(): void {
		this.logService.trace('update#onCheckingForUpdate - Electron autoUpdater is checking for updates');
	}

	private onError(err: string): void {
		this.telemetryService.publicLog2<{ messageHash: string }, UpdateErrorClassification>('update:error', { messageHash: String(hash(String(err))) });
		this.logService.error('UpdateService error:', err);

		// Only react while actively checking/downloading; a late error must not clobber Disabled or Ready.
		if (this.state.type !== StateType.CheckingForUpdates && this.state.type !== StateType.Downloading && this.state.type !== StateType.Overwriting) {
			return;
		}

		// only show message when explicitly checking for updates
		const message = (this.state.type === StateType.CheckingForUpdates && this.state.explicit) ? err : undefined;
		this.setState(State.Idle(UpdateType.Archive, message));
	}

	protected buildUpdateFeedUrl(quality: string, commit: string, options?: IUpdateURLOptions): string | undefined {
		const assetID = this.productService.darwinUniversalAssetId ?? (process.arch === 'x64' ? 'darwin' : 'darwin-arm64');
		const url = createUpdateURL(this.productService.updateUrl!, assetID, quality, commit, options);
		const headers = getUpdateRequestHeaders(this.productService.version);
		const earlyStaging = this.isEarlyStagingEnabled();
		try {
			this.host.registerEarlyStaging(earlyStaging);
		} catch (e) {
			this.logService.error('Failed to update SquirrelMacEnableEarlyStaging default', e);
		}
		try {
			this.logService.trace('update#buildUpdateFeedUrl - setting feed URL for Electron autoUpdater', { url, assetID, quality, commit, headers, earlyStaging });
			this.host.setFeedURL(url, headers);
		} catch (e) {
			// application is very likely not signed
			this.logService.error('Failed to set update feed URL', e);
			return undefined;
		}
		return url;
	}

	protected doCheckForUpdates(explicit: boolean, pendingCommit?: string): void {
		if (!this.quality) {
			return;
		}

		this.setState(State.CheckingForUpdates(explicit));

		const internalOrg = this.getInternalOrg();
		const background = !explicit && !internalOrg;
		const url = this.buildUpdateFeedUrl(this.quality, pendingCommit ?? this.productService.commit!, { background, internalOrg });

		if (!url) {
			this.setState(State.Idle(UpdateType.Archive));
			return;
		}

		// When connection is metered and this is not an explicit check, avoid electron call as to not to trigger auto-download.
		if (!explicit && this.meteredConnectionService.isConnectionMetered) {
			this.logService.info('update#doCheckForUpdates - checking for update without auto-download because connection is metered');
			this.checkForUpdateNoDownload(url);
			return;
		}

		this.logService.trace('update#doCheckForUpdates - using Electron autoUpdater', { url, explicit, background });
		this.host.checkForUpdates();
	}

	/**
	 * Manually check the update feed URL without triggering Electron's auto-download.
	 * Used when connection is metered or in the embedded app.
	 * @param canInstall When false, signals that the update cannot be installed from this app.
	 */
	private async checkForUpdateNoDownload(url: string, canInstall?: boolean): Promise<void> {
		const headers = getUpdateRequestHeaders(this.productService.version);
		this.logService.trace('update#checkForUpdateNoDownload - checking update server', { url, headers });

		try {
			const context = await this.requestService.request({ url, headers, callSite: 'updateService.darwin.checkForUpdates' }, CancellationToken.None);
			const statusCode = context.res.statusCode;
			this.logService.trace('update#checkForUpdateNoDownload - response', { statusCode });

			const update = await asJson<IUpdate>(context);
			if (!update || !update.url || !update.version || !update.productVersion) {
				this.logService.trace('update#checkForUpdateNoDownload - no update available');
				const notAvailable = this.state.type === StateType.CheckingForUpdates && this.state.explicit;
				this.setState(State.Idle(UpdateType.Archive, undefined, notAvailable || undefined));
			} else {
				this.logService.trace('update#checkForUpdateNoDownload - update available', { version: update.version, productVersion: update.productVersion });
				this.setState(State.AvailableForDownload(update, canInstall));
			}
		} catch (err) {
			this.logService.error('update#checkForUpdateNoDownload - failed to check for update', err);
			this.setState(State.Idle(UpdateType.Archive));
		}
	}

	private onUpdateAvailable(): void {
		this.logService.trace('update#onUpdateAvailable - Electron autoUpdater reported update available');

		if (this.state.type !== StateType.CheckingForUpdates && this.state.type !== StateType.Overwriting) {
			return;
		}

		this.setState(State.Downloading(this.state.type === StateType.Overwriting ? this.state.update : undefined, this.state.explicit, this._overwrite));
	}

	private onUpdateDownloaded(update: IUpdate): void {
		if (this.state.type !== StateType.Downloading) {
			return;
		}

		this.setState(State.Downloaded(update, this.state.explicit, this._overwrite));
		this.logService.info(`Update downloaded: ${JSON.stringify(update)}`);

		this.setState(State.Ready(update, this.state.explicit, this._overwrite));
	}

	private onUpdateNotAvailable(): void {
		this.logService.trace('update#onUpdateNotAvailable - Electron autoUpdater reported no update available');

		if (this.state.type !== StateType.CheckingForUpdates) {
			return;
		}

		const notAvailable = this.state.explicit;
		this.setState(State.Idle(UpdateType.Archive, undefined, notAvailable || undefined));
	}

	protected override async doDownloadUpdate(state: AvailableForDownload): Promise<void> {
		// Rebuild feed URL and trigger download via Electron's auto-updater
		this.buildUpdateFeedUrl(this.quality!, state.update.version, { internalOrg: this.getInternalOrg() });
		this.setState(State.CheckingForUpdates(true));
		this.host.checkForUpdates();
	}

	protected override doQuitAndInstall(options?: IQuitAndInstallOptions): void {
		// TODO(deepak1556): in Squirrel.Mac, (1) pass `options?.relaunchInBackground` so ShipIt
		// launches with `NSWorkspaceLaunchWithoutActivation`, and (2) extend ShipIt's `Updating`
		// IOPMAssertion transaction to cover the helper spawn so the sleep assertion is tied to
		// the exact install+relaunch lifetime without external timers.
		this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()', { unattended: options?.unattended, relaunchInBackground: options?.relaunchInBackground });
		this.host.quitAndInstall();
	}
}
