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
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { UserDataSyncWorkbenchContribution } from './userDataSync.js';
import { IUserDataAutoSyncService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { isWeb } from '../../../../base/common/platform.js';
import { UserDataSyncTrigger } from './userDataSyncTrigger.js';
import { toAction } from '../../../../base/common/actions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { SHOW_SYNC_LOG_COMMAND_ID } from '../../../services/userDataSync/common/userDataSync.js';
let UserDataSyncReportIssueContribution = class UserDataSyncReportIssueContribution extends Disposable {
    constructor(userDataAutoSyncService, notificationService, productService, commandService, hostService) {
        super();
        this.notificationService = notificationService;
        this.productService = productService;
        this.commandService = commandService;
        this.hostService = hostService;
        this._register(userDataAutoSyncService.onError(error => this.onAutoSyncError(error)));
    }
    onAutoSyncError(error) {
        switch (error.code) {
            case "LocalTooManyRequests" /* UserDataSyncErrorCode.LocalTooManyRequests */: {
                const message = isWeb ? localize({ key: 'local too many requests - reload', comment: ['Settings Sync is the name of the feature'] }, "Settings sync is suspended temporarily because the current device is making too many requests. Please reload {0} to resume.", this.productService.nameLong)
                    : localize({ key: 'local too many requests - restart', comment: ['Settings Sync is the name of the feature'] }, "Settings sync is suspended temporarily because the current device is making too many requests. Please restart {0} to resume.", this.productService.nameLong);
                this.notificationService.notify({
                    severity: Severity.Error,
                    message,
                    actions: {
                        primary: [
                            toAction({
                                id: 'Show Sync Logs',
                                label: localize('show sync logs', "Show Log"),
                                run: () => this.commandService.executeCommand(SHOW_SYNC_LOG_COMMAND_ID)
                            }),
                            toAction({
                                id: 'Restart',
                                label: isWeb ? localize('reload', "Reload") : localize('restart', "Restart"),
                                run: () => this.hostService.restart()
                            })
                        ]
                    }
                });
                return;
            }
            case "RemoteTooManyRequests" /* UserDataSyncErrorCode.TooManyRequests */: {
                const operationId = error.operationId ? localize('operationId', "Operation Id: {0}", error.operationId) : undefined;
                const message = localize({ key: 'server too many requests', comment: ['Settings Sync is the name of the feature'] }, "Settings sync is disabled because the current device is making too many requests. Please wait for 10 minutes and turn on sync.");
                this.notificationService.notify({
                    severity: Severity.Error,
                    message: operationId ? `${message} ${operationId}` : message,
                    source: error.operationId ? localize('settings sync', "Settings Sync. Operation Id: {0}", error.operationId) : undefined,
                    actions: {
                        primary: [
                            toAction({
                                id: 'Show Sync Logs',
                                label: localize('show sync logs', "Show Log"),
                                run: () => this.commandService.executeCommand(SHOW_SYNC_LOG_COMMAND_ID)
                            })
                        ]
                    }
                });
                return;
            }
        }
    }
};
UserDataSyncReportIssueContribution = __decorate([
    __param(0, IUserDataAutoSyncService),
    __param(1, INotificationService),
    __param(2, IProductService),
    __param(3, ICommandService),
    __param(4, IHostService)
], UserDataSyncReportIssueContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncWorkbenchContribution, 3 /* LifecyclePhase.Restored */);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncTrigger, 4 /* LifecyclePhase.Eventually */);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncReportIssueContribution, 4 /* LifecyclePhase.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3VzZXJEYXRhU3luYy9icm93c2VyL3VzZXJEYXRhU3luYy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFtQyxVQUFVLElBQUksbUJBQW1CLEVBQTBCLE1BQU0sa0NBQWtDLENBQUM7QUFDOUksT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRTVFLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3RFLE9BQU8sRUFBRSx3QkFBd0IsRUFBNEMsTUFBTSwwREFBMEQsQ0FBQztBQUM5SSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRWpHLElBQU0sbUNBQW1DLEdBQXpDLE1B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