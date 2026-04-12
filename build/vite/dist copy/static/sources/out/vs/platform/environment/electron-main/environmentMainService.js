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
import { memoize } from '../../../base/common/decorators.js';
import { join } from '../../../base/common/path.js';
import { isLinux } from '../../../base/common/platform.js';
import { createStaticIPCHandle } from '../../../base/parts/ipc/node/ipc.net.js';
import { IEnvironmentService } from '../common/environment.js';
import { NativeEnvironmentService } from '../node/environmentService.js';
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
export const IEnvironmentMainService = refineServiceDecorator(IEnvironmentService);
export class EnvironmentMainService extends NativeEnvironmentService {
    constructor() {
        super(...arguments);
        this._snapEnv = {};
    }
    get backupHome() { return join(this.userDataPath, 'Backups'); }
    get mainIPCHandle() { return createStaticIPCHandle(this.userDataPath, 'main', this.productService.version); }
    get mainLockfile() { return join(this.userDataPath, 'code.lock'); }
    get disableUpdates() { return !!this.args['disable-updates']; }
    get isPortable() { return !!process.env['VSCODE_PORTABLE']; }
    get crossOriginIsolated() { return !!this.args['enable-coi']; }
    get enableRDPDisplayTracking() { return !!this.args['enable-rdp-display-tracking']; }
    get codeCachePath() { return process.env['VSCODE_CODE_CACHE_PATH'] || undefined; }
    get useCodeCache() { return !!this.codeCachePath; }
    unsetSnapExportedVariables() {
        if (!isLinux) {
            return;
        }
        for (const key in process.env) {
            if (key.endsWith('_VSCODE_SNAP_ORIG')) {
                const originalKey = key.slice(0, -17); // Remove the _VSCODE_SNAP_ORIG suffix
                if (this._snapEnv[originalKey]) {
                    continue;
                }
                // Preserve the original value in case the snap env is re-entered
                if (process.env[originalKey]) {
                    this._snapEnv[originalKey] = process.env[originalKey];
                }
                // Copy the original value from before entering the snap env if available,
                // if not delete the env variable.
                if (process.env[key]) {
                    process.env[originalKey] = process.env[key];
                }
                else {
                    delete process.env[originalKey];
                }
            }
        }
    }
    restoreSnapExportedVariables() {
        if (!isLinux) {
            return;
        }
        for (const key in this._snapEnv) {
            process.env[key] = this._snapEnv[key];
            delete this._snapEnv[key];
        }
    }
}
__decorate([
    memoize
], EnvironmentMainService.prototype, "backupHome", null);
__decorate([
    memoize
], EnvironmentMainService.prototype, "mainIPCHandle", null);
__decorate([
    memoize
], EnvironmentMainService.prototype, "mainLockfile", null);
__decorate([
    memoize
], EnvironmentMainService.prototype, "disableUpdates", null);
__decorate([
    memoize
], EnvironmentMainService.prototype, "isPortable", null);
__decorate([
    memoize
], EnvironmentMainService.prototype, "crossOriginIsolated", null);
__decorate([
    memoize
], EnvironmentMainService.prototype, "enableRDPDisplayTracking", null);
__decorate([
    memoize
], EnvironmentMainService.prototype, "codeCachePath", null);
__decorate([
    memoize
], EnvironmentMainService.prototype, "useCodeCache", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnRNYWluU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2Vudmlyb25tZW50L2VsZWN0cm9uLW1haW4vZW52aXJvbm1lbnRNYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3BELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsbUJBQW1CLEVBQTZCLE1BQU0sMEJBQTBCLENBQUM7QUFDMUYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFckYsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsc0JBQXNCLENBQStDLG1CQUFtQixDQUFDLENBQUM7QUE4QmpJLE1BQU0sT0FBTyxzQkFBdUIsU0FBUSx3QkFBd0I7SUFBcEU7O1FBRVMsYUFBUSxHQUEyQixFQUFFLENBQUM7SUErRC9DLENBQUM7SUE1REEsSUFBSSxVQUFVLEtBQWEsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFHdkUsSUFBSSxhQUFhLEtBQWEsT0FBTyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUdySCxJQUFJLFlBQVksS0FBYSxPQUFPLElB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