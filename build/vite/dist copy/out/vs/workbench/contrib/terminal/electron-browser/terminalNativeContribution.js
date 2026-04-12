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
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { registerRemoteContributions } from './terminalRemote.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ITerminalService } from '../browser/terminal.js';
import { disposableWindowInterval, getActiveWindow } from '../../../../base/browser/dom.js';
let TerminalNativeContribution = class TerminalNativeContribution extends Disposable {
    constructor(_fileService, _terminalService, remoteAgentService, nativeHostService) {
        super();
        this._fileService = _fileService;
        this._terminalService = _terminalService;
        ipcRenderer.on('vscode:openFiles', (_, ...args) => { this._onOpenFileRequest(args[0]); });
        this._register(nativeHostService.onDidResumeOS(() => this._onOsResume()));
        this._terminalService.setNativeDelegate({
            getWindowCount: () => nativeHostService.getWindowCount()
        });
        const connection = remoteAgentService.getConnection();
        if (connection && connection.remoteAuthority) {
            registerRemoteContributions();
        }
    }
    _onOsResume() {
        for (const instance of this._terminalService.instances) {
            instance.xterm?.forceRedraw();
        }
    }
    async _onOpenFileRequest(request) {
        // if the request to open files is coming in from the integrated terminal (identified though
        // the termProgram variable) and we are instructed to wait for editors close, wait for the
        // marker file to get deleted and then focus back to the integrated terminal.
        if (request.termProgram === 'vscode' && request.filesToWait) {
            const waitMarkerFileUri = URI.revive(request.filesToWait.waitMarkerFileUri);
            await this._whenFileDeleted(waitMarkerFileUri);
            // Focus active terminal
            this._terminalService.activeInstance?.focus();
        }
    }
    _whenFileDeleted(path) {
        // Complete when wait marker file is deleted
        return new Promise(resolve => {
            let running = false;
            const interval = disposableWindowInterval(getActiveWindow(), async () => {
                if (!running) {
                    running = true;
                    const exists = await this._fileService.exists(path);
                    running = false;
                    if (!exists) {
                        interval.dispose();
                        resolve(undefined);
                    }
                }
            }, 1000);
        });
    }
};
TerminalNativeContribution = __decorate([
    __param(0, IFileService),
    __param(1, ITerminalService),
    __param(2, IRemoteAgentService),
    __param(3, INativeHostService)
], TerminalNativeContribution);
export { TerminalNativeContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxOYXRpdmVDb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9lbGVjdHJvbi1icm93c2VyL3Rlcm1pbmFsTmF0aXZlQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUV6RixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUUxRCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsZUFBZSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFckYsSUFBTSwwQkFBMEIsR0FBaEMsTUFBTSwwQkFBMkIsU0FBUSxVQUFVO0lBR3pELFlBQ2dDLFlBQTBCLEVBQ3RCLGdCQUFrQyxFQUNoRCxrQkFBdUMsRUFDeEMsaUJBQXFDO1FBRXpELEtBQUssRUFBRSxDQUFDO1FBTHVCLGlCQUFZLEdBQVosWUFBWSxDQUFjO1FBQ3RCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBa0I7UUFNckUsV0FBVyxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQVUsRUFBRSxHQUFHLElBQWUsRUFB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