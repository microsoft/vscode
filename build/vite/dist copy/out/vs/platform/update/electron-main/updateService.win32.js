/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { spawn } from 'child_process';
import { app } from 'electron';
import { existsSync, unlinkSync } from 'fs';
import { mkdir, readFile, unlink } from 'fs/promises';
import { release, tmpdir } from 'os';
import { Delayer, ProcessTimeRunOnceScheduler, timeout } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { memoize } from '../../../base/common/decorators.js';
import { hash } from '../../../base/common/hash.js';
import * as path from '../../../base/common/path.js';
import { basename } from '../../../base/common/path.js';
import { transform } from '../../../base/common/stream.js';
import { URI } from '../../../base/common/uri.js';
import { checksum } from '../../../base/node/crypto.js';
import * as pfs from '../../../base/node/pfs.js';
import { killTree } from '../../../base/node/processes.js';
import { getWindowsRelease } from '../../../base/node/windowsVersion.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IFileService } from '../../files/common/files.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IMeteredConnectionService } from '../../meteredConnection/common/meteredConnection.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, IRequestService } from '../../request/common/request.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { State } from '../common/update.js';
import { AbstractUpdateService, createUpdateURL, getUpdateRequestHeaders } from './abstractUpdateService.js';
let _updateType = undefined;
function getUpdateType() {
    if (typeof _updateType === 'undefined') {
        _updateType = existsSync(path.join(path.dirname(process.execPath), 'unins000.exe'))
            ? 0 /* UpdateType.Setup */
            : 1 /* UpdateType.Archive */;
    }
    return _updateType;
}
let Win32UpdateService = class Win32UpdateService extends AbstractUpdateService {
    get cachePath() {
        const result = path.join(tmpdir(), `vscode-${this.productService.quality}-${this.productService.target}-${process.arch}`);
        return mkdir(result, { recursive: true }).then(() => result);
    }
    constructor(lifecycleMainService, configurationService, telemetryService, environmentMainService, requestService, logService, fileService, nativeHostMainService, productService, applicationStorageMainService, meteredConnectionService) {
        super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService, telemetryService, applicationStorageMainService, meteredConnectionService, true);
        this.fileService = fileService;
        this.nativeHostMainService = nativeHostMainService;
        lifecycleMainService.setRelaunchHandler(this);
    }
    handleRelaunch(options) {
        if (options?.addArgs || options?.removeArgs) {
            return false; // we cannot apply an update and restart with different args
        }
        if (this.state.type !== "ready" /* StateType.Ready */ || !this.availableUpdate) {
            return false; // we only handle the relaunch when we have a pending update
        }
        this.logService.trace('update#handleRelaunch(): running raw#quitAndInstall()');
        this.doQuitAndInstall();
        return true;
    }
    async initialize() {
        // In the embedded app, skip win32-specific setup (cache paths, telemetry)
        // but still run the base initialization to detect available updates.
        if (process.isEmbeddedApp) {
            this.logService.info('update#ctor - embedded app: checking for updates without auto-download');
            await super.initialize();
            return;
        }
        if (this.productService.win32VersionedUpdate) {
            const cachePath = await this.cachePath;
            app.setPath('appUpdate', cachePath);
            await this.unlink(path.join(cachePath, 'session-ending.flag'));
        }
        const osRelease = await getWindowsRelease();
        const osNodeRelease = release();
        this.telemetryService.publicLog2('windowsUpdateInit', { osRelease, osNodeRelease });
        if (this.productService.target === 'user' && await this.nativeHostMainService.isAdmin(undefined)) {
            this.setState(State.Disabled(6 /* DisablementReason.RunningAsAdmin */));
            this.logService.info('update#ctor - updates are disabled due to running as Admin in user setup');
            return;
        }
        await super.initialize();
    }
    async postInitialize() {
        if (!this.productService.win32VersionedUpdate) {
            return;
        }
        // Check for pending update from previous session
        // This can happen if the app is quit right after the update has been
        // downloaded and before the update has been applied.
        const exePath = app.getPath('exe');
        const exeDir = path.dirname(exePath);
        const updatingVersionPath = path.join(exeDir, 'updating_version');
        if (await pfs.Promises.exists(updatingVersionPath)) {
            try {
                const updatingVersion = (await readFile(updatingVersionPath, 'utf8')).trim();
                this.logService.info(`update#doCheckForUpdates - application was updating to version ${updatingVersion}`);
                const updatePackagePath = await this.getUpdatePackagePath(updatingVersion);
                if (await pfs.Promises.exists(updatePackagePath)) {
                    await this._applySpecificUpdate(updatePackagePath);
                    this.logService.info(`update#doCheckForUpdates - successfully applied update to version ${updatingVersion}`);
                }
            }
            catch (e) {
                this.logService.error(`update#doCheckForUpdates - could not read ${updatingVersionPath}`, e);
            }
            finally {
                // updatingVersionPath will be deleted by inno setup.
            }
        }
        else {
            const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
            // GC for background updates in system setup happens via inno_setup since it requires
            // elevated permissions.
            if (fastUpdatesEnabled && this.productService.target === 'user' && this.productService.commit) {
                const versionedResourcesFolder = this.productService.commit.substring(0, 10);
                const innoUpdater = path.join(exeDir, versionedResourcesFolder, 'tools', 'inno_updater.exe');
                const exeName = basename(exePath);
                const siblingExeName = this.productService.win32SiblingExeBasename ? `${this.productService.win32SiblingExeBasename}.exe` : '';
                await new Promise(resolve => {
                    const child = spawn(innoUpdater, ['--gc', exePath, versionedResourcesFolder, exeName, siblingExeName], {
                        stdio: ['ignore', 'ignore', 'ignore'],
                        windowsHide: true,
                        timeout: 2 * 60 * 1000
                    });
                    child.once('exit', () => resolve());
                });
            }
        }
    }
    buildUpdateFeedUrl(quality, commit, options) {
        let platform = `win32-${process.arch}`;
        if (getUpdateType() === 1 /* UpdateType.Archive */) {
            platform += '-archive';
        }
        else if (this.productService.target === 'user') {
            platform += '-user';
        }
        return createUpdateURL(this.productService.updateUrl, platform, quality, commit, options);
    }
    doCheckForUpdates(explicit, pendingCommit) {
        if (!this.quality) {
            return;
        }
        const internalOrg = this.getInternalOrg();
        const background = !explicit && !internalOrg;
        const url = this.buildUpdateFeedUrl(this.quality, pendingCommit ?? this.productService.commit, { background, internalOrg });
        // Only set CheckingForUpdates if we're not already in Overwriting state
        if (this.state.type !== "overwriting" /* StateType.Overwriting */) {
            this.setState(State.CheckingForUpdates(explicit));
        }
        const headers = getUpdateRequestHeaders(this.productService.version);
        this.requestService.request({ url, headers, callSite: 'updateService.win32.checkForUpdates' }, CancellationToken.None)
            .then(asJson)
            .then(update => {
            const updateType = getUpdateType();
            if (!update || !update.url || !update.version || !update.productVersion) {
                // If we were checking for an overwrite update and found nothing newer,
                // restore the Ready state with the pending update
                if (this.state.type === "overwriting" /* StateType.Overwriting */) {
                    this._overwrite = false;
                    this.setState(State.Ready(this.state.update, this.state.explicit, false));
                }
                else {
                    this.setState(State.Idle(updateType, undefined, explicit || undefined));
                }
                return Promise.resolve(null);
            }
            if (updateType === 1 /* UpdateType.Archive */) {
                this.setState(State.AvailableForDownload(update));
                return Promise.resolve(null);
            }
            // In the embedded app, signal that an update exists but can't be installed here.
            if (process.isEmbeddedApp) {
                this.logService.info('update#doCheckForUpdates - embedded app: update available, skipping download');
                this.setState(State.AvailableForDownload(update, /* canInstall */ false));
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
                        return this.requestService.request({ url: update.url, callSite: 'updateService.win32.downloadUpdate' }, CancellationToken.None)
                            .then(context => {
                            // Get total size from Content-Length header
                            const contentLengthHeader = context.res.headers['content-length'];
                            const contentLength = typeof contentLengthHeader === 'string' ? contentLengthHeader : undefined;
                            const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;
                            // Track downloaded bytes and update state periodically using Delayer
                            let downloadedBytes = 0;
                            const progressDelayer = new Delayer(500);
                            const progressStream = transform(context.stream, {
                                data: data => {
                                    downloadedBytes += data.byteLength;
                                    progressDelayer.trigger(() => {
                                        this.setState(State.Downloading(update, explicit, this._overwrite, downloadedBytes, totalBytes, startTime));
                                    });
                                    return data;
                                }
                            }, chunks => VSBuffer.concat(chunks));
                            return this.fileService.writeFile(URI.file(downloadPath), progressStream)
                                .finally(() => progressDelayer.dispose());
                        })
                            .then(update.sha256hash ? () => checksum(downloadPath, update.sha256hash) : () => undefined)
                            .then(() => pfs.Promises.rename(downloadPath, updatePackagePath, false /* no retry */))
                            .then(() => updatePackagePath);
                    });
                }).then(packagePath => {
                    this.availableUpdate = { packagePath };
                    this.saveUpdateMetadata(update);
                    this.setState(State.Downloaded(update, explicit, this._overwrite));
                    const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
                    if (fastUpdatesEnabled && this.productService.target === 'user') {
                        this.doApplyUpdate();
                    }
                    else {
                        this.setState(State.Ready(update, explicit, this._overwrite));
                    }
                });
            });
        })
            .then(undefined, err => {
            this.telemetryService.publicLog2('update:error', { messageHash: String(hash(String(err))) });
            this.logService.error(err);
            // only show message when explicitly checking for updates
            const message = explicit ? (err.message || err) : undefined;
            // If we were checking for an overwrite update and it failed,
            // restore the Ready state with the pending update
            if (this.state.type === "overwriting" /* StateType.Overwriting */) {
                this._overwrite = false;
                this.setState(State.Ready(this.state.update, this.state.explicit, false));
            }
            else {
                this.setState(State.Idle(getUpdateType(), message));
            }
        });
    }
    async doDownloadUpdate(state) {
        if (state.update.url) {
            this.nativeHostMainService.openExternal(undefined, state.update.url);
        }
        this.setState(State.Idle(getUpdateType()));
    }
    async getUpdatePackagePath(version) {
        const cachePath = await this.cachePath;
        return path.join(cachePath, `CodeSetup-${this.productService.quality}-${version}.exe`);
    }
    async cleanup(exceptVersion = null) {
        const filter = exceptVersion ? (one) => !(new RegExp(`${this.productService.quality}-${exceptVersion}\\.exe$`).test(one)) : () => true;
        const cachePath = await this.cachePath;
        const versions = await pfs.Promises.readdir(cachePath);
        const promises = versions.filter(filter).map(one => this.unlink(path.join(cachePath, one)));
        await Promise.all(promises);
    }
    async doApplyUpdate() {
        if (this.state.type !== "downloaded" /* StateType.Downloaded */) {
            return Promise.resolve(undefined);
        }
        if (!this.availableUpdate) {
            return Promise.resolve(undefined);
        }
        const update = this.state.update;
        const explicit = this.state.explicit;
        this.setState(State.Updating(update, explicit));
        const cachePath = await this.cachePath;
        const sessionEndFlagPath = path.join(cachePath, 'session-ending.flag');
        const cancelFilePath = path.join(cachePath, `cancel.flag`);
        await this.unlink(cancelFilePath);
        const progressFilePath = path.join(cachePath, `update-progress`);
        await this.unlink(progressFilePath);
        this.availableUpdate.updateFilePath = path.join(cachePath, `CodeSetup-${this.productService.quality}-${update.version}.flag`);
        this.availableUpdate.cancelFilePath = cancelFilePath;
        await pfs.Promises.writeFile(this.availableUpdate.updateFilePath, 'flag');
        const child = spawn(this.availableUpdate.packagePath, [
            '/verysilent',
            '/log',
            `/update="${this.availableUpdate.updateFilePath}"`,
            `/progress="${progressFilePath}"`,
            `/sessionend="${sessionEndFlagPath}"`,
            `/cancel="${cancelFilePath}"`,
            '/nocloseapplications',
            '/mergetasks=runcode,!desktopicon,!quicklaunchicon'
        ], {
            detached: true,
            stdio: ['ignore', 'ignore', 'ignore'],
            windowsVerbatimArguments: true,
            env: { ...process.env, __COMPAT_LAYER: 'RunAsInvoker' }
        });
        // Track the process so we can cancel it if needed
        this.availableUpdate.updateProcess = child;
        child.once('exit', () => {
            this.availableUpdate = undefined;
            this.setState(State.Idle(getUpdateType()));
        });
        const readyMutexName = `${this.productService.win32MutexName}-ready`;
        const mutex = await import('@vscode/windows-mutex');
        this.updateCancellationTokenSource?.dispose(true);
        const cts = this.updateCancellationTokenSource = new CancellationTokenSource();
        const token = cts.token;
        const poll = async () => {
            while (this.state.type === "updating" /* StateType.Updating */ && !token.isCancellationRequested) {
                if (mutex.isActive(readyMutexName)) {
                    this.setState(State.Ready(update, explicit, this._overwrite));
                    return;
                }
                try {
                    const progressContent = await readFile(progressFilePath, 'utf8');
                    if (!token.isCancellationRequested) {
                        const [currentStr, maxStr] = progressContent.split(',');
                        const currentProgress = parseInt(currentStr, 10);
                        const maxProgress = parseInt(maxStr, 10);
                        if (!isNaN(currentProgress) && !isNaN(maxProgress) && this.state.type === "updating" /* StateType.Updating */) {
                            if (this.state.currentProgress !== currentProgress || this.state.maxProgress !== maxProgress) {
                                this.setState(State.Updating(update, explicit, currentProgress, maxProgress));
                            }
                        }
                    }
                }
                catch {
                    // Progress file may not exist yet or be locked, ignore
                }
                await timeout(500);
            }
        };
        const cancelTimeout = new ProcessTimeRunOnceScheduler(() => {
            this.logService.warn('update#doApplyUpdate: polling timed out waiting for update to be ready');
            this.setState(State.Idle(getUpdateType(), 'Update did not complete within expected time'));
        }, 60 * 60 * 1000);
        // Poll for progress and ready mutex for 1 hour.
        cancelTimeout.schedule();
        poll().finally(() => {
            cancelTimeout.dispose();
            if (this.updateCancellationTokenSource === cts) {
                this.updateCancellationTokenSource = undefined;
            }
            cts.dispose();
        });
    }
    async cancelPendingUpdate() {
        if (!this.availableUpdate) {
            return;
        }
        // Cancel the polling loop
        this.updateCancellationTokenSource?.dispose(true);
        this.updateCancellationTokenSource = undefined;
        this.logService.trace('update#cancelPendingUpdate: cancelling pending update');
        const { updateProcess, updateFilePath, cancelFilePath } = this.availableUpdate;
        if (updateProcess && updateProcess.exitCode === null) {
            // Remove all listeners to prevent the exit handler from changing state
            updateProcess.removeAllListeners();
            const exitPromise = new Promise(resolve => updateProcess.once('exit', () => resolve(true)));
            // Write the cancel file to signal Inno Setup to exit gracefully
            if (cancelFilePath) {
                try {
                    await pfs.Promises.writeFile(cancelFilePath, 'cancel');
                }
                catch (err) {
                    this.logService.warn('update#cancelPendingUpdate: failed to write cancel file', err);
                }
            }
            // Wait for the process to exit gracefully, then force-kill if needed
            const pid = updateProcess.pid;
            const exited = await Promise.race([exitPromise, timeout(30 * 1000).then(() => false)]);
            if (pid && !exited) {
                this.logService.trace('update#cancelPendingUpdate: process did not exit gracefully, killing process tree');
                await killTree(pid, true);
            }
        }
        // Clean up the flag file
        await this.unlink(updateFilePath);
        // Clean up the cancel file
        await this.unlink(cancelFilePath);
        this.availableUpdate = undefined;
    }
    doQuitAndInstall() {
        if ((this.state.type !== "ready" /* StateType.Ready */ && this.state.type !== "restarting" /* StateType.Restarting */) || !this.availableUpdate) {
            return;
        }
        this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');
        if (this.availableUpdate.updateFilePath) {
            try {
                unlinkSync(this.availableUpdate.updateFilePath);
            }
            catch {
                // ignore
            }
        }
        else {
            spawn(this.availableUpdate.packagePath, ['/silent', '/log', '/mergetasks=runcode,!desktopicon,!quicklaunchicon'], {
                detached: true,
                stdio: ['ignore', 'ignore', 'ignore'],
                env: { ...process.env, __COMPAT_LAYER: 'RunAsInvoker' }
            });
        }
    }
    async saveUpdateMetadata(update) {
        try {
            const cachePath = await this.cachePath;
            const metadataPath = path.join(cachePath, 'update-metadata.json');
            await pfs.Promises.writeFile(metadataPath, JSON.stringify(update));
        }
        catch (e) {
            this.logService.error('update#saveUpdateMetadata: failed to save', e);
        }
    }
    async loadUpdateMetadata() {
        try {
            const cachePath = await this.cachePath;
            const metadataPath = path.join(cachePath, 'update-metadata.json');
            if (await pfs.Promises.exists(metadataPath)) {
                const content = await readFile(metadataPath, 'utf8');
                return JSON.parse(content);
            }
        }
        catch (e) {
            this.logService.error('update#loadUpdateMetadata: failed to load', e);
        }
        return undefined;
    }
    getUpdateType() {
        return getUpdateType();
    }
    async _applySpecificUpdate(packagePath) {
        if (this.state.type !== "idle" /* StateType.Idle */) {
            return;
        }
        const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
        const update = await this.loadUpdateMetadata() ?? { version: 'unknown', productVersion: 'unknown' };
        this.setState(State.Downloading(update, true, false));
        this.availableUpdate = { packagePath };
        this.setState(State.Downloaded(update, true, false));
        if (fastUpdatesEnabled && this.productService.target === 'user') {
            this.doApplyUpdate();
        }
        else {
            this.setState(State.Ready(update, true, false));
        }
    }
    async unlink(path) {
        if (path) {
            try {
                await unlink(path);
            }
            catch (err) {
                const error = err;
                if (error && error.code === 'ENOENT') {
                    return;
                }
                else {
                    this.logService.warn(`update#unlink: failed to unlink ${basename(path)}`, err);
                }
            }
        }
    }
};
__decorate([
    memoize
], Win32UpdateService.prototype, "cachePath", null);
Win32UpdateService = __decorate([
    __param(0, ILifecycleMainService),
    __param(1, IConfigurationService),
    __param(2, ITelemetryService),
    __param(3, IEnvironmentMainService),
    __param(4, IRequestService),
    __param(5, ILogService),
    __param(6, IFileService),
    __param(7, INativeHostMainService),
    __param(8, IProductService),
    __param(9, IApplicationStorageMainService),
    __param(10, IMeteredConnectionService)
], Win32UpdateService);
export { Win32UpdateService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlU2VydmljZS53aW4zMi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VwZGF0ZS9lbGVjdHJvbi1tYWluL3VwZGF0ZVNlcnZpY2Uud2luMzIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFnQixLQUFLLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDcEQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUMvQixPQUFPLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxNQUFNLElBQUksQ0FBQztBQUM1QyxPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDdEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDckMsT0FBTyxFQUFFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUM5RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEtBQUssSUFBSSxNQUFNLDhCQUE4QixDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN4RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxRQUFR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