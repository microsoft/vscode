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
import { disposableWindowInterval } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { randomPort } from '../../../../base/common/ports.js';
import * as nls from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifierMap } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { RuntimeExtensionsInput } from '../common/runtimeExtensionsInput.js';
import { ProfileSessionState } from './runtimeExtensionsEditor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ExtensionHostProfiler } from '../../../services/extensions/electron-browser/extensionHostProfiler.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
let ExtensionHostProfileService = class ExtensionHostProfileService extends Disposable {
    get state() { return this._state; }
    get lastProfile() { return this._profile; }
    constructor(_extensionService, _editorService, _instantiationService, _nativeHostService, _dialogService, _statusbarService, _productService) {
        super();
        this._extensionService = _extensionService;
        this._editorService = _editorService;
        this._instantiationService = _instantiationService;
        this._nativeHostService = _nativeHostService;
        this._dialogService = _dialogService;
        this._statusbarService = _statusbarService;
        this._productService = _productService;
        this._onDidChangeState = this._register(new Emitter());
        this.onDidChangeState = this._onDidChangeState.event;
        this._onDidChangeLastProfile = this._register(new Emitter());
        this.onDidChangeLastProfile = this._onDidChangeLastProfile.event;
        this._unresponsiveProfiles = new ExtensionIdentifierMap();
        this._state = ProfileSessionState.None;
        this.profilingStatusBarIndicatorLabelUpdater = this._register(new MutableDisposable());
        this._profile = null;
        this._profileSession = null;
        this._setState(ProfileSessionState.None);
        CommandsRegistry.registerCommand('workbench.action.extensionHostProfiler.stop', () => {
            this.stopProfiling();
            this._editorService.openEditor(RuntimeExtensionsInput.instance, { pinned: true });
        });
    }
    _setState(state) {
        if (this._state === state) {
            return;
        }
        this._state = state;
        if (this._state === ProfileSessionState.Running) {
            this.updateProfilingStatusBarIndicator(true);
        }
        else if (this._state === ProfileSessionState.Stopping) {
            this.updateProfilingStatusBarIndicator(false);
        }
        this._onDidChangeState.fire(undefined);
    }
    updateProfilingStatusBarIndicator(visible) {
        this.profilingStatusBarIndicatorLabelUpdater.clear();
        if (visible) {
            const indicator = {
                name: nls.localize('status.profiler', "Extension Profiler"),
                text: nls.localize('profilingExtensionHost', "Profiling Extension Host"),
                showProgress: true,
                ariaLabel: nls.localize('profilingExtensionHost', "Profiling Extension Host"),
                tooltip: nls.localize('selectAndStartDebug', "Click to stop profiling."),
                command: 'workbench.action.extensionHostProfiler.stop'
            };
            const timeStarted = Date.now();
            const handle = disposableWindowInterval(mainWindow, () => {
                this.profilingStatusBarIndicator?.update({ ...indicator, text: nls.localize('profilingExtensionHostTime', "Profiling Extension Host ({0} sec)", Math.round((new Date().getTime() - timeStarted) / 1000)), });
            }, 1000);
            this.profilingStatusBarIndicatorLabelUpdater.value = handle;
            if (!this.profilingStatusBarIndicator) {
                this.profilingStatusBarIndicator = this._statusbarService.addEntry(indicator, 'status.profiler', 1 /* StatusbarAlignment.RIGHT */);
            }
            else {
                this.profilingStatusBarIndicator.update(indicator);
            }
        }
        else {
            if (this.profilingStatusBarIndicator) {
                this.profilingStatusBarIndicator.dispose();
                this.profilingStatusBarIndicator = undefined;
            }
        }
    }
    async startProfiling() {
        if (this._state !== ProfileSessionState.None) {
            return null;
        }
        const inspectPorts = await this._extensionService.getInspectPorts(1 /* ExtensionHostKind.LocalProcess */, true);
        if (inspectPorts.length === 0) {
            return this._dialogService.confirm({
                type: 'info',
                message: nls.localize('restart1', "Profile Extensions"),
                detail: nls.localize('restart2', "In order to profile extensions a restart is required. Do you want to restart '{0}' now?", this._productService.nameLong),
                primaryButton: nls.localize({ key: 'restart3', comment: ['&& denotes a mnemonic'] }, "&&Restart")
            }).then(res => {
                if (res.confirmed) {
                    this._nativeHostService.relaunch({ addArgs: [`--inspect-extensions=${randomPort()}`] });
                }
            });
        }
        if (inspectPorts.length > 1) {
            // TODO
            console.warn(`There are multiple extension hosts available for profiling. Picking the first one...`);
        }
        this._setState(ProfileSessionState.Starting);
        return this._instantiationService.createInstance(ExtensionHostProfiler, inspectPorts[0].host, inspectPorts[0].port).start().then((value) => {
            this._profileSession = value;
            this._setState(ProfileSessionState.Running);
        }, (err) => {
            onUnexpectedError(err);
            this._setState(ProfileSessionState.None);
        });
    }
    stopProfiling() {
        if (this._state !== ProfileSessionState.Running || !this._profileSession) {
            return;
        }
        this._setState(ProfileSessionState.Stopping);
        this._profileSession.stop().then((result) => {
            this._setLastProfile(result);
            this._setState(ProfileSessionState.None);
        }, (err) => {
            onUnexpectedError(err);
            this._setState(ProfileSessionState.None);
        });
        this._profileSession = null;
    }
    _setLastProfile(profile) {
        this._profile = profile;
        this.lastProfileSavedTo = undefined;
        this._onDidChangeLastProfile.fire(undefined);
    }
    getUnresponsiveProfile(extensionId) {
        return this._unresponsiveProfiles.get(extensionId);
    }
    setUnresponsiveProfile(extensionId, profile) {
        this._unresponsiveProfiles.set(extensionId, profile);
        this._setLastProfile(profile);
    }
};
ExtensionHostProfileService = __decorate([
    __param(0, IExtensionService),
    __param(1, IEditorService),
    __param(2, IInstantiationService),
    __param(3, INativeHostService),
    __param(4, IDialogService),
    __param(5, IStatusbarService),
    __param(6, IProductService)
], ExtensionHostProfileService);
export { ExtensionHostProfileService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUHJvZmlsZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlbnNpb25zL2VsZWN0cm9uLWJyb3dzZXIvZXh0ZW5zaW9uUHJvZmlsZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzlELE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDcEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBdUIsc0JBQXNCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNuSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNsRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0UsT0FBTyxFQUFnQyxtQkFBbUIsRUFBRSxNQUFNLDhC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