/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import * as fs from 'fs';
import { app } from 'electron';
import { timeout } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { hash } from '../../../base/common/hash.js';
import * as path from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { checksum } from '../../../base/node/crypto.js';
import * as pfs from '../../../base/node/pfs.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IFileService } from '../../files/common/files.js';
import { ILifecycleMainService, IRelaunchHandler, IRelaunchOptions } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, IRequestService } from '../../request/common/request.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AvailableForDownload, DisablementReason, IUpdate, State, StateType, UpdateType } from '../common/update.js';
import { AbstractUpdateService, createUpdateURL, UpdateErrorClassification } from './abstractUpdateService.js';

async function pollUntil(fn: () => boolean, millis = 1000): Promise<void> {
	while (!fn()) {
		await timeout(millis);
	}
}

interface IAvailableUpdate {
	packagePath: string;
	updateFilePath?: string;
}

let _updateType: UpdateType | undefined = undefined;
function getUpdateType(): UpdateType {
	if (typeof _updateType === 'undefined') {
		_updateType = fs.existsSync(path.join(path.dirname(process.execPath), 'unins000.exe'))
			? UpdateType.Setup
			: UpdateType.Archive;
	}

	return _updateType;
}

export class Win32UpdateService extends AbstractUpdateService implements IRelaunchHandler {

