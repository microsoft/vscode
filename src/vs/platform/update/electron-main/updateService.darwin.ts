/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as electron from 'electron';
import { memoize } from '../../../base/common/decorators.js';
import { Event } from '../../../base/common/event.js';
import { hash } from '../../../base/common/hash.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService, IRelaunchHandler, IRelaunchOptions } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService, asText } from '../../request/common/request.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUpdate, State, StateType, UpdateType, AvailableForDownload } from '../common/update.js';
import { AbstractUpdateService, UpdateErrorClassification } from './abstractUpdateService.js';
// Squirrel.Mac handles download/apply; no manual fs/crypto needed.

// No custom update response shape needed; Squirrel appcast is consumed by Electron.

export class DarwinUpdateService extends AbstractUpdateService implements IRelaunchHandler {

    private readonly disposables = new DisposableStore();

	@memoize private get onRawError(): Event<string> { return Event.fromNodeEventEmitter(electron.autoUpdater, 'error', (_, message) => message); }
	@memoize private get onRawUpdateNotAvailable(): Event<void> { return Event.fromNodeEventEmitter<void>(electron.autoUpdater, 'update-not-available'); }
	@memoize private get onRawUpdateAvailable(): Event<void> { return Event.fromNodeEventEmitter(electron.autoUpdater, 'update-available'); }
	@memoize private get onRawUpdateDownloaded(): Event<IUpdate> {
		return Event.fromNodeEventEmitter(electron.autoUpdater, 'update-downloaded', (_, releaseNotes, version, timestamp) => {
			const productVersion = this.toDisplayVersion(version) ?? version;
			return { version, productVersion, timestamp };
		});
	}

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
			// Switch macOS to Squirrel.Mac appcast feed
			const arch = process.arch === 'x64' ? 'darwin-x64' : 'darwin-arm64';
			const baseUrl = this.productService.updateUrl || 'https://erdos-updates.s3.amazonaws.com';
			const url = `${baseUrl}/squirrel/${arch}/${quality}/latest.json`;
			this.logService.info('update#buildUpdateFeedUrl - Squirrel feed URL:', url);
			return url;
		}

	protected doCheckForUpdates(explicit: boolean): void {
		if (!this.url) {
			return;
		}

		this.setState(State.CheckingForUpdates(explicit));

		(void (async () => {
			let isLatest: boolean | undefined;
			try {
				isLatest = await this.isLatestVersion();
			} catch (error) {
				this.logService.warn('update#doCheckForUpdates - preflight latest check failed', error);
			}

			if (isLatest === true) {
				this.logService.info('update#doCheckForUpdates - already at latest version, skipping download.');
				this.setState(State.Idle(UpdateType.Archive));
				return;
			}

			try {
				(electron.autoUpdater as any).setFeedURL({ url: this.url, serverType: 'json' });
			} catch (error) {
				this.logService.warn('update#doCheckForUpdates - setFeedURL failed:', error);
			}

			try {
				electron.autoUpdater.checkForUpdates();
			} catch (error) {
				this.logService.error('update#doCheckForUpdates - checkForUpdates failed:', error);
				const message = explicit ? (error as any)?.message || String(error) : undefined;
				this.setState(State.Idle(UpdateType.Archive, message));
			}
		})());
	}

    // S3 JSON flow removed on mac; Squirrel handles checking/downloading.

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

		const displayVersion = this.toDisplayVersion(update.productVersion ?? update.version);
		const processedUpdate = displayVersion ? { ...update, productVersion: displayVersion } : update;
		this.setState(State.Downloaded(processedUpdate));

		type UpdateDownloadedClassification = {
			owner: 'joaomoreno';
			newVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version number of the new VS Code that has been downloaded.' };
			comment: 'This is used to know how often VS Code has successfully downloaded the update.';
		};
		this.telemetryService.publicLog2<{ newVersion: String }, UpdateDownloadedClassification>('update:downloaded', { newVersion: update.version });

		this.setState(State.Ready(processedUpdate));
	}

	private onUpdateNotAvailable(): void {
		if (this.state.type !== StateType.CheckingForUpdates) {
			return;
		}

		this.setState(State.Idle(UpdateType.Archive));
	}

	protected override async doDownloadUpdate(state: AvailableForDownload): Promise<void> {
		// With Squirrel.Mac, checkForUpdates() performs the download; rely on events
		try {
			electron.autoUpdater.checkForUpdates();
		} catch (e) {
			this.logService.warn('update#doDownloadUpdate - checkForUpdates failed:', e);
		}
	}

	protected override async doQuitAndInstall(): Promise<void> {
		try {
			if (this.state.type !== StateType.Ready) {
				this.logService.warn('update#doQuitAndInstall - Not in Ready state');
				return;
			}
			electron.autoUpdater.quitAndInstall();
		} catch (e) {
			this.logService.error('update#doQuitAndInstall - Squirrel quitAndInstall failed:', e);
		}
	}

	public override async isLatestVersion(): Promise<boolean | undefined> {
		if (!this.url) {
			return undefined;
		}

		const currentBundleVersion = this.getCurrentBundleVersion();
		if (!currentBundleVersion) {
			return undefined;
		}

		try {
			const context = await this.requestService.request({ url: this.url }, CancellationToken.None);
			if (context.res.statusCode === 204) {
				return true;
			}

			if (context.res.statusCode !== 200) {
				this.logService.info('update#isLatestVersion - unexpected status code from feed:', context.res.statusCode);
				return undefined;
			}

			const raw = await asText(context);
			if (!raw) {
				return undefined;
			}

			let data: { name?: string };
			try {
				data = JSON.parse(raw);
			} catch (error) {
				this.logService.warn('update#isLatestVersion - failed to parse feed JSON', error);
				return undefined;
			}

			if (!data?.name) {
				return undefined;
			}

			return this.compareBundleVersions(data.name, currentBundleVersion) <= 0;
		} catch (error) {
			this.logService.error('update#isLatestVersion(): failed to check for updates', error);
			return undefined;
		}
	}

	private getCurrentBundleVersion(): string | undefined {
		return this.productService.erdosVersion ?? this.productService.version;
	}

	private toDisplayVersion(version?: string): string | undefined {
		if (!version) {
			return undefined;
		}

		const normalized = version.trim();
		const match = /^([0-9]+\.[0-9]+\.[0-9]+)\.([0-9]+)$/.exec(normalized);
		if (match) {
			return `${match[1]}-${match[2]}`;
		}

		return normalized;
	}

	private compareBundleVersions(a: string, b: string): number {
		const aParts = a.split('.').map(part => Number.parseInt(part, 10));
		const bParts = b.split('.').map(part => Number.parseInt(part, 10));
		const length = Math.max(aParts.length, bParts.length);

		for (let i = 0; i < length; i++) {
			const aValue = Number.isFinite(aParts[i]) ? aParts[i] : 0;
			const bValue = Number.isFinite(bParts[i]) ? bParts[i] : 0;

			if (aValue > bValue) {
				return 1;
			}

			if (aValue < bValue) {
				return -1;
			}
		}

		return 0;
	}

    // Squirrel handles elevation and staging; remove sudo helpers and staging utilities.

	dispose(): void {
		this.disposables.dispose();
	}
}
