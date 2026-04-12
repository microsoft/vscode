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
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { listErrorForeground, listWarningForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { spinningLoading } from '../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { isString } from '../../../../base/common/types.js';
/**
 * The set of _internal_ terminal statuses, other components building on the terminal should put
 * their statuses within their component.
 */
export var TerminalStatus;
(function (TerminalStatus) {
    TerminalStatus["Bell"] = "bell";
    TerminalStatus["Disconnected"] = "disconnected";
    TerminalStatus["RelaunchNeeded"] = "relaunch-needed";
    TerminalStatus["EnvironmentVariableInfoChangesActive"] = "env-var-info-changes-active";
    TerminalStatus["ShellIntegrationInfo"] = "shell-integration-info";
    TerminalStatus["ShellIntegrationAttentionNeeded"] = "shell-integration-attention-needed";
})(TerminalStatus || (TerminalStatus = {}));
let TerminalStatusList = class TerminalStatusList extends Disposable {
    get onDidAddStatus() { return this._onDidAddStatus.event; }
    get onDidRemoveStatus() { return this._onDidRemoveStatus.event; }
    get onDidChangePrimaryStatus() { return this._onDidChangePrimaryStatus.event; }
    constructor(_configurationService) {
        super();
        this._configurationService = _configurationService;
        this._statuses = new Map();
        this._statusTimeouts = new Map();
        this._onDidAddStatus = this._register(new Emitter());
        this._onDidRemoveStatus = this._register(new Emitter());
        this._onDidChangePrimaryStatus = this._register(new Emitter());
    }
    get primary() {
        let result;
        for (const s of this._statuses.values()) {
            if (!result || s.severity >= result.severity) {
                if (s.icon || !result?.icon) {
                    result = s;
                }
            }
        }
        return result;
    }
    get statuses() { return Array.from(this._statuses.values()); }
    add(status, duration) {
        status = this._applyAnimationSetting(status);
        const outTimeout = this._statusTimeouts.get(status.id);
        if (outTimeout) {
            mainWindow.clearTimeout(outTimeout);
            this._statusTimeouts.delete(status.id);
        }
        if (duration && duration > 0) {
            const timeout = mainWindow.setTimeout(() => this.remove(status), duration);
            this._statusTimeouts.set(status.id, timeout);
        }
        const existingStatus = this._statuses.get(status.id);
        if (existingStatus && existingStatus !== status) {
            this._onDidRemoveStatus.fire(existingStatus);
            this._statuses.delete(existingStatus.id);
        }
        if (!this._statuses.has(status.id)) {
            const oldPrimary = this.primary;
            this._statuses.set(status.id, status);
            this._onDidAddStatus.fire(status);
            const newPrimary = this.primary;
            if (oldPrimary !== newPrimary) {
                this._onDidChangePrimaryStatus.fire(newPrimary);
            }
        }
    }
    remove(statusOrId) {
        const status = isString(statusOrId) ? this._statuses.get(statusOrId) : statusOrId;
        // Verify the status is the same as the one passed in
        if (status && this._statuses.get(status.id)) {
            const wasPrimary = this.primary?.id === status.id;
            this._statuses.delete(status.id);
            this._onDidRemoveStatus.fire(status);
            if (wasPrimary) {
                this._onDidChangePrimaryStatus.fire(this.primary);
            }
        }
    }
    toggle(status, value) {
        if (value) {
            this.add(status);
        }
        else {
            this.remove(status);
        }
    }
    _applyAnimationSetting(status) {
        if (!status.icon || ThemeIcon.getModifier(status.icon) !== 'spin' || this._configurationService.getValue("terminal.integrated.tabs.enableAnimation" /* TerminalSettingId.TabsEnableAnimation */)) {
            return status;
        }
        let icon;
        // Loading without animation is just a curved line that doesn't mean anything
        if (status.icon.id === spinningLoading.id) {
            icon = Codicon.play;
        }
        else {
            icon = ThemeIcon.modify(status.icon, undefined);
        }
        // Clone the status when changing the icon so that setting changes are applied without a
        // reload being needed
        return {
            ...status,
            icon
        };
    }
};
TerminalStatusList = __decorate([
    __param(0, IConfigurationService)
], TerminalStatusList);
export { TerminalStatusList };
export function getColorForSeverity(severity) {
    switch (severity) {
        case Severity.Error:
            return listErrorForeground;
        case Severity.Warning:
            return listWarningForeground;
        default:
            return '';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxTdGF0dXNMaXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbFN0YXR1c0xpc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFDM0QsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDaEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTVEOzs7R0FHRztBQUNILE1BQU0sQ0FBTixJQUFrQixjQU9qQjtBQVBELFdBQWtCLGNBQWM7SUFDL0IsK0JBQWEsQ0FBQTtJQUNiLCtDQUE2QixDQUFBO0lBQzdCLG9EQUFrQyxDQUFBO0lBQ2xDLHNGQUFvRSxDQUFBO0lBQ3BFLGlFQUErQyxDQUFBO0lBQy9DLHdGQUFzRSxDQUFBO0FBQ3ZFLENBQUMsRUFQaUIsY0FBYyxLQUFkLGNBQWMsUUFPL0I7QUF5Qk0sSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBbUIsU0FBUSxVQUFV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