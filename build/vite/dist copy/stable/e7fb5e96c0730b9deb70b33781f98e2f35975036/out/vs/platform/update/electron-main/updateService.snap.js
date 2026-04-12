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
import { realpath, watch } from 'fs';
import { timeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import * as path from '../../../base/common/path.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { State } from '../common/update.js';
import { IMeteredConnectionService } from '../../meteredConnection/common/meteredConnection.js';
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
    }
    constructor(lifecycleMainService, environmentMainService, logService, meteredConnectionService) {
        this.lifecycleMainService = lifecycleMainService;
        this.logService = logService;
        this.meteredConnectionService = meteredConnectionService;
        this._state = State.Uninitialized;
        this._onStateChange = new Emitter();
        this.onStateChange = this._onStateChange.event;
        if (environmentMainService.disableUpdates) {
            this.logService.info('update#ctor - updates are disabled');
            return;
        }
        this.setState(State.Idle(this.getUpdateType()));
        // Start checking for updates after 30 seconds
        this.scheduleCheckForUpdates(30 * 1000).then(undefined, err => this.logService.error(err));
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
    doDownloadUpdate(state) {
        return Promise.resolve(undefined);
    }
    async applyUpdate() {
        this.logService.trace('update#applyUpdate, state = ', this.state.type);
        if (this.state.type !== "downloaded" /* StateType.Downloaded */) {
            return;
        }
        await this.doApplyUpdate();
    }
    doApplyUpdate() {
        return Promise.resolve(undefined);
    }
    quitAndInstall() {
        this.logService.trace('update#quitAndInstall, state = ', this.state.type);
        if (this.state.type !== "ready" /* StateType.Ready */) {
            return Promise.resolve(undefined);
        }
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
    getUpdateType() {
        return 2 /* UpdateType.Snap */;
    }
    doQuitAndInstall() {
        // noop
    }
    async setInternalOrg(_internalOrg) {
        // noop - not applicable for snap
    }
    async _applySpecificUpdate(packagePath) {
        // noop
    }
};
AbstractUpdateService = __decorate([
    __param(0, ILifecycleMainService),
    __param(1, IEnvironmentMainService),
    __param(2, ILogService),
    __param(3, IMeteredConnectionService)
], AbstractUpdateService);
let SnapUpdateService = class SnapUpdateService extends AbstractUpdateService {
    constructor(snap, snapRevision, lifecycleMainService, environmentMainService, logService, meteredConnectionService) {
        super(lifecycleMainService, environmentMainService, logService, meteredConnectionService);
        this.snap = snap;
        this.snapRevision = snapRevision;
        const watcher = watch(path.dirname(this.snap));
        const onChange = Event.fromNodeEventEmitter(watcher, 'change', (_, fileName) => fileName);
        const onCurrentChange = Event.filter(onChange, n => n === 'current');
        const onDebouncedCurrentChange = Event.debounce(onCurrentChange, (_, e) => e, 2000);
        const listener = onDebouncedCurrentChange(() => this.checkForUpdates(false));
        Event.once(lifecycleMainService.onWillShutdown)(() => {
            listener.dispose();
            watcher.close();
        });
    }
    doCheckForUpdates() {
        this.setState(State.CheckingForUpdates(false));
        this.isUpdateAvailable().then(result => {
            if (result) {
                this.setState(State.Ready({ version: 'something' }, false, false));
            }
            else {
                this.setState(State.Idle(2 /* UpdateType.Snap */, undefined, undefined));
            }
        }, err => {
            this.logService.error(err);
            this.setState(State.Idle(2 /* UpdateType.Snap */, err.message || err));
        });
    }
    doQuitAndInstall() {
        this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');
        // Allow 3 seconds for VS Code to close
        spawn('sleep 3 && ' + path.basename(process.argv[0]), {
            shell: true,
            detached: true,
            stdio: 'ignore',
        });
    }
    async isUpdateAvailable() {
        const resolvedCurrentSnapPath = await new Promise((c, e) => realpath(`${path.dirname(this.snap)}/current`, (err, r) => err ? e(err) : c(r)));
        const currentRevision = path.basename(resolvedCurrentSnapPath);
        return this.snapRevision !== currentRevision;
    }
    isLatestVersion() {
        return this.isUpdateAvailable().then(undefined, err => {
            this.logService.error('update#checkForSnapUpdate(): Could not get realpath of application.');
            return undefined;
        });
    }
};
SnapUpdateService = __decorate([
    __param(2, ILifecycleMainService),
    __param(3, IEnvironmentMainService),
    __param(4, ILogService),
    __param(5, IMeteredConnectionService)
], SnapUpdateService);
export { SnapUpdateService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlU2VydmljZS5zbmFwLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXBkYXRlL2VsZWN0cm9uLW1haW4vdXBkYXRlU2VydmljZS5zbmFwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDdEMsT0FBTyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDckMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxLQUFLLElBQUksTUFBTSw4QkFBOEIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNwRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEQsT0FBTyxFQUF3QyxLQUFLLEVBQXlCLE1BQU0scUJBQXFCLENBQUM7QUFDekcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0scURBQXFELENBQUM7QUFFaEcsSUFBZSxxQkFBcUIsR0FBcEMsTUFBZSxxQkFBcUI7SUFTbkMsSUFBSSxLQUFLO1FBQ1IsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3BCLENBQUM7SUFFUyxRQUFRLENBQUMsS0FBWTtRQUM5QixJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDcEIsSUFBSSxDQUFD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