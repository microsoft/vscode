/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import * as electron from 'electron';
import { mkdir, readFile, unlink } from 'fs/promises';
import { release, tmpdir } from 'os';
import { localize } from '../../../nls.js';
import { Delayer, ProcessTimeRunOnceScheduler, timeout } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { memoize } from '../../../base/common/decorators.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { hash } from '../../../base/common/hash.js';
import * as path from '../../../base/common/path.js';
import { basename } from '../../../base/common/path.js';
import { transform } from '../../../base/common/stream.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { checksum } from '../../../base/node/crypto.js';
import * as pfs from '../../../base/node/pfs.js';
import { getWindowsRelease } from '../../../base/node/windowsVersion.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IFileService } from '../../files/common/files.js';
import { ILifecycleMainService, IRelaunchHandler, IRelaunchOptions } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IMeteredConnectionService } from '../../meteredConnection/common/meteredConnection.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, IRequestService } from '../../request/common/request.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AvailableForDownload, DisablementReason, IUpdate, State, StateType, UpdateType } from '../common/update.js';
import { AbstractUpdateService, createUpdateURL, getUpdateRequestHeaders, IUpdateURLOptions, UpdateErrorClassification } from './abstractUpdateService.js';
import { getWin32UpdateType } from './win32UpdateType.js';
import { Win32UpdateAttempt } from './win32UpdateAttempt.js';
import { Win32UpdateProcess } from './win32UpdateProcess.js';

interface IAvailableUpdate {
	packagePath: string;
	updateAttempt?: Win32UpdateAttempt;
}

interface IWindowsMutex {
	isActive(name: string): boolean;
}

export class Win32UpdateService extends AbstractUpdateService implements IRelaunchHandler {

	private availableUpdate: IAvailableUpdate | undefined;
	private readonly updateType = getWin32UpdateType();
	/** Cancels an in-flight check/download chain (e.g. when updates are disabled at runtime). */
	private checkCancellationTokenSource: CancellationTokenSource | undefined;
	/** Settles when the in-flight check/download chain has fully unwound; used by the cancel path. */
	private checkPromise: Promise<unknown> | undefined;

	private readonly readyMutexName: string;
	private readonly updatingMutexName: string;
	private readonly setupMutexName: string;

	private get cachePathSync(): string {
		return path.join(tmpdir(), `vscode-${this.productService.quality}-${this.productService.target}-${process.arch}`);
	}

	@memoize
	get cachePath(): Promise<string> {
		const result = this.cachePathSync;
		return mkdir(result, { recursive: true }).then(() => result);
	}

