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
import { localize } from '../../../../nls.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { BrowserClipboardService as BaseBrowserClipboardService } from '../../../../platform/clipboard/browser/clipboardService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
let BrowserClipboardService = class BrowserClipboardService extends BaseBrowserClipboardService {
    constructor(notificationService, openerService, environmentService, logService, layoutService) {
        super(layoutService, logService);
        this.notificationService = notificationService;
        this.openerService = openerService;
        this.environmentService = environmentService;
    }
    async writeText(text, type) {
        this.logService.trace('BrowserClipboardService#writeText called with type:', type, ' with text.length:', text.length);
        if (!!this.environmentService.extensionTestsLocationURI && typeof type !== 'string') {
            type = 'vscode-tests'; // force in-memory clipboard for tests to avoid permission issues
        }
        this.logService.trace('BrowserClipboardService#super.writeText');
        return super.writeText(text, type);
    }
    async readText(type) {
        this.logService.trace('BrowserClipboardService#readText called with type:', type);
        if (!!this.environmentService.extensionTestsLocationURI && typeof type !== 'string') {
            type = 'vscode-tests'; // force in-memory clipboard for tests to avoid permission issues
        }
        if (type) {
            this.logService.trace('BrowserClipboardService#super.readText');
            return super.readText(type);
        }
        try {
            const readText = await getActiveWindow().navigator.clipboard.readText();
            this.logService.trace('BrowserClipboardService#readText with readText.length:', readText.length);
            return readText;
        }
        catch (error) {
            return new Promise(resolve => {
                // Inform user about permissions problem (https://github.com/microsoft/vscode/issues/112089)
                const listener = new DisposableStore();
                const handle = this.notificationService.prompt(Severity.Error, localize('clipboardError', "Unable to read from the browser's clipboard. Please make sure you have granted access for this website to read from the clipboard."), [{
                        label: localize('retry', "Retry"),
                        run: async () => {
                            listener.dispose();
                            resolve(await this.readText(type));
                        }
                    }, {
                        label: localize('learnMore', "Learn More"),
                        run: () => this.openerService.open('https://go.microsoft.com/fwlink/?linkid=2151362')
                    }], {
                    sticky: true
                });
                // Always resolve the promise once the notification closes
                listener.add(Event.once(handle.onDidClose)(() => resolve('')));
            });
        }
    }
};
BrowserClipboardService = __decorate([
    __param(0, INotificationService),
    __param(1, IOpenerService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, ILogService),
    __param(4, ILayoutService)
], BrowserClipboardService);
export { BrowserClipboardService };
registerSingleton(IClipboardService, BrowserClipboardService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpcGJvYXJkU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jbGlwYm9hcmQvYnJvd3Nlci9jbGlwYm9hcmRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLHVCQUF1QixJQUFJLDJCQUEyQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDcEksT0FBTyxFQUFFLG9CQUFvQixFQUFFLFFBQVEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTNELElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXdCLFNBQVEsMkJBQTJCO0lBRXZFLFlBQ3dDLG1CQUF5QyxFQUMvQyxhQUE2QixFQUNmLGtCQUFnRCxFQUNsRixVQUF1QixFQUNwQixhQUE2QjtRQUU3QyxLQUFLLENBQUMsYUFB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