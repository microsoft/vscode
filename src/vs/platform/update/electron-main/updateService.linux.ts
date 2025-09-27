/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as electron from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { memoize } from '../../../base/common/decorators.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IFileService } from '../../files/common/files.js';
import { ILifecycleMainService, IRelaunchHandler, IRelaunchOptions } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, IRequestService } from '../../request/common/request.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { URI } from '../../../base/common/uri.js';
import { checksum } from '../../../base/node/crypto.js';
import { AvailableForDownload, IUpdate, State, StateType, UpdateType } from '../common/update.js';
import { AbstractUpdateService } from './abstractUpdateService.js';

const fsp = fs.promises;

interface IAppImageUpdate {
	readonly packagePath: string;
	readonly version: string;
	readonly canReplaceInPlace: boolean;
}

export class LinuxUpdateService extends AbstractUpdateService implements IRelaunchHandler {

	private availableUpdate: IAppImageUpdate | undefined;
	private applyOnQuit = false;

	@memoize
	private get cacheDir(): Promise<string> {
		const cachePath = path.join(tmpdir(), `erdos-${this.productService.quality}-linux-${process.arch}`);
		return fsp.mkdir(cachePath, { recursive: true }).then(() => cachePath);
	}

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@IProductService productService: IProductService,
		@IFileService private readonly fileService: IFileService
	) {
		super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService);

		lifecycleMainService.setRelaunchHandler(this);
		lifecycleMainService.onWillShutdown(event => {
			const joined = this.scheduleApplyOnQuit();
			if (joined) {
				event.join('linux-update-apply', joined);
			}
		});
	}

	handleRelaunch(options?: IRelaunchOptions): boolean {
		if (options?.addArgs || options?.removeArgs) {
			return false;
		}

		if (this.state.type !== StateType.Ready || !this.availableUpdate) {
			return false;
		}

		this.logService.trace('update#handleRelaunch(): running Linux quitAndInstall');
		this.doQuitAndInstall();

		return true;
	}

	protected override async initialize(): Promise<void> {
		await super.initialize();
	}

	protected buildUpdateFeedUrl(quality: string): string | undefined {
		const baseUrl = this.productService.updateUrl;
		if (!baseUrl) {
			return undefined;
		}

		const platformSegment = `linux-${process.arch}-appimage`;
		const feedUrl = `${baseUrl}/api/update/${platformSegment}/${quality}/latest.json`;
		this.logService.info('LinuxUpdateService: update feed URL', feedUrl);
		return feedUrl;
	}

	protected doCheckForUpdates(explicit: boolean): void {
		if (!this.url) {
			return;
		}

		const requestUrl = explicit ? this.url : `${this.url}?bg=true`;
		this.setState(State.CheckingForUpdates(explicit));

		this.requestService.request({ url: requestUrl }, CancellationToken.None)
			.then(asJson)
			.then(update => this.onUpdateManifest(update as Partial<IUpdate> | undefined))
			.catch(error => {
				this.logService.error('LinuxUpdateService: failed to check for updates', error);
				const message = explicit ? String(error) : undefined;
				this.setState(State.Idle(UpdateType.Archive, message));
			});
	}

	private async onUpdateManifest(update: Partial<IUpdate> | undefined): Promise<void> {
		if (!update || !update.url) {
			this.setState(State.Idle(UpdateType.Archive));
			return;
		}

		const remoteProductVersion = (update.productVersion ?? update.version)?.trim();
		if (!remoteProductVersion) {
			this.logService.info('LinuxUpdateService: manifest missing productVersion, skipping');
			this.setState(State.Idle(UpdateType.Archive));
			return;
		}

		const currentVersion = this.getCurrentErdosVersion().trim();
		if (this.compareVersions(remoteProductVersion, currentVersion) <= 0) {
			this.logService.info('LinuxUpdateService: already at latest version');
			this.setState(State.Idle(UpdateType.Archive));
			return;
		}

		const sanitizedVersion = this.sanitizeVersion(remoteProductVersion);
		const updatePayload: IUpdate = {
			...update,
			version: sanitizedVersion,
			productVersion: remoteProductVersion
		};

		this.availableUpdate = undefined;
		await this.startDownload(updatePayload);
	}

	protected override async doDownloadUpdate(state: AvailableForDownload): Promise<void> {
		await this.startDownload(state.update);
	}

	protected override async doApplyUpdate(): Promise<void> {
		if (this.state.type !== StateType.Downloaded || !this.availableUpdate) {
			return;
		}

		this.setState(State.Ready(this.state.update));
	}

	protected override doQuitAndInstall(): void {
		if (this.state.type !== StateType.Ready || !this.availableUpdate) {
			return;
		}

		const updatePath = this.availableUpdate.packagePath;
		const currentAppImage = process.env['APPIMAGE'];

		if (this.availableUpdate.canReplaceInPlace && currentAppImage) {
			this.logService.info('LinuxUpdateService: replacing current AppImage in place');
			try {
				this.replaceCurrentAppImageSync(updatePath, currentAppImage);
			} catch (error) {
				this.logService.error('LinuxUpdateService: in-place replacement failed, falling back to launching new image', error);
				this.launchDetached(updatePath);
				this.availableUpdate = undefined;
				this.applyOnQuit = false;
				return;
			}

			this.launchDetached(currentAppImage);
			this.availableUpdate = undefined;
			this.applyOnQuit = false;
			return;
		}

		this.launchDetached(updatePath);
		this.availableUpdate = undefined;
		this.applyOnQuit = false;
	}

	private launchDetached(executablePath: string): void {
		try {
			spawn(executablePath, [], { detached: true, stdio: 'ignore' });
		} catch (error) {
			this.logService.error('LinuxUpdateService: failed to launch AppImage', error);
		}
	}

	protected override getUpdateType(): UpdateType {
		return UpdateType.Archive;
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
			this.logService.error('LinuxUpdateService: isLatestVersion failed', error);
			return undefined;
		}
	}

	private sanitizeVersion(version: string | undefined): string {
		const value = version?.trim() ?? '';
		return value.replace(/[^0-9A-Za-z.-]/g, '-');
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

	private async cleanupCache(cacheDir: string, keep: string): Promise<void> {
		const entries = await fsp.readdir(cacheDir);
		await Promise.all(entries.map(async entry => {
			if (entry === keep || !entry.endsWith('.AppImage')) {
				return;
			}

			try {
				await fsp.unlink(path.join(cacheDir, entry));
			} catch (error) {
				if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
					throw error;
				}
			}
		}));
	}

	private async startDownload(update: IUpdate): Promise<void> {
		this.setState(State.Downloading);
		await this.downloadAndPrepare(update);
	}

	private async downloadAndPrepare(update: IUpdate): Promise<void> {
		const cacheDir = await this.cacheDir;
		const targetName = `Erdos-${update.version}.AppImage`;
		const targetPath = path.join(cacheDir, targetName);
		const tempPath = `${targetPath}.download`;

		try {
			if (!update.url) {
				throw new Error('Update manifest is missing a download URL.');
			}
			const request = await this.requestService.request({ url: update.url }, CancellationToken.None);
			await this.fileService.writeFile(URI.file(tempPath), request.stream);

			if (update.sha256hash) {
				await checksum(tempPath, update.sha256hash);
			} else {
				this.logService.warn('LinuxUpdateService: manifest missing sha256hash; skipping verification');
			}

			await fsp.chmod(tempPath, 0o755);
			await fsp.rename(tempPath, targetPath);
			await this.cleanupCache(cacheDir, targetName).catch(error => this.logService.warn('LinuxUpdateService: cleanup failed', error));

			const canReplaceResult = await this.canReplaceCurrentAppImage();
			const manualInstructions = canReplaceResult.supported ? undefined : this.buildManualInstructions(targetPath, canReplaceResult.reason);
			const enrichedUpdate = manualInstructions ? { ...update, manualInstructions } : update;

			this.availableUpdate = { packagePath: targetPath, version: update.version, canReplaceInPlace: canReplaceResult.supported };
			this.applyOnQuit = canReplaceResult.supported;

			this.setState(State.Downloaded(enrichedUpdate));

			type UpdateDownloadedClassification = {
				owner: 'joaomoreno';
				newVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version number of the new VS Code that has been downloaded.' };
				comment: 'This is used to know how often VS Code updates have successfully downloaded the update.';
			};
			this.telemetryService.publicLog2<{ newVersion: String }, UpdateDownloadedClassification>('update:downloaded', { newVersion: update.productVersion ?? update.version ?? '' });

			this.setState(State.Ready(enrichedUpdate));
		} catch (error) {
			this.logService.error('LinuxUpdateService: failed to download AppImage', error);
			try {
				await fsp.unlink(tempPath);
			} catch (unlinkError) {
				if ((unlinkError as NodeJS.ErrnoException)?.code !== 'ENOENT') {
					this.logService.warn('LinuxUpdateService: failed to remove temp download', unlinkError);
				}
			}
			this.availableUpdate = undefined;
			this.applyOnQuit = false;
			this.setState(State.Idle(UpdateType.Archive));
		}
	}

	private async canReplaceCurrentAppImage(): Promise<{ supported: boolean; reason?: string }> {
		const currentAppImage = process.env['APPIMAGE'];
		if (!currentAppImage) {
			return { supported: false, reason: 'not-running-appimage' };
		}

		try {
			await fsp.access(currentAppImage, fs.constants.W_OK);
			return { supported: true };
		} catch (error) {
			this.logService.warn('LinuxUpdateService: current AppImage is not writable', error);
			return { supported: false, reason: 'not-writable' };
		}
	}

	private buildManualInstructions(targetPath: string, reason?: string): string {
		const explanation = reason === 'not-writable'
			? 'The running AppImage is not writable, so Erdos cannot update itself in place.'
			: 'Erdos is not running from an AppImage executable, so automatic replacement is unavailable.';
		return `${explanation}\n\nWe have saved the new version at ${targetPath}. Launch Erdos from that file or replace your existing AppImage manually.`;
	}

	private scheduleApplyOnQuit(): Promise<void> | undefined {
		if (!this.applyOnQuit || !this.availableUpdate) {
			return undefined;
		}

		const currentAppImage = process.env['APPIMAGE'];
		if (!currentAppImage) {
			return undefined;
		}

		const updatePath = this.availableUpdate.packagePath;
		this.logService.info('LinuxUpdateService: scheduling in-place AppImage replacement on shutdown');
		return (async () => {
			try {
				await this.replaceCurrentAppImage(updatePath, currentAppImage);
				this.logService.info('LinuxUpdateService: AppImage replacement completed during shutdown');
			} catch (error) {
				this.logService.error('LinuxUpdateService: failed to replace AppImage during shutdown', error);
				electron.dialog.showErrorBox('Erdos Update', `Erdos could not replace the running AppImage automatically.\n\nSaved update: ${updatePath}\nExisting AppImage: ${currentAppImage}\n\nPlease replace the file manually and try again.`);
			} finally {
				this.applyOnQuit = false;
				this.availableUpdate = undefined;
			}
		})();
	}

	private replaceCurrentAppImageSync(source: string, target: string): void {
		const backup = `${target}.bak`;
		this.removeIfExistsSync(backup);
		fs.renameSync(target, backup);
		try {
			fs.copyFileSync(source, target);
			fs.chmodSync(target, 0o755);
			this.removeIfExistsSync(backup);
		} catch (error) {
			try {
				fs.renameSync(backup, target);
			} catch (restoreError) {
				this.logService.error('LinuxUpdateService: failed to restore AppImage after replacement error', restoreError);
			}
			throw error;
		}
	}

	private async replaceCurrentAppImage(source: string, target: string): Promise<void> {
		const backup = `${target}.bak`;
		await this.removeIfExists(backup);
		await fsp.rename(target, backup);
		try {
			await fsp.copyFile(source, target);
			await fsp.chmod(target, 0o755);
			await this.removeIfExists(backup);
		} catch (error) {
			try {
				await fsp.rename(backup, target);
			} catch (restoreError) {
				this.logService.error('LinuxUpdateService: failed to restore AppImage after replacement error', restoreError);
			}
			throw error;
		}
	}

	private removeIfExistsSync(filePath: string): void {
		try {
			fs.unlinkSync(filePath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
				throw error;
			}
		}
	}

	private async removeIfExists(filePath: string): Promise<void> {
		try {
			await fsp.unlink(filePath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
				throw error;
			}
		}
	}
}