	@memoize
	protected get mutex(): Promise<IWindowsMutex> {
		return import('@vscode/windows-mutex');
	}

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@INativeHostMainService private readonly nativeHostMainService: INativeHostMainService,
		@IProductService productService: IProductService,
		@IApplicationStorageMainService applicationStorageMainService: IApplicationStorageMainService,
		@IMeteredConnectionService meteredConnectionService: IMeteredConnectionService,
	) {
		super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService, telemetryService, applicationStorageMainService, meteredConnectionService, true);

		this.readyMutexName = `${productService.win32MutexName}-ready`;
		this.updatingMutexName = `${productService.win32MutexName}-updating`;
		this.setupMutexName = `${productService.win32MutexName}setup`;

		lifecycleMainService.setRelaunchHandler(this);
	}

	handleRelaunch(options?: IRelaunchOptions): boolean {
		if (options?.addArgs || options?.removeArgs) {
			return false; // we cannot apply an update and restart with different args
		}

		if (this.state.type !== StateType.Ready || !this.availableUpdate) {
			return false; // we only handle the relaunch when we have a pending update
		}

		this.logService.trace('update#handleRelaunch(): running raw#quitAndInstall()');
		this.doQuitAndInstall();

		return true;
	}

	protected override async initialize(): Promise<void> {
		if (this.productService.win32VersionedUpdate) {
			const cachePath = await this.cachePath;
			electron.app.setPath('appUpdate', cachePath);
			await this.unlink(path.join(cachePath, 'session-ending.flag'));
		}

		// Send telemetry
		type WindowsUpdateInitEvent = {
			osRelease: string;
			osNodeRelease: string;
		};
		type WindowsUpdateInitClassification = {
			osRelease: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Windows OS release version from registry.' };
			osNodeRelease: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Windows OS release version from os.release().' };
			owner: 'dmitriv';
			comment: 'Tracks Windows OS release information during update initialization.';
		};
		const osRelease = await getWindowsRelease();
		const osNodeRelease = release();
		this.telemetryService.publicLog2<WindowsUpdateInitEvent, WindowsUpdateInitClassification>('windowsUpdateInit', { osRelease, osNodeRelease });

		if (this.productService.target === 'user' && await this.nativeHostMainService.isAdmin(undefined)) {
			this.setState(State.Disabled(DisablementReason.RunningAsAdmin));
			this.logService.info('update#ctor - updates are disabled due to running as Admin in user setup');
			return;
		}

		await super.initialize();
	}

	protected override async postInitialize(): Promise<void> {
		if (!this.productService.win32VersionedUpdate) {
			return;
		}
		// Check for pending update from previous session
		// This can happen if the app is quit right after the update has been
		// downloaded and before the update has been applied.
		const exePath = electron.app.getPath('exe');
		const exeDir = path.dirname(exePath);
		const updatingVersionPath = path.join(exeDir, 'updating_version');
		if (await pfs.Promises.exists(updatingVersionPath)) {
			try {
				const updatingVersion = (await readFile(updatingVersionPath, 'utf8')).trim();
				this.logService.info(`update#doCheckForUpdates - application was updating to version ${updatingVersion}`);
				const updatePackagePath = await this.getUpdatePackagePath(updatingVersion);
				if (await pfs.Promises.exists(updatePackagePath)) {
					await this._applySpecificUpdate(updatePackagePath, updatingVersion);
					this.logService.info(`update#doCheckForUpdates - successfully applied update to version ${updatingVersion}`);
				}
			} catch (e) {
				this.logService.error(`update#doCheckForUpdates - could not read ${updatingVersionPath}`, e);
			} finally {
				// updatingVersionPath will be deleted by inno setup.
			}
		} else {
			await this.collectGarbage();
		}
	}

	private async collectGarbage(): Promise<void> {
		if (!this.productService.win32VersionedUpdate) {
			return;
		}

		const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
		// GC for background updates in system setup happens via inno_setup since it requires elevated permissions.
		if (!fastUpdatesEnabled || this.productService.target !== 'user' || !this.productService.commit) {
			return;
		}

		const exePath = electron.app.getPath('exe');
		const exeDir = path.dirname(exePath);
		const versionedResourcesFolder = this.productService.commit.substring(0, 10);
		const innoUpdater = path.join(exeDir, versionedResourcesFolder, 'tools', 'inno_updater.exe');
		const exeName = basename(exePath);
		await new Promise<void>(resolve => {
			const child = spawn(innoUpdater, ['--gc', exePath, versionedResourcesFolder, exeName], {
				stdio: ['ignore', 'ignore', 'ignore'],
				windowsHide: true,
				timeout: 2 * 60 * 1000
			});
			// Resolve on 'error' too (missing inno_updater / permission denied) so the awaited promise always settles.
			child.once('error', err => {
				this.logService.error('update#collectGarbage - failed to spawn inno_updater', err);
				resolve();
			});
			child.once('exit', () => resolve());
		});
	}

	protected buildUpdateFeedUrl(quality: string, commit: string, options?: IUpdateURLOptions): string | undefined {
		let platform = `win32-${process.arch}`;

		if (this.updateType === UpdateType.Archive) {
			platform += '-archive';
		} else if (this.productService.target === 'user') {
			platform += '-user';
		}

		return createUpdateURL(this.productService.updateUrl!, platform, quality, commit, options);
	}

	protected doCheckForUpdates(explicit: boolean, pendingCommit?: string): void {
		if (!this.quality) {
			return;
		}

		const internalOrg = this.getInternalOrg();
		const background = !explicit && !internalOrg;
		const url = this.buildUpdateFeedUrl(this.quality, pendingCommit ?? this.productService.commit!, { background, internalOrg });

		// Only set CheckingForUpdates if we're not already in Overwriting state
		if (this.state.type !== StateType.Overwriting) {
			this.setState(State.CheckingForUpdates(explicit));
		}

		// Track this check/download chain so it can be cancelled if updates are disabled at runtime.
		this.checkCancellationTokenSource?.dispose(true);
		const cts = this.checkCancellationTokenSource = new CancellationTokenSource();
		const token = cts.token;

		const headers = getUpdateRequestHeaders(this.productService.version);
		const promise = this.requestService.request({ url, headers, callSite: 'updateService.win32.checkForUpdates' }, token)
			.then<IUpdate | null>(asJson)
			.then(update => {
				const updateType = this.updateType;

				if (token.isCancellationRequested) {
					return Promise.resolve(null);
				}

				if (!update || !update.url || !update.version || !update.productVersion) {
					// If we were checking for an overwrite update and found nothing newer,
					// restore the Ready state with the pending update
					if (this.state.type === StateType.Overwriting) {
						this._overwrite = false;
						this.setState(State.Ready(this.state.update, this.state.explicit, false));
					} else {
						this.setState(State.Idle(updateType, undefined, explicit || undefined));
					}
					return Promise.resolve(null);
				}

				if (updateType === UpdateType.Archive) {
					this.setState(State.AvailableForDownload(update));
					return Promise.resolve(null);
				}

				// When connection is metered and this is not an explicit check,
				// show update is available but don't start downloading
				if (!explicit && this.meteredConnectionService.isConnectionMetered) {
					this.logService.info('update#doCheckForUpdates - update available but skipping download because connection is metered');
					this.setState(State.AvailableForDownload(update));
					return Promise.resolve(null);
				}

				const startTime = Date.now();
				this.setState(State.Downloading(update, explicit, this._overwrite, 0, undefined, startTime));

				return this.cleanup(update.version).then(() => {
					return this.getUpdatePackagePath(update.version).then(updatePackagePath => {
						return pfs.Promises.exists(updatePackagePath).then(exists => {
							if (exists) {
								return Promise.resolve(updatePackagePath);
							}

							const downloadPath = `${updatePackagePath}.tmp`;

							return this.requestService.request({ url: update.url, callSite: 'updateService.win32.downloadUpdate' }, token)
								.then(context => {
									// Get total size from Content-Length header
									const contentLengthHeader = context.res.headers['content-length'];
									const contentLength = typeof contentLengthHeader === 'string' ? contentLengthHeader : undefined;
									const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;

									// Track downloaded bytes and update state periodically using Delayer
									let downloadedBytes = 0;
									const progressDelayer = new Delayer<void>(500);
									const progressStream = transform<VSBuffer, VSBuffer>(
										context.stream,
										{
											data: data => {
												downloadedBytes += data.byteLength;
												progressDelayer.trigger(() => {
													this.setState(State.Downloading(update, explicit, this._overwrite, downloadedBytes, totalBytes, startTime));
												});
												return data;
											}
										},
										chunks => VSBuffer.concat(chunks)
									);

									return this.fileService.writeFile(URI.file(downloadPath), progressStream)
										.finally(() => progressDelayer.dispose());
								})
								.then(update.sha256hash ? () => checksum(downloadPath, update.sha256hash) : () => undefined)
								.then(() => pfs.Promises.rename(downloadPath, updatePackagePath, false /* no retry */))
								.then(() => updatePackagePath);
						});
					}).then(packagePath => {
						if (token.isCancellationRequested) {
							return;
						}

						this.availableUpdate = { packagePath };
						this.saveUpdateMetadata(update);
						this.setState(State.Downloaded(update, explicit, this._overwrite));

						const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
						if (fastUpdatesEnabled && this.productService.target === 'user') {
							this.doApplyUpdate();
						} else {
							this.setState(State.Ready(update, explicit, this._overwrite));
						}
					});
				});
			})
			.then(undefined, err => {
				// The chain was cancelled because updates are being disabled; leave state to the disable flow.
				if (token.isCancellationRequested || isCancellationError(err)) {
					return;
				}

				this.telemetryService.publicLog2<{ messageHash: string }, UpdateErrorClassification>('update:error', { messageHash: String(hash(String(err))) });
				this.logService.error(err);

				// only show message when explicitly checking for updates
				const message: string | undefined = explicit ? (err.message || err) : undefined;

				// If we were checking for an overwrite update and it failed,
				// restore the Ready state with the pending update
				if (this.state.type === StateType.Overwriting) {
					this._overwrite = false;
					this.setState(State.Ready(this.state.update, this.state.explicit, false));
				} else {
					this.setState(State.Idle(this.updateType, message));
				}
			});

		this.checkPromise = promise;

		promise.finally(() => {
			if (this.checkCancellationTokenSource === cts) {
				this.checkCancellationTokenSource = undefined;
			}
			if (this.checkPromise === promise) {
				this.checkPromise = undefined;
			}
			cts.dispose();
		});
	}

	protected override async doDownloadUpdate(state: AvailableForDownload): Promise<void> {
		if (state.update.url) {
			this.nativeHostMainService.openExternal(undefined, state.update.url);
		}
		this.setState(State.Idle(this.updateType));
	}

	private async getUpdatePackagePath(version: string): Promise<string> {
		const cachePath = await this.cachePath;
		return path.join(cachePath, `CodeSetup-${this.productService.quality}-${version}.exe`);
	}

	private async cleanup(exceptVersion: string | null = null): Promise<void> {
		const filter = exceptVersion ? (one: string) => !(new RegExp(`${this.productService.quality}-${exceptVersion}\\.exe$`).test(one)) : () => true;

		const cachePath = await this.cachePath;
		const versions = await pfs.Promises.readdir(cachePath);

		const promises = versions.filter(filter).map(one => this.unlink(path.join(cachePath, one)));
		await Promise.all(promises);
	}

	protected override async doApplyUpdate(): Promise<void> {
		if (this.state.type !== StateType.Downloaded) {
			return Promise.resolve(undefined);
		}

		const availableUpdate = this.availableUpdate;
		if (!availableUpdate) {
			return Promise.resolve(undefined);
		}

		const update = this.state.update;
		const explicit = this.state.explicit;
		this.setState(State.Updating(update, explicit));

		const cachePath = await this.cachePath;
		if (!this.isApplyingUpdate(availableUpdate)) {
			return;
		}

		const mutex = await this.mutex;
		if (!this.isApplyingUpdate(availableUpdate)) {
			return;
		}

		const updateAttempt = availableUpdate.updateAttempt = new Win32UpdateAttempt(cachePath, availableUpdate.packagePath, this.productService.quality!, update.version, generateUuid(), this.logService);
		const token = updateAttempt.cancellationTokenSource.token;
		const skippedSpawn = this.isInstallerActive(mutex);

		// Skip the spawn if another Inno Setup is already running for this product (background update or a manual installer);
		// otherwise Inno's "Setup is already running" modal pops up. The `-ready` mutex poll below still advances our state when it finishes.
		if (skippedSpawn) {
			try {
				await updateAttempt.resolveForeignUpdateFiles();
			} catch (error) {
				this.failUpdateAttempt(availableUpdate, updateAttempt, error instanceof Error ? error : new Error(String(error)));
				return;
			}

			if (!this.isCurrentUpdateAttempt(availableUpdate, updateAttempt)) {
				updateAttempt.complete();
				await updateAttempt.cleanup();
				return;
			}

			this.logService.info('update#doApplyUpdate: another instance is already running setup, waiting for it to finish');
		} else {
			try {
				await updateAttempt.prepare();
			} catch (error) {
				this.failUpdateAttempt(availableUpdate, updateAttempt, error instanceof Error ? error : new Error(String(error)));
				return;
			}

			if (!this.isCurrentUpdateAttempt(availableUpdate, updateAttempt)) {
				updateAttempt.complete();
				await updateAttempt.cleanup();
				return;
			}

			let updateProcess: Win32UpdateProcess;
			try {
				updateProcess = updateAttempt.startProcess([]);
			} catch (error) {
				this.failUpdateAttempt(availableUpdate, updateAttempt, error instanceof Error ? error : new Error(String(error)));
				return;
			}

			updateProcess.whenTerminated.then(async result => {
				if (result.type === 'error') {
					this.failUpdateAttempt(availableUpdate, updateAttempt, result.error);
					return;
				}

				if (!mutex.isActive(this.readyMutexName)) {
					await timeout(500);
				}

				if (mutex.isActive(this.readyMutexName)) {
					this.completeUpdateAttempt(availableUpdate, updateAttempt, update, explicit);
				} else {
					this.failUpdateAttempt(availableUpdate, updateAttempt, new Error(`Update installer exited before ready (code: ${result.code}, signal: ${result.signal})`));
				}
			});
		}

		const poll = async () => {
			// If we skipped the spawn, the foreign installer was active when we started; treat that as having seen it run
			// so a quick exit (cancel/fail) before the first poll iteration still drops us to Idle.
			let seenRunning = skippedSpawn;
			while (this.isCurrentUpdateAttempt(availableUpdate, updateAttempt)) {
				if (mutex.isActive(this.readyMutexName)) {
					this.completeUpdateAttempt(availableUpdate, updateAttempt, update, explicit);
					return;
				}

				// Inno gone without `-ready` => install cancelled/failed; drop to Idle.
				if (this.isInstallerActive(mutex)) {
					seenRunning = true;
				} else if (seenRunning) {
					if (skippedSpawn) {
						this.failUpdateAttempt(availableUpdate, updateAttempt, new Error('Update installer exited before ready'));
					}
					return;
				}

				const progress = await updateAttempt.readProgress();
				if (!token.isCancellationRequested && progress && this.state.type === StateType.Updating) {
					if (this.state.currentProgress !== progress.current || this.state.maxProgress !== progress.total) {
						this.setState(State.Updating(update, explicit, progress.current, progress.total));
					}
				}

				await timeout(500);
			}
		};

		const cancelTimeout = new ProcessTimeRunOnceScheduler(() => {
			this.failUpdateAttempt(availableUpdate, updateAttempt, new Error('Update installer timed out waiting to become ready'), true);
		}, 60 * 60 * 1000);

		// Poll for progress and ready mutex for 1 hour.
		cancelTimeout.schedule();
		poll().finally(() => {
			cancelTimeout.dispose();
			if (!this.isCurrentUpdateAttempt(availableUpdate, updateAttempt)) {
				updateAttempt.complete();
			}
		});
	}

	private isCurrentUpdateAttempt(availableUpdate: IAvailableUpdate, updateAttempt: Win32UpdateAttempt): boolean {
		return this.isApplyingUpdate(availableUpdate)
			&& availableUpdate.updateAttempt === updateAttempt
			&& updateAttempt.isActive;
	}

	private isApplyingUpdate(availableUpdate: IAvailableUpdate): boolean {
		return this.availableUpdate === availableUpdate && this.state.type === StateType.Updating;
	}

	private completeUpdateAttempt(availableUpdate: IAvailableUpdate, updateAttempt: Win32UpdateAttempt, update: IUpdate, explicit: boolean): void {
		if (!this.isCurrentUpdateAttempt(availableUpdate, updateAttempt)) {
			return;
		}

		updateAttempt.complete();
		this.setState(State.Ready(update, explicit, this._overwrite));
	}

	private failUpdateAttempt(availableUpdate: IAvailableUpdate, updateAttempt: Win32UpdateAttempt, error: Error, stopProcess = false): void {
		if (!this.isCurrentUpdateAttempt(availableUpdate, updateAttempt)) {
			updateAttempt.complete();
			return;
		}

		updateAttempt.complete();
		this.doFailUpdateAttempt(availableUpdate, error, stopProcess).catch(stopError => {
			this.logService.error('update#doApplyUpdate: failed to stop update installer after failure', stopError);
		});
	}

	private async doFailUpdateAttempt(availableUpdate: IAvailableUpdate, error: Error, stopProcess: boolean): Promise<void> {
		this.telemetryService.publicLog2<{ messageHash: string }, UpdateErrorClassification>('update:error', { messageHash: String(hash(String(error))) });
		this.logService.error('update#doApplyUpdate: update installation failed', error);

		try {
			if (stopProcess) {
				await availableUpdate.updateAttempt?.stopProcess();
			}
		} finally {
			if (this.availableUpdate === availableUpdate) {
				this.availableUpdate = undefined;
			}

			await availableUpdate.updateAttempt?.cleanup(true);

			if (!this.availableUpdate && this.state.type === StateType.Updating) {
				this.setState(State.Idle(this.updateType, localize('updateInstallFailed', "Update installation failed. Please try again.")));
			}
		}
	}

	protected override async cancelUpdate(): Promise<void> {
		// Abort an in-flight check/download so it never reaches the background installer.
		const hadInFlightCheck = !!this.checkCancellationTokenSource;
		const hadPendingUpdate = !!this.availableUpdate;
		this.checkCancellationTokenSource?.dispose(true);
		this.checkCancellationTokenSource = undefined;

		// Only clean up if a check/download was in flight; avoids creating the cache dir when just disabled.
		if (hadInFlightCheck) {
			try {
				await this.checkPromise;
			} catch {
				// the chain swallows its own errors; ignore
			}
			await this.cleanupTempFiles();
		}

		// Tear down any pending (downloaded/applying) update.
		await this.cancelPendingUpdate();

		// Reclaim a partial versioned-resource folder a cancelled update may leave; only after real teardown.
		if (hadInFlightCheck || hadPendingUpdate) {
			this.collectGarbage().catch(err => this.logService.error('update#collectGarbage - failed to collect garbage', err));
		}
	}

	private async cleanupTempFiles(): Promise<void> {
		try {
			const cachePath = await this.cachePath;
			const files = await pfs.Promises.readdir(cachePath);
			await Promise.all(files.filter(file => file.endsWith('.tmp')).map(file => this.unlink(path.join(cachePath, file))));
		} catch (err) {
			this.logService.warn('update#cleanupTempFiles: failed to remove temporary download files', err);
		}
	}

	protected override async cancelPendingUpdate(): Promise<void> {
		const availableUpdate = this.availableUpdate;
		if (!availableUpdate) {
			return;
		}

		const updateAttempt = availableUpdate.updateAttempt;

		// Another instance owns the installer: abort if it's still running so we don't start a new
		// update cycle on top of it; keep `availableUpdate` so quit-and-install can still complete.
		if (!updateAttempt?.isProcessRunning && this.isInstallerActive(await this.mutex)) {
			throw new Error('Cannot cancel pending update: another instance is still running setup');
		}

		updateAttempt?.complete();

		if (updateAttempt?.isProcessRunning) {
			this.logService.trace('update#cancelPendingUpdate: cancelling pending update');
			await updateAttempt.stopProcess();
		}

		await updateAttempt?.cleanup();

		if (this.availableUpdate === availableUpdate) {
			this.availableUpdate = undefined;
		}
	}

	protected override doQuitAndInstall(): void {
		if ((this.state.type !== StateType.Ready && this.state.type !== StateType.Restarting) || !this.availableUpdate) {
			return;
		}

		this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');

		if (this.availableUpdate.updateAttempt) {
			this.availableUpdate.updateAttempt.acceptForInstall();
		} else {
			spawn(this.availableUpdate.packagePath, ['/silent', '/log', '/mergetasks=runcode,!desktopicon,!quicklaunchicon'], {
				detached: true,
				stdio: ['ignore', 'ignore', 'ignore'],
				env: { ...process.env, __COMPAT_LAYER: 'RunAsInvoker' }
			});
		}
	}

	private async saveUpdateMetadata(update: IUpdate): Promise<void> {
		try {
			const cachePath = await this.cachePath;
			const metadataPath = path.join(cachePath, 'update-metadata.json');
			await pfs.Promises.writeFile(metadataPath, JSON.stringify(update));
		} catch (e) {
			this.logService.error('update#saveUpdateMetadata: failed to save', e);
		}
	}

	private async loadUpdateMetadata(): Promise<IUpdate | undefined> {
		try {
			const cachePath = await this.cachePath;
			const metadataPath = path.join(cachePath, 'update-metadata.json');
			if (await pfs.Promises.exists(metadataPath)) {
				const content = await readFile(metadataPath, 'utf8');
				return JSON.parse(content);
			}
		} catch (e) {
			this.logService.error('update#loadUpdateMetadata: failed to load', e);
		}
		return undefined;
	}

	protected override getUpdateType(): UpdateType {
		return this.updateType;
	}

	override async _applySpecificUpdate(packagePath: string, commit?: string): Promise<void> {
		if (this.state.type !== StateType.Idle) {
			return;
		}

		const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
		const update: IUpdate = await this.loadUpdateMetadata() ?? { version: commit ?? 'unknown', productVersion: 'unknown' };

		this.setState(State.Downloading(update, true, false));
		this.availableUpdate = { packagePath };
		this.setState(State.Downloaded(update, true, false));

		if (fastUpdatesEnabled && this.productService.target === 'user') {
			this.doApplyUpdate();
		} else {
			this.setState(State.Ready(update, true, false));
		}
	}

	private isInstallerActive(mutex: IWindowsMutex): boolean {
		return mutex.isActive(this.updatingMutexName) || mutex.isActive(this.setupMutexName);
	}

	private async unlink(path: string | undefined): Promise<void> {
		if (path) {
			try {
				await unlink(path);
			} catch (err) {
				const error = err as NodeJS.ErrnoException;
				if (error && error.code === 'ENOENT') {
					return;
				} else {
					this.logService.warn(`update#unlink: failed to unlink ${basename(path)}`, err);
				}
			}
		}
	}
}
