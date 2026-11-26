/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { createHash } from 'crypto';
import * as electron from 'electron';
import { writeFileSync } from 'fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import * as os from 'os';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { memoize } from '../../../base/common/decorators.js';
import { Event } from '../../../base/common/event.js';
import { hash } from '../../../base/common/hash.js';
import * as path from '../../../base/common/path.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService, IRelaunchHandler, IRelaunchOptions, ShutdownReason } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, IRequestService } from '../../request/common/request.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AvailableForDownload, ENABLE_EARLY_STAGING_SETTING, IQuitAndInstallOptions, IUpdate, State, StateType, UpdateType } from '../common/update.js';
import { IMeteredConnectionService } from '../../meteredConnection/common/meteredConnection.js';
import { AbstractUpdateService, createUpdateURL, getUpdateRequestHeaders, IUpdateURLOptions, UpdateErrorClassification, UpdateErrorEvent } from './abstractUpdateService.js';

type DarwinRestartOutcome = 'updated' | 'unexpectedCommit' | 'sameCommit' | 'unknownCommit' | 'vetoed' | 'hostError';

interface IPendingRestartBreadcrumb {
	readonly restartId: string;
	readonly installRoot: string;
	readonly fromCommit: string;
	readonly expectedCommit: string;
	readonly quitWallMs: number;
	readonly quitMonotonicNs: string;
	readonly quitBootSessionId?: string;
	readonly quitBootTimeSec: number;
	readonly earlyStaging: boolean;
	readonly unattended: boolean;
	readonly hostError?: boolean;
}

type RestartAttemptEvent = {
	restartId: string;
	fromCommit: string;
	expectedCommit: string;
	earlyStaging: boolean;
	unattended: boolean;
};

type RestartAttemptClassification = {
	owner: 'deepak1556';
	comment: 'Fired on macOS before shutdown starts for an update restart, providing the denominator for restart outcomes.';
	restartId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique correlation ID for this restart attempt.' };
	fromCommit: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'VS Code commit before restart.' };
	expectedCommit: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Target update commit.' };
	earlyStaging: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether early update staging was enabled when the update downloaded.' };
	unattended: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether this restart was triggered by unattended restart.' };
};

type RestartCompletedEvent = {
	restartId: string;
	outcome: DarwinRestartOutcome;
	fromCommit: string;
	expectedCommit: string;
	monotonicExitToMainStartMs: number;
	wallExitToMainStartMs: number;
	clockSkewMs: number;
	sameBoot: boolean;
	cleanInterval: boolean;
	earlyStaging: boolean;
	unattended: boolean;
};

type RestartCompletedClassification = {
	owner: 'deepak1556';
	comment: 'Fired on macOS when an update restart completes on next startup (or aborts via veto/host error) to measure reliability and exit-to-relaunch latency.';
	restartId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Correlation ID matching update:restartAttempt.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Outcome of the restart: updated, unexpectedCommit, sameCommit, unknownCommit, vetoed, or hostError.' };
	fromCommit: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'VS Code commit before restart.' };
	expectedCommit: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Target update commit.' };
	monotonicExitToMainStartMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Continuous monotonic milliseconds from shutdown to new main process start (-1 if rebooted or aborted). Includes sleep if any occurred.' };
	wallExitToMainStartMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock milliseconds from shutdown to new main process timeOrigin (-1 if aborted).' };
	clockSkewMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Difference between wall-clock delta and continuous monotonic delta (-1 if rebooted or aborted).' };
	sameBoot: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the new launch occurred in the same macOS boot session.' };
	cleanInterval: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the interval stayed in the same boot without a detected wall-clock jump (>2s).' };
	earlyStaging: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether early update staging was enabled when the update downloaded.' };
	unattended: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether this restart was triggered by unattended restart.' };
};

function getBreadcrumbPath(userDataPath: string, installRoot: string): string {
	const digest = createHash('sha256').update(installRoot).digest('hex').slice(0, 32);
	return path.join(userDataPath, `darwin-update-restart-${digest}.json`);
}

function readBootSessionId(): Promise<string | undefined> {
	return new Promise(resolve => {
		execFile('sysctl', ['-n', 'kern.bootsessionuuid'], { encoding: 'utf8', timeout: 2000 }, (err, stdout) => {
			resolve(err ? undefined : stdout.trim() || undefined);
		});
	});
}

