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
var RemoteStartEntry_1;
import * as nls from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
export const showStartEntryInWeb = new RawContextKey('showRemoteStartEntryInWeb', false);
let RemoteStartEntry = class RemoteStartEntry extends Disposable {
    static { RemoteStartEntry_1 = this; }
    static { this.REMOTE_WEB_START_ENTRY_ACTIONS_COMMAND_ID = 'workbench.action.remote.showWebStartEntryActions'; }
    constructor(commandService, productService, extensionManagementService, extensionEnablementService, telemetryService, contextKeyService) {
        super();
        this.commandService = commandService;
        this.productService = productService;
        this.extensionManagementService = extensionManagementService;
        this.extensionEnablementService = extensionEnablementService;
        this.telemetryService = telemetryService;
        this.contextKeyService = contextKeyService;
        const remoteExtensionTips = this.productService.remoteExtensionTips?.['tunnel'];
        this.startCommand = remoteExtensionTips?.startEntry?.startCommand ?? '';
        this.remoteExtensionId = remoteExtensionTips?.extensionId ?? '';
        this._init();
        this.registerActions();
        this.registerListeners();
    }
    registerActions() {
        const category = nls.localize2('remote.category', "Remote");
        // Show Remote Start Action
        const startEntry = this;
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: RemoteStartEntry_1.REMOTE_WEB_START_ENTRY_ACTIONS_COMMAND_ID,
                    category,
                    title: nls.localize2('remote.showWebStartEntryActions', "Show Remote Start Entry for web"),
                    f1: false
                });
            }
            async run() {
                await startEntry.showWebRemoteStartActions();
            }
        }));
    }
    registerListeners() {
        this._register(this.extensionEnablementService.onEnablementChanged(async (result) => {
            for (const ext of result) {
                if (ExtensionIdentifier.equals(this.remoteExtensionId, ext.identifier.id)) {
                    if (this.extensionEnablementService.isEnabled(ext)) {
                        showStartEntryInWeb.bindTo(this.contextKeyService).set(true);
                    }
                    else {
                        showStartEntryInWeb.bindTo(this.contextKeyService).set(false);
                    }
                }
            }
        }));
    }
    async _init() {
        // Check if installed and enabled
        const installed = (await this.extensionManagementService.getInstalled()).find(value => ExtensionIdentifier.equals(value.identifier.id, this.remoteExtensionId));
        if (installed) {
            if (this.extensionEnablementService.isEnabled(installed)) {
                showStartEntryInWeb.bindTo(this.contextKeyService).set(true);
            }
        }
    }
    async showWebRemoteStartActions() {
        this.commandService.executeCommand(this.startCommand);
        this.telemetryService.publicLog2('workbenchActionExecuted', {
            id: this.startCommand,
            from: 'remote start entry'
        });
    }
};
RemoteStartEntry = RemoteStartEntry_1 = __decorate([
    __param(0, ICommandService),
    __param(1, IProductService),
    __param(2, IExtensionManagementService),
    __param(3, IWorkbenchExtensionEnablementService),
    __param(4, ITelemetryService),
    __param(5, IContextKeyService)
], RemoteStartEntry);
export { RemoteStartEntry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlU3RhcnRFbnRyeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9icm93c2VyL3JlbW90ZVN0YXJ0RW50cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUNySCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUMzSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFHekcsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxhQUFhLENBQVUsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDM0YsSUFBTSxnQkFBZ0IsR0FBdEIsTUFBTSxnQkFBaUIsU0FBUSxVQUFVOzthQUV2Qiw4Q0FBeUMsR0FBRyxrREFBa0QsQUFBckQsQ0FBc0Q7SUFLdkgsWUFDbUMsY0FBK0IsRUFDL0IsY0FBK0IsRUFDbkIsMEJBQXVELEVBQzlDLDBCQUFnRSxFQUNuRixnQkFBbUMsRUFD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