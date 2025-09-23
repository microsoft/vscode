/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import * as fs from 'fs';
import { tmpdir } from 'os';
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
import { AbstractUpdateService, UpdateErrorClassification } from './abstractUpdateService.js';

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

	@memoize
	get cachePath(): Promise<string> {
		const result = path.join(tmpdir(), `erdos-${this.productService.quality}-${this.productService.target}-${process.arch}`);
		return fs.promises.mkdir(result, { recursive: true }).then(() => result);
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

	private get setupBaseName(): string {
		const raw = this.productService.nameShort ?? 'Erdos';
		return `${raw.replace(/\s+/g, '')}Setup`;
	}

	private get platformSegment(): string {
		return `win32-${process.arch}`;
	}

	private get qualitySegment(): string {
		return this.productService.quality ? `${this.productService.quality}-` : '';
	}

	handleRelaunch(options?: IRelaunchOptions): boolean {
		if (options?.addArgs || options?.removeArgs) {
			return false;
		}

		if (this.state.type !== StateType.Ready || !this.availableUpdate) {
			return false;
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

		await super.initialize();
	}

	protected buildUpdateFeedUrl(quality: string): string | undefined {
		let platform = `win32-${process.arch}`;

		if (getUpdateType() === UpdateType.Archive) {
			platform += '-archive';
		} else if (this.productService.target === 'user') {
			platform += '-user';
		}

		return `${this.productService.updateUrl}/api/update/${platform}/${quality}/latest.json`;
	}

	protected doCheckForUpdates(explicit: boolean): void {
		if (!this.url) {
			return;
		}

		const url = explicit ? this.url : `${this.url}?bg=true`;
		this.setState(State.CheckingForUpdates(explicit));

		this.requestService.request({ url }, CancellationToken.None)
			.then<IUpdate | null>(asJson)
			.then(update => {
				const updateType = getUpdateType();
				if (!update || !update.url) {
					this.setState(State.Idle(updateType));
					return Promise.resolve(null);
				}

				const remoteProductVersion = (update.productVersion ?? update.version)?.trim();
				if (!remoteProductVersion) {
					this.logService.info('update#doCheckForUpdates - manifest missing productVersion, skipping.');
					this.setState(State.Idle(updateType));
					return Promise.resolve(null);
				}

				const currentVersion = this.getCurrentErdosVersion().trim();
				if (this.compareVersions(remoteProductVersion, currentVersion) <= 0) {
					this.logService.info('update#doCheckForUpdates - already at latest version, skipping download.');
					this.setState(State.Idle(updateType));
					return Promise.resolve(null);
				}

				const sanitizedVersion = this.sanitizeVersion(remoteProductVersion);
				const updatePayload: IUpdate = {
					...update,
					version: sanitizedVersion,
					productVersion: remoteProductVersion
				};

				if (updateType === UpdateType.Archive) {
					this.setState(State.AvailableForDownload(updatePayload));
					return Promise.resolve(null);
				}

				this.setState(State.Downloading);

				return this.cleanup(sanitizedVersion).then(() => {
					return this.getUpdatePackagePath(sanitizedVersion).then(updatePackagePath => {
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
						this.setState(State.Downloaded(updatePayload));

						const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
						if (fastUpdatesEnabled) {
							if (this.productService.target === 'user') {
								this.doApplyUpdate();
							}
						} else {
							this.setState(State.Ready(updatePayload));
						}
					});
				});
			})
			.then(undefined, err => {
				this.telemetryService.publicLog2<{ messageHash: string }, UpdateErrorClassification>('update:error', { messageHash: String(hash(String(err))) });
				this.logService.error(err);

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
		const file = `${this.setupBaseName}-${this.qualitySegment}${version}-${this.platformSegment}.exe`;
		return path.join(cachePath, file);
	}

	private async cleanup(exceptVersion: string | null = null): Promise<void> {
		const cachePath = await this.cachePath;
		const entries = await pfs.Promises.readdir(cachePath);
		const keepName = exceptVersion ? `${this.setupBaseName}-${this.qualitySegment}${exceptVersion}-${this.platformSegment}.exe` : undefined;

		await Promise.all(entries.map(async entry => {
			const isExecutable = entry.endsWith('.exe');
			const isFlag = entry.endsWith('.flag');
			if (!isExecutable && !isFlag) {
				return;
			}
			if (isExecutable && keepName && entry === keepName) {
				return;
			}

			try {
				await fs.promises.unlink(path.join(cachePath, entry));
			} catch (error) {
				// ignore
			}
		}));
	}

	protected override async doApplyUpdate(): Promise<void> {
		if (this.state.type !== StateType.Downloaded || !this.availableUpdate) {
			return;
		}

		const update = this.state.update;
		this.setState(State.Updating(update));

		const cachePath = await this.cachePath;
		const flagPath = path.join(cachePath, `${this.setupBaseName}-${this.qualitySegment}${update.version}-${this.platformSegment}.flag`);
		this.availableUpdate.updateFilePath = flagPath;

		await pfs.Promises.writeFile(flagPath, 'flag');
		const child = spawn(this.availableUpdate.packagePath, ['/verysilent', '/log', `/update="${flagPath}"`, '/nocloseapplications', '/mergetasks=runcode,!desktopicon,!quicklaunchicon'], {
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

		pollUntil(() => mutex.isActive(readyMutexName))
			.then(() => this.setState(State.Ready(update)));
	}

	protected override doQuitAndInstall(): void {
		if (this.state.type !== StateType.Ready || !this.availableUpdate) {
			return;
		}

		this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');

		if (this.availableUpdate.updateFilePath) {
			try {
				fs.unlinkSync(this.availableUpdate.updateFilePath);
			} catch (error) {
				this.logService.warn('update#doQuitAndInstall - failed to remove flag file', error);
			}
		} else {
			spawn(this.availableUpdate.packagePath, ['/silent', '/log', '/mergetasks=runcode,!desktopicon,!quicklaunchicon'], {
				detached: true,
				stdio: ['ignore', 'ignore', 'ignore']
			});
		}
	}

	private sanitizeVersion(version: string): string {
		const trimmed = version.trim();
		return trimmed.replace(/[^0-9A-Za-z.-]/g, '-');
	}

	private compareVersions(a: string, b: string): number {
		const aParts = this.parseVersion(a);
		const bParts = this.parseVersion(b);
		const length = Math.max(aParts.length, bParts.length);

		for (let i = 0; i < length; i++) {
			const aValue = i < aParts.length ? aParts[i] : 0;
			const bValue = i < bParts.length ? bParts[i] : 0;

			if (aValue > bValue) {
				return 1;
			}

			if (aValue < bValue) {
				return -1;
			}
		}

		return 0;
	}

	private parseVersion(version: string): number[] {
		return version
			.split('.')
			.map(part => {
				const match = part.match(/\d+/);
				return match ? Number.parseInt(match[0], 10) : 0;
			});
	}

	protected override getUpdateType(): UpdateType {
		return getUpdateType();
	}

	public override async isLatestVersion(): Promise<boolean | undefined> {
		if (!this.url) {
			return undefined;
		}

		try {
			const context = await this.requestService.request({ url: this.url }, CancellationToken.None);
			const update = await asJson(context) as Partial<IUpdate> | undefined;
			const remoteVersion = (update?.productVersion ?? update?.version)?.trim();
			if (!remoteVersion) {
				return undefined;
			}

			const currentVersion = this.getCurrentErdosVersion().trim();
			return this.compareVersions(remoteVersion, currentVersion) <= 0;
		} catch (error) {
			this.logService.error('update#isLatestVersion(): failed to check for updates', error);
			return undefined;
		}
	}

	override async _applySpecificUpdate(packagePath: string): Promise<void> {
		if (this.state.type !== StateType.Idle) {
			return;
		}

		const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
		const update: IUpdate = { version: 'unknown', productVersion: this.productService.erdosVersion ?? 'unknown' };

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
