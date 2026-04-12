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
import * as electron from 'electron';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { memoize } from '../../../base/common/decorators.js';
import { Event } from '../../../base/common/event.js';
import { hash } from '../../../base/common/hash.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, IRequestService } from '../../request/common/request.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { State } from '../common/update.js';
import { IMeteredConnectionService } from '../../meteredConnection/common/meteredConnection.js';
import { AbstractUpdateService, createUpdateURL, getUpdateRequestHeaders } from './abstractUpdateService.js';
let DarwinUpdateService = class DarwinUpdateService extends AbstractUpdateService {
    get onRawError() { return Event.fromNodeEventEmitter(electron.autoUpdater, 'error', (_, message) => message); }
    get onRawCheckingForUpdate() { return Event.fromNodeEventEmitter(electron.autoUpdater, 'checking-for-update'); }
    get onRawUpdateNotAvailable() { return Event.fromNodeEventEmitter(electron.autoUpdater, 'update-not-available'); }
    get onRawUpdateAvailable() { return Event.fromNodeEventEmitter(electron.autoUpdater, 'update-available'); }
    get onRawUpdateDownloaded() {
        return Event.fromNodeEventEmitter(electron.autoUpdater, 'update-downloaded', (_, version, productVersion, releaseDate) => ({
            version,
            productVersion,
            timestamp: releaseDate instanceof Date ? releaseDate.getTime() || undefined : releaseDate
        }));
    }
    constructor(lifecycleMainService, configurationService, telemetryService, environmentMainService, requestService, logService, productService, applicationStorageMainService, meteredConnectionService) {
        super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService, telemetryService, applicationStorageMainService, meteredConnectionService, true);
        this.disposables = new DisposableStore();
        lifecycleMainService.setRelaunchHandler(this);
    }
    handleRelaunch(options) {
        if (options?.addArgs || options?.removeArgs) {
            return false; // we cannot apply an update and restart with different args
        }
        if (this.state.type !== "ready" /* StateType.Ready */) {
            return false; // we only handle the relaunch when we have a pending update
        }
        this.logService.trace('update#handleRelaunch(): running raw#quitAndInstall()');
        this.doQuitAndInstall();
        return true;
    }
    async initialize() {
        await super.initialize();
        // In the embedded app we still want to detect available updates via HTTP,
        // but we must not wire up Electron's autoUpdater (which auto-downloads).
        if (process.isEmbeddedApp) {
            this.logService.info('update#ctor - embedded app: checking for updates without auto-download');
            return;
        }
        this.onRawError(this.onError, this, this.disposables);
        this.onRawCheckingForUpdate(this.onCheckingForUpdate, this, this.disposables);
        this.onRawUpdateAvailable(this.onUpdateAvailable, this, this.disposables);
        this.onRawUpdateDownloaded(this.onUpdateDownloaded, this, this.disposables);
        this.onRawUpdateNotAvailable(this.onUpdateNotAvailable, this, this.disposables);
    }
    onCheckingForUpdate() {
        this.logService.trace('update#onCheckingForUpdate - Electron autoUpdater is checking for updates');
    }
    onError(err) {
        this.telemetryService.publicLog2('update:error', { messageHash: String(hash(String(err))) });
        this.logService.error('UpdateService error:', err);
        // only show message when explicitly checking for updates
        const message = (this.state.type === "checking for updates" /* StateType.CheckingForUpdates */ && this.state.explicit) ? err : undefined;
        this.setState(State.Idle(1 /* UpdateType.Archive */, message));
    }
    buildUpdateFeedUrl(quality, commit, options) {
        const assetID = this.productService.darwinUniversalAssetId ?? (process.arch === 'x64' ? 'darwin' : 'darwin-arm64');
        const url = createUpdateURL(this.productService.updateUrl, assetID, quality, commit, options);
        const headers = getUpdateRequestHeaders(this.productService.version);
        try {
            this.logService.trace('update#buildUpdateFeedUrl - setting feed URL for Electron autoUpdater', { url, assetID, quality, commit, headers });
            electron.autoUpdater.setFeedURL({ url, headers });
        }
        catch (e) {
            // application is very likely not signed
            this.logService.error('Failed to set update feed URL', e);
            return undefined;
        }
        return url;
    }
    async checkForUpdates(explicit) {
        this.logService.trace('update#checkForUpdates, state = ', this.state.type);
        if (this.state.type !== "idle" /* StateType.Idle */) {
            return;
        }
        this.doCheckForUpdates(explicit);
    }
    doCheckForUpdates(explicit, pendingCommit) {
        if (!this.quality) {
            return;
        }
        this.setState(State.CheckingForUpdates(explicit));
        const internalOrg = this.getInternalOrg();
        const background = !explicit && !internalOrg;
        const url = this.buildUpdateFeedUrl(this.quality, pendingCommit ?? this.productService.commit, { background, internalOrg });
        if (!url) {
            return;
        }
        // In the embedded app, always check without triggering Electron's auto-download.
        if (process.isEmbeddedApp) {
            this.logService.info('update#doCheckForUpdates - embedded app: checking for update without auto-download');
            this.checkForUpdateNoDownload(url, /* canInstall */ false);
            return;
        }
        // When connection is metered and this is not an explicit check, avoid electron call as to not to trigger auto-download.
        if (!explicit && this.meteredConnectionService.isConnectionMetered) {
            this.logService.info('update#doCheckForUpdates - checking for update without auto-download because connection is metered');
            this.checkForUpdateNoDownload(url);
            return;
        }
        this.logService.trace('update#doCheckForUpdates - using Electron autoUpdater', { url, explicit, background });
        electron.autoUpdater.checkForUpdates();
    }
    /**
     * Manually check the update feed URL without triggering Electron's auto-download.
     * Used when connection is metered or in the embedded app.
     * @param canInstall When false, signals that the update cannot be installed from this app.
     */
    async checkForUpdateNoDownload(url, canInstall) {
        const headers = getUpdateRequestHeaders(this.productService.version);
        this.logService.trace('update#checkForUpdateNoDownload - checking update server', { url, headers });
        try {
            const context = await this.requestService.request({ url, headers, callSite: 'updateService.darwin.checkForUpdates' }, CancellationToken.None);
            const statusCode = context.res.statusCode;
            this.logService.trace('update#checkForUpdateNoDownload - response', { statusCode });
            const update = await asJson(context);
            if (!update || !update.url || !update.version || !update.productVersion) {
                this.logService.trace('update#checkForUpdateNoDownload - no update available');
                const notAvailable = this.state.type === "checking for updates" /* StateType.CheckingForUpdates */ && this.state.explicit;
                this.setState(State.Idle(1 /* UpdateType.Archive */, undefined, notAvailable || undefined));
            }
            else {
                this.logService.trace('update#checkForUpdateNoDownload - update available', { version: update.version, productVersion: update.productVersion });
                this.setState(State.AvailableForDownload(update, canInstall));
            }
        }
        catch (err) {
            this.logService.error('update#checkForUpdateNoDownload - failed to check for update', err);
            this.setState(State.Idle(1 /* UpdateType.Archive */));
        }
    }
    onUpdateAvailable() {
        this.logService.trace('update#onUpdateAvailable - Electron autoUpdater reported update available');
        if (this.state.type !== "checking for updates" /* StateType.CheckingForUpdates */ && this.state.type !== "overwriting" /* StateType.Overwriting */) {
            return;
        }
        this.setState(State.Downloading(this.state.type === "overwriting" /* StateType.Overwriting */ ? this.state.update : undefined, this.state.explicit, this._overwrite));
    }
    onUpdateDownloaded(update) {
        if (this.state.type !== "downloading" /* StateType.Downloading */) {
            return;
        }
        this.setState(State.Downloaded(update, this.state.explicit, this._overwrite));
        this.logService.info(`Update downloaded: ${JSON.stringify(update)}`);
        this.setState(State.Ready(update, this.state.explicit, this._overwrite));
    }
    onUpdateNotAvailable() {
        this.logService.trace('update#onUpdateNotAvailable - Electron autoUpdater reported no update available');
        if (this.state.type !== "checking for updates" /* StateType.CheckingForUpdates */) {
            return;
        }
        const notAvailable = this.state.explicit;
        this.setState(State.Idle(1 /* UpdateType.Archive */, undefined, notAvailable || undefined));
    }
    async doDownloadUpdate(state) {
        // Rebuild feed URL and trigger download via Electron's auto-updater
        this.buildUpdateFeedUrl(this.quality, state.update.version, { internalOrg: this.getInternalOrg() });
        this.setState(State.CheckingForUpdates(true));
        electron.autoUpdater.checkForUpdates();
    }
    doQuitAndInstall() {
        this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');
        electron.autoUpdater.quitAndInstall();
    }
    dispose() {
        this.disposables.dispose();
    }
};
__decorate([
    memoize
], DarwinUpdateService.prototype, "onRawError", null);
__decorate([
    memoize
], DarwinUpdateService.prototype, "onRawCheckingForUpdate", null);
__decorate([
    memoize
], DarwinUpdateService.prototype, "onRawUpdateNotAvailable", null);
__decorate([
    memoize
], DarwinUpdateService.prototype, "onRawUpdateAvailable", null);
__decorate([
    memoize
], DarwinUpdateService.prototype, "onRawUpdateDownloaded", null);
DarwinUpdateService = __decorate([
    __param(0, ILifecycleMainService),
    __param(1, IConfigurationService),
    __param(2, ITelemetryService),
    __param(3, IEnvironmentMainService),
    __param(4, IRequestService),
    __param(5, ILogService),
    __param(6, IProductService),
    __param(7, IApplicationStorageMainService),
    __param(8, IMeteredConnectionService)
], DarwinUpdateService);
export { DarwinUpdateService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlU2VydmljZS5kYXJ3aW4uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91cGRhdGUvZWxlY3Ryb24tbWFpbi91cGRhdGVTZXJ2aWNlLmRhcndpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssUUFBUSxNQUFNLFVBQVUsQ0FBQztBQUNyQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDcEcsT0FBTyxFQUFFLHFCQUFxQixFQUFzQyxNQUFNLHVEQUF1RCxDQUFDO0FBQ2xJLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RSxPQUFPLEVBQWlDLEtBQUssRUFBeUIsTUFBTSxxQkFBcUIsQ0FBQztBQUNsRyxPQUFPLEVBQUUseUJB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