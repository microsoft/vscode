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
import { INativeBrowserElementsService } from '../../../../platform/browserElements/common/browserElements.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IBrowserElementsService } from '../browser/browserElementsService.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { NativeBrowserElementsService } from '../../../../platform/browserElements/common/nativeBrowserElementsService.js';
let WorkbenchNativeBrowserElementsService = class WorkbenchNativeBrowserElementsService extends NativeBrowserElementsService {
    constructor(environmentService, mainProcessService) {
        super(environmentService.window.id, mainProcessService);
    }
};
WorkbenchNativeBrowserElementsService = __decorate([
    __param(0, INativeWorkbenchEnvironmentService),
    __param(1, IMainProcessService)
], WorkbenchNativeBrowserElementsService);
let cancelSelectionIdPool = 0;
let cancelAndDetachIdPool = 0;
let WorkbenchBrowserElementsService = class WorkbenchBrowserElementsService {
    constructor(simpleBrowser) {
        this.simpleBrowser = simpleBrowser;
    }
    async getConsoleLogs(locator) {
        return await this.simpleBrowser.getConsoleLogs(locator);
    }
    async startConsoleSession(token, locator) {
        const cancelAndDetachId = cancelAndDetachIdPool++;
        const onCancelChannel = `vscode:cancelConsoleSession${cancelAndDetachId}`;
        const disposable = token.onCancellationRequested(() => {
            ipcRenderer.send(onCancelChannel, cancelAndDetachId);
            disposable.dispose();
        });
        try {
            await this.simpleBrowser.startConsoleSession(token, locator, cancelAndDetachId);
        }
        catch (error) {
            throw new Error('Failed to start console session', { cause: error });
        }
        finally {
            disposable.dispose();
        }
    }
    async startDebugSession(token, locator) {
        const cancelAndDetachId = cancelAndDetachIdPool++;
        const onCancelChannel = `vscode:cancelCurrentSession${cancelAndDetachId}`;
        const disposable = token.onCancellationRequested(() => {
            ipcRenderer.send(onCancelChannel, cancelAndDetachId);
            disposable.dispose();
        });
        try {
            await this.simpleBrowser.startDebugSession(token, locator, cancelAndDetachId);
        }
        catch (error) {
            throw new Error('No debug session target found', { cause: error });
        }
        finally {
            disposable.dispose();
        }
    }
    async getElementData(rect, token, locator) {
        if (!locator) {
            return undefined;
        }
        const cancelSelectionId = cancelSelectionIdPool++;
        const onCancelChannel = `vscode:cancelElementSelection${cancelSelectionId}`;
        const disposable = token.onCancellationRequested(() => {
            ipcRenderer.send(onCancelChannel, cancelSelectionId);
        });
        try {
            const elementData = await this.simpleBrowser.getElementData(rect, token, locator, cancelSelectionId);
            return elementData;
        }
        catch (error) {
            disposable.dispose();
            throw new Error(`Native Host: Error getting element data: ${error}`);
        }
        finally {
            disposable.dispose();
        }
    }
    async getFocusedElementData(rect, token, locator) {
        if (!locator) {
            return undefined;
        }
        const cancelSelectionId = cancelSelectionIdPool++;
        const onCancelChannel = `vscode:cancelElementSelection${cancelSelectionId}`;
        const disposable = token.onCancellationRequested(() => {
            ipcRenderer.send(onCancelChannel, cancelSelectionId);
        });
        try {
            return await this.simpleBrowser.getFocusedElementData(rect, token, locator, cancelSelectionId);
        }
        finally {
            disposable.dispose();
        }
    }
};
WorkbenchBrowserElementsService = __decorate([
    __param(0, INativeBrowserElementsService)
], WorkbenchBrowserElementsService);
registerSingleton(IBrowserElementsService, WorkbenchBrowserElementsService, 1 /* InstantiationType.Delayed */);
registerSingleton(INativeBrowserElementsService, WorkbenchNativeBrowserElementsService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlckVsZW1lbnRzU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9icm93c2VyRWxlbWVudHMvZWxlY3Ryb24tYnJvd3Nlci9icm93c2VyRWxlbWVudHNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBZ0IsNkJBQTZCLEVBQXlCLE1BQU0sZ0VBQWdFLENBQUM7QUFFcEosT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRXpGLE9BQU8sRUFBRSxpQkFBaUIsRUFBcUIsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw2RUFBNkUsQ0FBQztBQUUzSCxJQUFNLHFDQUFxQyxHQUEzQyxNQUFNLHFDQUFzQyxTQUFRLDRCQUE0QjtJQUUvRSxZQUNxQyxrQkFBc0QsRUFDckUsa0JBQXVDO1FBRTVELEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFDekQsQ0FBQztDQUNELENBQUE7QUFSSyxxQ0FBcUM7SUFHeEMsV0FBQSxrQ0FBa0MsQ0FBQTtJQUNsQyxXQUFBLG1CQUFtQixDQUFBO0dBSmhCLHFDQUFxQyxDQVExQztBQUVELElBQUkscUJBQXFCLEdBQUcsQ0FBQyxDQUFDO0FBQzlCLElBQUkscUJBQXFCLEdBQUcsQ0FBQyxDQUFDO0FBRTlCLElBQU0sK0JBQStCLEdBQXJDLE1BQU0sK0JB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