/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { mkdir, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { app } from 'electron';
import { timeout } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { memoize } from '../../../base/common/decorators.js';
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
		_updateType = existsSync(path.join(path.dirname(process.execPath), 'unins000.exe'))
			? UpdateType.Setup
			: UpdateType.Archive;
	}

	return _updateType;
}

export class Win32UpdateService extends AbstractUpdateService implements IRelaunchHandler {

	private availableUpdate: IAvailableUpdate | undefined;

	@memoize
	get cachePath(): Promise<string> {
		const result = path.join(tmpdir(), `vscode-${this.productService.quality}-${this.productService.target}-${process.arch}`);
		return mkdir(result, { recursive: true }).then(() => result);
	}

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

		const cachePath = await this.cachePath;
		app.setPath('appUpdate', cachePath);
		try {
			await unlink(path.join(cachePath, 'session-ending.flag'));
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
		const exeDir = path.dirname(exePath);
		const updatingVersionPath = path.join(exeDir, 'updating_version');
		if (existsSync(updatingVersionPath)) {
			readFile(updatingVersionPath, 'utf8').then(updatingVersion => {
				updatingVersion = updatingVersion.trim();
				this.logService.info(`update#doCheckForUpdates - application was updating to version ${updatingVersion}`);
				// NB: the following promises are not connected to the parent since
				// we don't care about the result of update from this path and unlink the updating_version
				// to only run this path once. Any error in the update flow will be fixed in the next update check.
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
					await unlink(updatingVersionPath);
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
		const cachePath = await this.cachePath;
		return path.join(cachePath, `CodeSetup-${this.productService.quality}-${version}.exe`);
	}

	private async cleanup(exceptVersion: string | null = null): Promise<void> {
		const filter = exceptVersion ? (one: string) => !(new RegExp(`${this.productService.quality}-${exceptVersion}\\.exe$`).test(one)) : () => true;

		const cachePath = await this.cachePath;
		const versions = await pfs.Promises.readdir(cachePath);

		const promises = versions.filter(filter).map(async one => {
			try {
				await unlink(path.join(cachePath, one));
			} catch (err) {
				// ignore
			}
		});

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

		const cachePath = await this.cachePath;
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
			unlinkSync(this.availableUpdate.updateFilePath);
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