function classifyRestartOutcome(fromCommit: string, toCommit: string, expectedCommit: string): DarwinRestartOutcome {
	if (!fromCommit || !toCommit || !expectedCommit) {
		return 'unknownCommit';
	}
	if (toCommit === fromCommit) {
		return 'sameCommit';
	}
	return toCommit === expectedCommit ? 'updated' : 'unexpectedCommit';
}

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
	private pendingCheckEarlyStaging: boolean | undefined;
	private activeDownloadEarlyStaging: boolean | undefined;
	private readyEarlyStaging: boolean | undefined;
	private bootSessionIdPromise: Promise<string | undefined> | undefined;
	private nextQuitUnattended = false;
	private pendingRestart: { readonly restartId: string; readonly expectedCommit: string; readonly earlyStaging: boolean; readonly unattended: boolean } | undefined;
	private writtenBreadcrumb: IPendingRestartBreadcrumb | undefined;

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
		this._register(lifecycleMainService.onWillShutdown(e => {
			if (e.reason === ShutdownReason.QUIT && this.pendingRestart) {
				e.join('darwinUpdateRestartBreadcrumb', this.writeRestartBreadcrumb(this.pendingRestart));
			}
		}));
	}

	private get breadcrumbPath(): string | undefined {
		const { userDataPath, appRoot } = this.environmentMainService;
		return userDataPath && appRoot ? getBreadcrumbPath(userDataPath, appRoot) : undefined;
	}

	private getBootSessionId(): Promise<string | undefined> {
		return this.bootSessionIdPromise ??= readBootSessionId();
	}

	private async writeRestartBreadcrumb(restart: NonNullable<DarwinUpdateService['pendingRestart']>): Promise<void> {
		const filePath = this.breadcrumbPath;
		if (!filePath) {
			return;
		}
		const quitBootSessionId = await this.getBootSessionId();
		const quitWallMs = Date.now();
		const record: IPendingRestartBreadcrumb = {
			restartId: restart.restartId,
			installRoot: this.environmentMainService.appRoot,
			fromCommit: this.productService.commit ?? '',
			expectedCommit: restart.expectedCommit,
			quitWallMs,
			quitMonotonicNs: process.hrtime.bigint().toString(),
			quitBootSessionId,
			quitBootTimeSec: Math.round(quitWallMs / 1000 - os.uptime()),
			earlyStaging: restart.earlyStaging,
			unattended: restart.unattended,
		};
		const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
		try {
			await mkdir(path.dirname(filePath), { recursive: true });
			await writeFile(tmpPath, JSON.stringify(record), 'utf8');
			await rename(tmpPath, filePath);
			this.writtenBreadcrumb = record;
		} catch (e) {
			this.logService.error('Failed to write update restart breadcrumb', e);
			try { await unlink(tmpPath); } catch { /* ignore */ }
		}
	}

	private markBreadcrumbHostError(restartId: string): void {
		const filePath = this.breadcrumbPath;
		if (!filePath || this.writtenBreadcrumb?.restartId !== restartId) {
			return;
		}
		const updated: IPendingRestartBreadcrumb = { ...this.writtenBreadcrumb, hostError: true };
		this.writtenBreadcrumb = updated;
		try {
			// eslint-disable-next-line local/code-no-sync-fs -- The synchronous post-shutdown quit-and-install error path cannot await async I/O while Electron is exiting, and the shared process telemetry channel is already shutting down; persist hostError for reliable startup reporting.
			writeFileSync(filePath, JSON.stringify(updated), 'utf8');
		} catch (e) {
			this.logService.error('Failed to update restart breadcrumb with hostError', e);
		}
	}

	private async reportCompletedRestart(): Promise<void> {
		const filePath = this.breadcrumbPath;
		if (!filePath) {
			return;
		}
		let raw: string;
		try {
			raw = await readFile(filePath, 'utf8');
		} catch {
			return;
		}
		try { await unlink(filePath); } catch { /* ignore */ }

		let pending: Partial<IPendingRestartBreadcrumb>;
		try {
			pending = JSON.parse(raw);
		} catch {
			return;
		}
		if (!pending || typeof pending.restartId !== 'string' || pending.installRoot !== this.environmentMainService.appRoot
			|| typeof pending.quitWallMs !== 'number' || typeof pending.quitMonotonicNs !== 'string' || !/^\d+$/.test(pending.quitMonotonicNs)
			|| typeof pending.quitBootTimeSec !== 'number' || typeof pending.earlyStaging !== 'boolean' || typeof pending.unattended !== 'boolean') {
			return;
		}

		if (pending.hostError) {
			this.telemetryService.publicLog2<RestartCompletedEvent, RestartCompletedClassification>('update:restartCompleted', {
				restartId: pending.restartId,
				outcome: 'hostError',
				fromCommit: pending.fromCommit ?? '',
				expectedCommit: pending.expectedCommit ?? '',
				monotonicExitToMainStartMs: -1,
				wallExitToMainStartMs: -1,
				clockSkewMs: -1,
				sameBoot: true,
				cleanInterval: false,
				earlyStaging: pending.earlyStaging,
				unattended: pending.unattended,
			});
			return;
		}

		const bootSessionId = await this.getBootSessionId();
		const nowWallMs = Date.now();
		const nowMonotonicNs = process.hrtime.bigint();
		const mainStartWallMs = Math.round(performance.timeOrigin);
		const nowBootTimeSec = Math.round(nowWallMs / 1000 - os.uptime());
		const quitMonotonicNs = BigInt(pending.quitMonotonicNs);

		const sameBoot = (bootSessionId !== undefined && pending.quitBootSessionId !== undefined)
			? bootSessionId === pending.quitBootSessionId
			: (nowMonotonicNs >= quitMonotonicNs && Math.abs(nowBootTimeSec - pending.quitBootTimeSec) <= 5);

		const mainStartMonotonicNs = nowMonotonicNs - BigInt(Math.round(performance.now() * 1e6));
		const monotonicExitToMainStartMs = sameBoot ? Math.round(Number(mainStartMonotonicNs - quitMonotonicNs) / 1e6) : -1;
		const wallExitToMainStartMs = mainStartWallMs - pending.quitWallMs;
		const clockSkewMs = sameBoot ? (nowWallMs - pending.quitWallMs) - Math.round(Number(nowMonotonicNs - quitMonotonicNs) / 1e6) : -1;
		const cleanInterval = sameBoot && Math.abs(clockSkewMs) <= 2000 && monotonicExitToMainStartMs >= 0 && wallExitToMainStartMs >= 0;

		this.telemetryService.publicLog2<RestartCompletedEvent, RestartCompletedClassification>('update:restartCompleted', {
			restartId: pending.restartId,
			outcome: classifyRestartOutcome(pending.fromCommit ?? '', this.productService.commit ?? '', pending.expectedCommit ?? ''),
			fromCommit: pending.fromCommit ?? '',
			expectedCommit: pending.expectedCommit ?? '',
			monotonicExitToMainStartMs,
			wallExitToMainStartMs,
			clockSkewMs,
			sameBoot,
			cleanInterval,
			earlyStaging: pending.earlyStaging,
			unattended: pending.unattended,
		});
	}

	private abortPendingRestart(outcome: 'vetoed' | 'hostError'): void {
		const restart = this.pendingRestart;
		if (!restart) {
			return;
		}
		this.pendingRestart = undefined;
		if (outcome === 'hostError' && this.writtenBreadcrumb?.restartId === restart.restartId) {
			this.markBreadcrumbHostError(restart.restartId);
			return;
		}
		this.telemetryService.publicLog2<RestartCompletedEvent, RestartCompletedClassification>('update:restartCompleted', {
			restartId: restart.restartId,
			outcome,
			fromCommit: this.productService.commit ?? '',
			expectedCommit: restart.expectedCommit,
			monotonicExitToMainStartMs: -1,
			wallExitToMainStartMs: -1,
			clockSkewMs: -1,
			sameBoot: true,
			cleanInterval: false,
			earlyStaging: restart.earlyStaging,
			unattended: restart.unattended,
		});
	}

	override async quitAndInstall(options?: IQuitAndInstallOptions): Promise<void> {
		this.nextQuitUnattended = Boolean(options?.unattended);
		return super.quitAndInstall(options);
	}

	protected override setState(state: State, options?: { deferred?: boolean }): void {
		const prevType = this.state.type;
		super.setState(state, options);

		if (state.type === StateType.Restarting && prevType !== StateType.Restarting) {
			const restart = {
				restartId: generateUuid(),
				expectedCommit: state.update.version,
				earlyStaging: this.readyEarlyStaging ?? this.isEarlyStagingEnabled(),
				unattended: this.nextQuitUnattended,
			};
			this.pendingRestart = restart;
			this.telemetryService.publicLog2<RestartAttemptEvent, RestartAttemptClassification>('update:restartAttempt', {
				restartId: restart.restartId,
				fromCommit: this.productService.commit ?? '',
				expectedCommit: restart.expectedCommit,
				earlyStaging: restart.earlyStaging,
				unattended: restart.unattended,
			});
		} else if (prevType === StateType.Restarting && state.type === StateType.Ready) {
			this.abortPendingRestart('vetoed');
		}
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
		if (this.environmentMainService.isBuilt) {
			await this.reportCompletedRestart();
		}

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
		const earlyStaging = this.pendingRestart?.earlyStaging
			?? (this.state.type === StateType.Downloading ? this.activeDownloadEarlyStaging : this.pendingCheckEarlyStaging)
			?? this.readyEarlyStaging;
		this.telemetryService.publicLog2<UpdateErrorEvent, UpdateErrorClassification>('update:error', {
			messageHash: String(hash(String(err))),
			state: this.state.type,
			earlyStaging,
		});
		this.logService.error('UpdateService error:', err);

		if (this.pendingRestart) {
			this.abortPendingRestart('hostError');
			return;
		}

		// Only react while actively checking/downloading; a late error must not clobber Disabled or Ready.
		if (this.state.type !== StateType.CheckingForUpdates && this.state.type !== StateType.Downloading && this.state.type !== StateType.Overwriting) {
			return;
		}

		this.activeDownloadEarlyStaging = undefined;

		// only show message when explicitly checking for updates
		const message = (this.state.type === StateType.CheckingForUpdates && this.state.explicit) ? err : undefined;
		this.setState(State.Idle(UpdateType.Archive, message));
	}

	protected override getUpdateFeedUrl(quality: string, commit: string, options?: IUpdateURLOptions): string | undefined {
		const assetID = this.productService.darwinUniversalAssetId ?? (process.arch === 'x64' ? 'darwin' : 'darwin-arm64');
		return createUpdateURL(this.productService.updateUrl!, assetID, quality, commit, options);
	}

	protected buildUpdateFeedUrl(quality: string, commit: string, options?: IUpdateURLOptions): string | undefined {
		const url = this.getUpdateFeedUrl(quality, commit, options);
		if (!url) {
			return undefined;
		}
		const headers = getUpdateRequestHeaders(this.productService.version);
		const earlyStaging = this.isEarlyStagingEnabled();
		let registered = false;
		try {
			this.host.registerEarlyStaging(earlyStaging);
			registered = true;
		} catch (e) {
			this.logService.error('Failed to update SquirrelMacEnableEarlyStaging default', e);
		}
		try {
			this.logService.trace('update#buildUpdateFeedUrl - setting feed URL for Electron autoUpdater', { url, quality, commit, headers, earlyStaging });
			this.host.setFeedURL(url, headers);
		} catch (e) {
			// application is very likely not signed
			this.logService.error('Failed to set update feed URL', e);
			return undefined;
		}
		this.pendingCheckEarlyStaging = earlyStaging && registered;
		return url;
	}

	protected doCheckForUpdates(explicit: boolean, pendingCommit?: string): void {
		if (!this.quality) {
			return;
		}

		this.setState(State.CheckingForUpdates(explicit));

		const internalOrg = this.getInternalOrg();
		const background = !explicit && !internalOrg;

		// When connection is metered and this is not an explicit check, avoid electron call as to not to trigger auto-download.
		if (!explicit && this.meteredConnectionService.isConnectionMetered) {
			const url = this.getUpdateFeedUrl(this.quality, pendingCommit ?? this.productService.commit!, { background, internalOrg });
			if (!url) {
				this.setState(State.Idle(UpdateType.Archive));
				return;
			}
			this.logService.info('update#doCheckForUpdates - checking for update without auto-download because connection is metered');
			this.checkForUpdateNoDownload(url);
			return;
		}

		const url = this.buildUpdateFeedUrl(this.quality, pendingCommit ?? this.productService.commit!, { background, internalOrg });

		if (!url) {
			this.setState(State.Idle(UpdateType.Archive));
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

		this.activeDownloadEarlyStaging = this.pendingCheckEarlyStaging ?? this.isEarlyStagingEnabled();
		this.setState(State.Downloading(this.state.type === StateType.Overwriting ? this.state.update : undefined, this.state.explicit, this._overwrite));
	}

	private onUpdateDownloaded(update: IUpdate): void {
		if (this.state.type !== StateType.Downloading) {
			return;
		}

		this.readyEarlyStaging = this.activeDownloadEarlyStaging ?? this.pendingCheckEarlyStaging ?? this.isEarlyStagingEnabled();
		this.activeDownloadEarlyStaging = undefined;

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
		const url = this.buildUpdateFeedUrl(this.quality!, state.update.version, { internalOrg: this.getInternalOrg() });
		if (!url) {
			this.setState(State.Idle(UpdateType.Archive));
			return;
		}
		this.setState(State.CheckingForUpdates(true));
		this.host.checkForUpdates();
	}

	protected override doQuitAndInstall(options?: IQuitAndInstallOptions): void {
		// TODO(deepak1556): in Squirrel.Mac, (1) pass `options?.relaunchInBackground` so ShipIt
		// launches with `NSWorkspaceLaunchWithoutActivation`, and (2) extend ShipIt's `Updating`
		// IOPMAssertion transaction to cover the helper spawn so the sleep assertion is tied to
		// the exact install+relaunch lifetime without external timers.
		this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()', { unattended: options?.unattended, relaunchInBackground: options?.relaunchInBackground });
		try {
			this.host.quitAndInstall();
		} catch (e) {
			this.logService.error('update#quitAndInstall(): host.quitAndInstall() failed', e);
			this.telemetryService.publicLog2<UpdateErrorEvent, UpdateErrorClassification>('update:error', {
				messageHash: String(hash(String(e))),
				state: StateType.Restarting,
				earlyStaging: this.pendingRestart?.earlyStaging,
			});
			this.abortPendingRestart('hostError');
		}
	}
}
