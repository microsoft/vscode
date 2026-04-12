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
import * as os from 'os';
import { IntervalTimer, timeout } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import { getWindowsReleaseSync } from '../../../base/node/windowsVersion.js';
import { IMeteredConnectionService } from '../../meteredConnection/common/meteredConnection.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService } from '../../request/common/request.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { State } from '../common/update.js';
const LAST_KNOWN_VERSION_STORAGE_KEY = 'abstractUpdateService/lastKnownVersion';
export function createUpdateURL(baseUpdateUrl, platform, quality, commit, options) {
    const url = new URL(`${baseUpdateUrl}/api/update/${platform}/${quality}/${commit}`);
    if (options?.background) {
        url.searchParams.set('bg', 'true');
    }
    url.searchParams.set('u', options?.internalOrg ?? 'none');
    return url.toString();
}
/**
 * Builds common headers for update requests, including those issued
 * via Electron's auto-updater (e.g. setFeedURL({ url, headers })) and
 * manual HTTP requests that bypass the auto-updater. The headers include
 * OS version information which the update server uses for EOL detection.
 *
 * On macOS, the User-Agent includes the Darwin kernel version.
 * On Windows, the User-Agent includes accurate Windows version from the registry.
 */
export function getUpdateRequestHeaders(productVersion) {
    if (isMacintosh) {
        const darwinVersion = os.release();
        return {
            'User-Agent': `Code/${productVersion} Darwin/${darwinVersion}`
        };
    }
    if (isWindows) {
        const match = getWindowsReleaseSync().match(/^(\d+\.\d+)/);
        if (match) {
            return {
                'User-Agent': `Code/${productVersion} Electron/${process.versions.electron} Windows NT ${match[1]}`
            };
        }
    }
    return undefined;
}
let AbstractUpdateService = class AbstractUpdateService {
    get state() {
        return this._state;
    }
    setState(state) {
        this.logService.info('update#setState', state.type);
        this._state = state;
        this._onStateChange.fire(state);
        // Clear transient one-time properties from Idle state after delivering the event.
        // This prevents new windows from seeing stale error/notAvailable messages.
        if (state.type === "idle" /* StateType.Idle */ && (state.error || state.notAvailable)) {
            this._state = State.Idle(state.updateType);
        }
        // Schedule 5-minute checks when in Ready state and overwrite is supported
        if (this.supportsUpdateOverwrite) {
            if (state.type === "ready" /* StateType.Ready */) {
                this.overwriteUpdatesCheckInterval.cancelAndSet(() => this.checkForOverwriteUpdates(), 5 * 60 * 1000);
            }
            else {
                this.overwriteUpdatesCheckInterval.cancel();
            }
        }
    }
    constructor(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService, telemetryService, applicationStorageMainService, meteredConnectionService, supportsUpdateOverwrite) {
        this.lifecycleMainService = lifecycleMainService;
        this.configurationService = configurationService;
        this.environmentMainService = environmentMainService;
        this.requestService = requestService;
        this.logService = logService;
        this.productService = productService;
        this.telemetryService = telemetryService;
        this.applicationStorageMainService = applicationStorageMainService;
        this.meteredConnectionService = meteredConnectionService;
        this.supportsUpdateOverwrite = supportsUpdateOverwrite;
        this._state = State.Uninitialized;
        this._overwrite = false;
        this._hasCheckedForOverwriteOnQuit = false;
        this.overwriteUpdatesCheckInterval = new IntervalTimer();
        this._internalOrg = undefined;
        this._onStateChange = new Emitter();
        this.onStateChange = this._onStateChange.event;
        lifecycleMainService.when(3 /* LifecycleMainPhase.AfterWindowOpen */)
            .finally(() => this.initialize());
    }
    /**
     * This must be called before any other call. This is a performance
     * optimization, to avoid using extra CPU cycles before first window open.
     * https://github.com/microsoft/vscode/issues/89784
     */
    async initialize() {
        if (!this.environmentMainService.isBuilt) {
            this.setState(State.Disabled(0 /* DisablementReason.NotBuilt */));
            return; // updates are never enabled when running out of sources
        }
        await this.trackVersionChange();
        if (this.environmentMainService.disableUpdates) {
            this.setState(State.Disabled(1 /* DisablementReason.DisabledByEnvironment */));
            this.logService.info('update#ctor - updates are disabled by the environment');
            return;
        }
        if (!this.productService.updateUrl || !this.productService.commit) {
            this.setState(State.Disabled(4 /* DisablementReason.MissingConfiguration */));
            this.logService.info('update#ctor - updates are disabled as there is no update URL');
            return;
        }
        const updateMode = this.configurationService.getValue('update.mode');
        const updateModeInspection = this.configurationService.inspect('update.mode');
        const policyDisablesUpdates = updateModeInspection.policyValue !== undefined && !this.getProductQuality(updateModeInspection.policyValue);
        const quality = this.getProductQuality(updateMode);
        if (!quality) {
            if (policyDisablesUpdates) {
                this.setState(State.Disabled(3 /* DisablementReason.Policy */));
                this.logService.info('update#ctor - updates are disabled by policy');
            }
            else {
                this.setState(State.Disabled(2 /* DisablementReason.ManuallyDisabled */));
                this.logService.info('update#ctor - updates are disabled by user preference');
            }
            return;
        }
        if (!this.buildUpdateFeedUrl(quality, this.productService.commit)) {
            this.setState(State.Disabled(5 /* DisablementReason.InvalidConfiguration */));
            this.logService.info('update#ctor - updates are disabled as the update URL is badly formed');
            return;
        }
        this.quality = quality;
        this.setState(State.Idle(this.getUpdateType()));
        await this.postInitialize();
        if (updateMode === 'manual') {
            this.logService.info('update#ctor - manual checks only; automatic updates are disabled by user preference');
            return;
        }
        if (updateMode === 'start') {
            this.logService.info('update#ctor - startup checks only; automatic updates are disabled by user preference');
            // Check for updates only once after 30 seconds
            setTimeout(() => this.checkForUpdates(false), 30 * 1000);
        }
        else {
            // Start checking for updates after 30 seconds
            this.scheduleCheckForUpdates(30 * 1000).then(undefined, err => this.logService.error(err));
        }
    }
    async trackVersionChange() {
        await this.applicationStorageMainService.whenReady;
        let from;
        const raw = this.applicationStorageMainService.get(LAST_KNOWN_VERSION_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        if (typeof raw === 'string') {
            try {
                from = JSON.parse(raw);
            }
            catch (error) {
                // ignore
            }
        }
        const to = {
            version: this.productService.version,
            commit: this.productService.commit,
            timestamp: Date.now(),
        };
        if (from?.commit === to.commit) {
            return;
        }
        this.applicationStorageMainService.store(LAST_KNOWN_VERSION_STORAGE_KEY, JSON.stringify(to), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        if (!from) {
            return;
        }
        this.telemetryService.publicLog2('update:versionChanged', {
            fromVersion: from.version,
            fromCommit: from.commit,
            fromVersionTime: from.timestamp,
            toVersion: to.version,
            toCommit: to.commit,
            timeToUpdateMs: to.timestamp - from.timestamp,
            updateMode: this.configurationService.getValue('update.mode'),
        });
    }
    getProductQuality(updateMode) {
        return updateMode === 'none' ? undefined : this.productService.quality;
    }
    scheduleCheckForUpdates(delay = 60 * 60 * 1000) {
        return timeout(delay)
            .then(() => this.checkForUpdates(false))
            .then(() => {
            // Check again after 1 hour
            return this.scheduleCheckForUpdates(60 * 60 * 1000);
        });
    }
    async checkForUpdates(explicit) {
        this.logService.trace('update#checkForUpdates, state = ', this.state.type);
        if (this.state.type !== "idle" /* StateType.Idle */) {
            return;
        }
        this.doCheckForUpdates(explicit);
    }
    async downloadUpdate(explicit) {
        this.logService.trace('update#downloadUpdate, state = ', this.state.type);
        if (this.state.type !== "available for download" /* StateType.AvailableForDownload */) {
            return;
        }
        if (!explicit && this.meteredConnectionService.isConnectionMetered) {
            this.logService.info('update#downloadUpdate - skipping download because connection is metered');
            return;
        }
        await this.doDownloadUpdate(this.state);
    }
    async doDownloadUpdate(state) {
        // noop
    }
    async applyUpdate() {
        this.logService.trace('update#applyUpdate, state = ', this.state.type);
        if (this.state.type !== "downloaded" /* StateType.Downloaded */) {
            return;
        }
        await this.doApplyUpdate();
    }
    async doApplyUpdate() {
        // noop
    }
    async quitAndInstall() {
        this.logService.trace('update#quitAndInstall, state = ', this.state.type);
        if (this.state.type !== "ready" /* StateType.Ready */) {
            return undefined;
        }
        if (this.supportsUpdateOverwrite && !this._hasCheckedForOverwriteOnQuit) {
            this._hasCheckedForOverwriteOnQuit = true;
            const didOverwrite = await this.checkForOverwriteUpdates(true);
            if (didOverwrite) {
                this.logService.info('update#quitAndInstall(): overwrite update detected, postponing quitAndInstall');
                return;
            }
        }
        this.setState(State.Restarting(this.state.update));
        this.logService.trace('update#quitAndInstall(): before lifecycle quit()');
        this.lifecycleMainService.quit(true /* will restart */).then(vetod => {
            this.logService.trace(`update#quitAndInstall(): after lifecycle quit() with veto: ${vetod}`);
            if (vetod) {
                return;
            }
            this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');
            this.doQuitAndInstall();
        });
        return Promise.resolve(undefined);
    }
    async checkForOverwriteUpdates(explicit = false) {
        if (this._state.type !== "ready" /* StateType.Ready */) {
            return false;
        }
        const pendingUpdateCommit = this._state.update.version;
        let isLatest;
        try {
            const cts = new CancellationTokenSource();
            const timeoutPromise = timeout(2000).then(() => { cts.cancel(); return undefined; });
            isLatest = await Promise.race([this.isLatestVersion(pendingUpdateCommit, cts.token), timeoutPromise]);
            cts.dispose();
        }
        catch (error) {
            this.logService.warn('update#checkForOverwriteUpdates(): failed to check for updates, proceeding with restart');
            this.logService.warn(error);
            return false;
        }
        if (isLatest === false && this._state.type === "ready" /* StateType.Ready */) {
            this.logService.info('update#readyStateCheck: newer update available, restarting update machinery');
            try {
                await this.cancelPendingUpdate();
            }
            catch (error) {
                this.logService.error('update#checkForOverwriteUpdates(): failed to cancel pending update, aborting overwrite');
                this.logService.error(error);
                return false;
            }
            this._overwrite = true;
            this.setState(State.Overwriting(this._state.update, explicit));
            this.doCheckForUpdates(explicit, pendingUpdateCommit);
            return true;
        }
        return false;
    }
    async isLatestVersion(commit, token = CancellationToken.None) {
        if (!this.quality) {
            return undefined;
        }
        const mode = this.configurationService.getValue('update.mode');
        if (mode === 'none') {
            return undefined;
        }
        const url = this.buildUpdateFeedUrl(this.quality, commit ?? this.productService.commit, { internalOrg: this.getInternalOrg() });
        if (!url) {
            return undefined;
        }
        const headers = getUpdateRequestHeaders(this.productService.version);
        this.logService.trace('update#isLatestVersion() - checking update server', { url, headers });
        try {
            const context = await this.requestService.request({ url, headers, callSite: 'updateService.isLatestVersion' }, token);
            const statusCode = context.res.statusCode;
            this.logService.trace('update#isLatestVersion() - response', { statusCode });
            // The update server replies with 204 (No Content) when no
            // update is available - that's all we want to know.
            return statusCode === 204;
        }
        catch (error) {
            this.logService.error('update#isLatestVersion(): failed to check for updates');
            this.logService.error(error);
            return undefined;
        }
    }
    async _applySpecificUpdate(packagePath) {
        // noop
    }
    async setInternalOrg(internalOrg) {
        if (this._internalOrg === internalOrg) {
            return;
        }
        this.logService.info('update#setInternalOrg', internalOrg);
        this._internalOrg = internalOrg;
    }
    getInternalOrg() {
        return this._internalOrg;
    }
    getUpdateType() {
        return 1 /* UpdateType.Archive */;
    }
    doQuitAndInstall() {
        // noop
    }
    async postInitialize() {
        // noop
    }
    async cancelPendingUpdate() {
        // noop
    }
};
AbstractUpdateService = __decorate([
    __param(0, ILifecycleMainService),
    __param(1, IConfigurationService),
    __param(2, IEnvironmentMainService),
    __param(3, IRequestService),
    __param(4, ILogService),
    __param(5, IProductService),
    __param(6, ITelemetryService),
    __param(7, IApplicationStorageMainService),
    __param(8, IMeteredConnectionService)
], AbstractUpdateService);
export { AbstractUpdateService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RVcGRhdGVTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXBkYXRlL2VsZWN0cm9uLW1haW4vYWJzdHJhY3RVcGRhdGVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdkUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDN0UsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDcEcsT0FBTyxFQUFFLHFCQUFxQixFQUFzQixNQUFNLHVEQUF1RCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFDQUFx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