	private availableUpdate: IAvailableUpdate | undefined;

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@INativeHostMainService private readonly nativeHostMainService: INativeHostMainService,
		@IProductService productService: IProductService
	) {
		super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService);

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
		if (this.productService.target === 'user' && await this.nativeHostMainService.isAdmin(undefined)) {
			this.setState(State.Disabled(DisablementReason.RunningAsAdmin));
			this.logService.info('update#ctor - updates are disabled due to running as Admin in user setup');
			return;
		}

		const cachePath = await this.nativeHostMainService.cachePath;
		try {
			await fs.promises.unlink(path.join(cachePath, 'session-ending.flag'));
		} catch { }

		await super.initialize();
	}

	protected buildUpdateFeedUrl(quality: string): string | undefined {
		let platform = `win32-${process.arch}`;

		if (getUpdateType() === UpdateType.Archive) {
			platform += '-archive';
		} else if (this.productService.target === 'user') {
			platform += '-user';
		}

		return createUpdateURL(platform, quality, this.productService);
	}

	protected doCheckForUpdates(explicit: boolean): void {
		if (!this.url || this.state.type === StateType.Updating) {
			return;
		}

		// Check for pending update from previous session
		// This can happen if the app is quit right after the update has been
		// downloaded and before the update has been applied.
		const exePath = app.getPath('exe');
		const updatingVersionPath = path.join(exePath, 'updating_version');
		if (fs.existsSync(updatingVersionPath)) {
			fs.promises.readFile(updatingVersionPath, 'utf8').then(updatingVersion => {
				updatingVersion = updatingVersion.trim();
				this.logService.info(`update#doCheckForUpdates - application was updating to version ${updatingVersion}`);
				this.getUpdatePackagePath(updatingVersion).then(updatePackagePath => {
					pfs.Promises.exists(updatePackagePath).then(exists => {
						if (exists) {
							this._applySpecificUpdate(updatePackagePath).then(async _ => {
								this.logService.info(`update#doCheckForUpdates - successfully applied update to version ${updatingVersion}`);
							});
						}
					});
				});
			}).catch(e => {
				this.logService.error(`update#doCheckForUpdates - could not read ${updatingVersionPath}`, e);
			}).finally(async () => {
				try {
					await fs.promises.unlink(updatingVersionPath);
				} catch { }
			});
			return;
		}

		const url = explicit ? this.url : `${this.url}?bg=true`;
		this.setState(State.CheckingForUpdates(explicit));

		this.requestService.request({ url }, CancellationToken.None)
			.then<IUpdate | null>(asJson)
			.then(update => {
				const updateType = getUpdateType();

				if (!update || !update.url || !update.version || !update.productVersion) {
					this.setState(State.Idle(updateType));
					return Promise.resolve(null);
				}

				if (updateType === UpdateType.Archive) {
					this.setState(State.AvailableForDownload(update));
					return Promise.resolve(null);
				}

				this.setState(State.Downloading);

				return this.cleanup(update.version).then(() => {
					return this.getUpdatePackagePath(update.version).then(updatePackagePath => {
						return pfs.Promises.exists(updatePackagePath).then(exists => {
							if (exists) {
								return Promise.resolve(updatePackagePath);
							}

							const downloadPath = `${updatePackagePath}.tmp`;

							return this.requestService.request({ url: update.url }, CancellationToken.None)
								.then(context => this.fileService.writeFile(URI.file(downloadPath), context.stream))
								.then(update.sha256hash ? () => checksum(downloadPath, update.sha256hash) : () => undefined)
								.then(() => pfs.Promises.rename(downloadPath, updatePackagePath, false /* no retry */))
								.then(() => updatePackagePath);
						});
					}).then(packagePath => {
						this.availableUpdate = { packagePath };
						this.setState(State.Downloaded(update));

						const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
						if (fastUpdatesEnabled) {
							if (this.productService.target === 'user') {
								this.doApplyUpdate();
							}
						} else {
							this.setState(State.Ready(update));
						}
					});
				});
			})
			.then(undefined, err => {
				this.telemetryService.publicLog2<{ messageHash: string }, UpdateErrorClassification>('update:error', { messageHash: String(hash(String(err))) });
				this.logService.error(err);

				// only show message when explicitly checking for updates
				const message: string | undefined = explicit ? (err.message || err) : undefined;
				this.setState(State.Idle(getUpdateType(), message));
			});
	}

	protected override async doDownloadUpdate(state: AvailableForDownload): Promise<void> {
		if (state.update.url) {
			this.nativeHostMainService.openExternal(undefined, state.update.url);
		}
		this.setState(State.Idle(getUpdateType()));
	}

	private async getUpdatePackagePath(version: string): Promise<string> {
		const cachePath = await this.nativeHostMainService.cachePath;
		return path.join(cachePath, `CodeSetup-${this.productService.quality}-${version}.exe`);
	}

	private async cleanupAppVersions(): Promise<void> {
		try {
			// 1) Use app.getPath('exe') to get the path to current executable file and store the basename of the exe file
			const exePath = app.getPath('exe');
			const exeBasename = path.basename(exePath);
			const exeBasenameWithoutExt = path.basename(exePath, '.exe');
			const appInstallPath = path.dirname(exePath);
			this.logService.trace(`update#cleanupAppVersions - exe path: ${exePath}, basename: ${exeBasename}, app install path: ${appInstallPath}`);

			// 2) Get current commit via this.productService.commit and store only first 10char in a variable
			const commitShort = this.productService.commit?.substring(0, 10);
			if (!commitShort) {
				this.logService.trace('update#cleanupAppVersions - no commit hash available, skipping cleanup');
				return;
			}
			this.logService.trace('update#cleanupAppVersions - commit short:', commitShort);

			// 3) If there is a file called `old_{exe basename}` in the app install folder then perform the following
			const oldExeFile = path.join(appInstallPath, `old_${exeBasename}`);
			const oldExeExists = await pfs.Promises.exists(oldExeFile);

			if (!oldExeExists) {
				this.logService.trace('update#cleanupAppVersions - old exe file does not exist, skipping cleanup');
				return;
			}

			this.logService.trace('update#cleanupAppVersions - old exe file found, performing cleanup');

			// 4) Delete all files and folders except for the following
			const entries = await pfs.Promises.readdir(appInstallPath, { withFileTypes: true });
			const entriesToRemove = new Set<string>();

			for (const entry of entries) {
				const entryPath = path.join(appInstallPath, entry.name);
				let shouldKeep = false;

				// a) current exe file
				if (entry.isFile() && entry.name === exeBasename) {
					shouldKeep = true;
				}
				// b) bin folder under app install directory (but clean old_ files inside it)
				else if (entry.isDirectory() && entry.name === 'bin') {
					shouldKeep = true;
					// Clean old_ files from bin folder
					try {
						const binEntries = await pfs.Promises.readdir(entryPath, { withFileTypes: true });
						for (const binEntry of binEntries) {
							if (binEntry.isFile() && binEntry.name.startsWith('old_')) {
								const binEntryPath = path.join(entryPath, binEntry.name);
								entriesToRemove.add(binEntryPath);
							}
						}
					} catch (err) {
						this.logService.warn('update#cleanupAppVersions - failed to read bin directory:', err);
					}
				}
				// c) {Exe basename}.VisualElementsManifest.xml
				else if (entry.isFile() && entry.name === `${exeBasenameWithoutExt}.VisualElementsManifest.xml`) {
					shouldKeep = true;
				}
				// d) unins*.* files
				else if (entry.isFile() && entry.name.startsWith('unins')) {
					shouldKeep = true;
				}
				// e) directory whose name matches the commit value from 4)
				else if (entry.isDirectory() && entry.name === commitShort) {
					shouldKeep = true;
				}

				if (!shouldKeep) {
					entriesToRemove.add(entryPath);
				}
			}

			// Remove collected entries
			for (const entryPath of entriesToRemove) {
				this.logService.trace('update#cleanupAppVersions - removing:', entryPath);
				try {
					await pfs.Promises.rm(entryPath, pfs.RimRafMode.MOVE);
					this.logService.trace('update#cleanupAppVersions - removed:', entryPath);
				} catch (err) {
					this.logService.warn('update#cleanupAppVersions - failed to remove:', entryPath, err);
				}
			}

			this.logService.info('update#cleanupAppVersions - cleanup of old versions completed successfully');
		} catch (error) {
			this.logService.error('update#cleanupAppVersions - cleanup of old versions failed:', error);
		}
	}

	private async cleanup(exceptVersion: string | null = null): Promise<void> {
		const filter = exceptVersion ? (one: string) => !(new RegExp(`${this.productService.quality}-${exceptVersion}\\.exe$`).test(one)) : () => true;

		const cachePath = await this.nativeHostMainService.cachePath;
		const versions = await pfs.Promises.readdir(cachePath);

		const promises = versions.filter(filter).map(async one => {
			try {
				await fs.promises.unlink(path.join(cachePath, one));
			} catch (err) {
				// ignore
			}
		});

		promises.push(this.cleanupAppVersions());

		await Promise.all(promises);
	}

	protected override async doApplyUpdate(): Promise<void> {
		if (this.state.type !== StateType.Downloaded) {
			return Promise.resolve(undefined);
		}

		if (!this.availableUpdate) {
			return Promise.resolve(undefined);
		}

		const update = this.state.update;
		this.setState(State.Updating(update));

		const cachePath = await this.nativeHostMainService.cachePath;
		const sessionEndFlagPath = path.join(cachePath, 'session-ending.flag');

		this.availableUpdate.updateFilePath = path.join(cachePath, `CodeSetup-${this.productService.quality}-${update.version}.flag`);

		await pfs.Promises.writeFile(this.availableUpdate.updateFilePath, 'flag');
		const child = spawn(this.availableUpdate.packagePath, ['/verysilent', '/log', `/update="${this.availableUpdate.updateFilePath}"`, `/sessionend="${sessionEndFlagPath}"`, '/nocloseapplications', '/mergetasks=runcode,!desktopicon,!quicklaunchicon'], {
			detached: true,
			stdio: ['ignore', 'ignore', 'ignore'],
			windowsVerbatimArguments: true
		});

		child.once('exit', () => {
			this.availableUpdate = undefined;
			this.setState(State.Idle(getUpdateType()));
		});

		const readyMutexName = `${this.productService.win32MutexName}-ready`;
		const mutex = await import('@vscode/windows-mutex');

		// poll for mutex-ready
		pollUntil(() => mutex.isActive(readyMutexName))
			.then(() => this.setState(State.Ready(update)));
	}

	protected override doQuitAndInstall(): void {
		if (this.state.type !== StateType.Ready || !this.availableUpdate) {
			return;
		}

		this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');

		if (this.availableUpdate.updateFilePath) {
			fs.unlinkSync(this.availableUpdate.updateFilePath);
		} else {
			spawn(this.availableUpdate.packagePath, ['/silent', '/log', '/mergetasks=runcode,!desktopicon,!quicklaunchicon'], {
				detached: true,
				stdio: ['ignore', 'ignore', 'ignore']
			});
		}
	}

	protected override getUpdateType(): UpdateType {
		return getUpdateType();
	}

	override async _applySpecificUpdate(packagePath: string): Promise<void> {
		if (this.state.type !== StateType.Idle) {
			return;
		}

		const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
		const update: IUpdate = { version: 'unknown', productVersion: 'unknown' };

		this.setState(State.Downloading);
		this.availableUpdate = { packagePath };
		this.setState(State.Downloaded(update));

		if (fastUpdatesEnabled) {
			if (this.productService.target === 'user') {
				this.doApplyUpdate();
			}
		} else {
			this.setState(State.Ready(update));
		}
	}
}
