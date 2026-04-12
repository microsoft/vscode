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
import { parse } from '../../../base/common/path.js';
import { debounce, throttle } from '../../../base/common/decorators.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { listProcesses } from '../../../base/node/ps.js';
import { ILogService } from '../../log/common/log.js';
var Constants;
(function (Constants) {
    /**
     * The amount of time to throttle checks when the process receives output.
     */
    Constants[Constants["InactiveThrottleDuration"] = 5000] = "InactiveThrottleDuration";
    /**
     * The amount of time to debounce check when the process receives input.
     */
    Constants[Constants["ActiveDebounceDuration"] = 1000] = "ActiveDebounceDuration";
})(Constants || (Constants = {}));
export const ignoreProcessNames = [];
/**
 * Monitors a process for child processes, checking at differing times depending on input and output
 * calls into the monitor.
 */
let ChildProcessMonitor = class ChildProcessMonitor extends Disposable {
    set hasChildProcesses(value) {
        if (this._hasChildProcesses !== value) {
            this._hasChildProcesses = value;
            this._logService.debug('ChildProcessMonitor: Has child processes changed', value);
            this._onDidChangeHasChildProcesses.fire(value);
        }
    }
    /**
     * Whether the process has child processes.
     */
    get hasChildProcesses() { return this._hasChildProcesses; }
    constructor(_pid, _logService) {
        super();
        this._pid = _pid;
        this._logService = _logService;
        this._hasChildProcesses = false;
        this._onDidChangeHasChildProcesses = this._register(new Emitter());
        /**
         * An event that fires when whether the process has child processes changes.
         */
        this.onDidChangeHasChildProcesses = this._onDidChangeHasChildProcesses.event;
    }
    /**
     * Updates the pid to monitor. This is needed when the pid is not available
     * immediately after spawn (e.g. node-pty deferred conpty connection).
     */
    setPid(pid) {
        this._pid = pid;
    }
    /**
     * Input was triggered on the process.
     */
    handleInput() {
        this._refreshActive();
    }
    /**
     * Output was triggered on the process.
     */
    handleOutput() {
        this._refreshInactive();
    }
    async _refreshActive() {
        if (this._store.isDisposed) {
            return;
        }
        try {
            const processItem = await listProcesses(this._pid);
            this.hasChildProcesses = this._processContainsChildren(processItem);
        }
        catch (e) {
            this._logService.debug('ChildProcessMonitor: Fetching process tree failed', e);
        }
    }
    _refreshInactive() {
        this._refreshActive();
    }
    _processContainsChildren(processItem) {
        // No child processes
        if (!processItem.children) {
            return false;
        }
        // A single child process, handle special cases
        if (processItem.children.length === 1) {
            const item = processItem.children[0];
            let cmd;
            if (item.cmd.startsWith(`"`)) {
                cmd = item.cmd.substring(1, item.cmd.indexOf(`"`, 1));
            }
            else {
                const spaceIndex = item.cmd.indexOf(` `);
                if (spaceIndex === -1) {
                    cmd = item.cmd;
                }
                else {
                    cmd = item.cmd.substring(0, spaceIndex);
                }
            }
            return ignoreProcessNames.indexOf(parse(cmd).name) === -1;
        }
        // Fallback, count child processes
        return processItem.children.length > 0;
    }
};
__decorate([
    debounce(1000 /* Constants.ActiveDebounceDuration */)
], ChildProcessMonitor.prototype, "_refreshActive", null);
__decorate([
    throttle(5000 /* Constants.InactiveThrottleDuration */)
], ChildProcessMonitor.prototype, "_refreshInactive", null);
ChildProcessMonitor = __decorate([
    __param(1, ILogService)
], ChildProcessMonitor);
export { ChildProcessMonitor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hpbGRQcm9jZXNzTW9uaXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvY2hpbGRQcm9jZXNzTW9uaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFdEQsSUFBVyxTQVNWO0FBVEQsV0FBVyxTQUFTO0lBQ25COztPQUVHO0lBQ0gsb0ZBQStCLENBQUE7SUFDL0I7O09BRUc7SUFDSCxnRkFBNkIsQ0FBQTtBQUM5QixDQUFDLEVBVFUsU0FBUyxLQUFULFNBQVMsUUFTbkI7QUFFRCxNQUFNLENBQUMsTUFBTSxrQkFBa0IsR0FBYSxFQUFFLENBQUM7QUFFL0M7OztHQUdHO0FBQ0ksSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVO0lBRWxELElBQVksaUJBQWlCLENBQUMsS0FBYztRQUMzQyxJQUFJLElBQUksQ0FBQyxrQkFBa0IsS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUN2QyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsS0FBSyxDQUFDO1lBQ2hDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLGtEQUFrRCxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2xGLElBQUksQ0FBQyw2QkFB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