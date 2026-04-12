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
import { ILogService } from '../../../../log/common/log.js';
import { TerminalAutoResponder } from './terminalAutoResponder.js';
let AutoRepliesPtyServiceContribution = class AutoRepliesPtyServiceContribution {
    constructor(_logService) {
        this._logService = _logService;
        this._autoReplies = new Map();
        this._terminalProcesses = new Map();
        this._autoResponders = new Map();
    }
    async installAutoReply(match, reply) {
        this._autoReplies.set(match, reply);
        // If the auto reply exists on any existing terminals it will be overridden
        for (const persistentProcessId of this._autoResponders.keys()) {
            const process = this._terminalProcesses.get(persistentProcessId);
            if (!process) {
                this._logService.error('Could not find terminal process to install auto reply');
                continue;
            }
            this._processInstallAutoReply(persistentProcessId, process, match, reply);
        }
    }
    async uninstallAllAutoReplies() {
        for (const match of this._autoReplies.keys()) {
            for (const processAutoResponders of this._autoResponders.values()) {
                processAutoResponders.get(match)?.dispose();
                processAutoResponders.delete(match);
            }
        }
    }
    handleProcessReady(persistentProcessId, process) {
        this._terminalProcesses.set(persistentProcessId, process);
        this._autoResponders.set(persistentProcessId, new Map());
        for (const [match, reply] of this._autoReplies.entries()) {
            this._processInstallAutoReply(persistentProcessId, process, match, reply);
        }
    }
    handleProcessDispose(persistentProcessId) {
        const processAutoResponders = this._autoResponders.get(persistentProcessId);
        if (processAutoResponders) {
            for (const e of processAutoResponders.values()) {
                e.dispose();
            }
            processAutoResponders.clear();
        }
    }
    handleProcessInput(persistentProcessId, data) {
        const processAutoResponders = this._autoResponders.get(persistentProcessId);
        if (processAutoResponders) {
            for (const listener of processAutoResponders.values()) {
                listener.handleInput();
            }
        }
    }
    handleProcessResize(persistentProcessId, cols, rows) {
        const processAutoResponders = this._autoResponders.get(persistentProcessId);
        if (processAutoResponders) {
            for (const listener of processAutoResponders.values()) {
                listener.handleResize();
            }
        }
    }
    _processInstallAutoReply(persistentProcessId, terminalProcess, match, reply) {
        const processAutoResponders = this._autoResponders.get(persistentProcessId);
        if (processAutoResponders) {
            processAutoResponders.get(match)?.dispose();
            processAutoResponders.set(match, new TerminalAutoResponder(terminalProcess, match, reply, this._logService));
        }
    }
};
AutoRepliesPtyServiceContribution = __decorate([
    __param(0, ILogService)
], AutoRepliesPtyServiceContribution);
export { AutoRepliesPtyServiceContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0b1JlcGxpZXNDb250cmliQ29udHJvbGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvdGVybWluYWxDb250cmliL2F1dG9SZXBsaWVzL2F1dG9SZXBsaWVzQ29udHJpYkNvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRTVELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRTVELElBQU0saUNBQWlDLEdBQXZDLE1BQU0saUNBQWlDO0lBSzdDLFlBQ2MsV0FBeUM7UUFBeEIsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFMdEMsaUJBQVksR0FBd0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUM5Qyx1QkFBa0IsR0FBdUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNuRSxvQkFBZSxHQUFvRCxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBSzlGLENBQUM7SUFFRCxLQUFLLENBQUMsZ0JBQWdCLENBQUMsS0FBYSxFQUFFLEtBQWE7UUFDbEQsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BDLDJFQUEyRTtRQUMzRSxLQUFLLE1BQU0sbUJBQW1CLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQy9ELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsQ0FBQztZQUNqRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsdURBQXVELENBQUMsQ0FBQztnQkFDaEYsU0FBUztZ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