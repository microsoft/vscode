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
var MainThreadProgress_1;
import { IProgressService } from '../../../platform/progress/common/progress.js';
import { MainContext, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { localize } from '../../../nls.js';
import { onUnexpectedExternalError } from '../../../base/common/errors.js';
import { toAction } from '../../../base/common/actions.js';
import { NotificationPriority } from '../../../platform/notification/common/notification.js';
let MainThreadProgress = class MainThreadProgress {
    static { MainThreadProgress_1 = this; }
    static { this.URGENT_PROGRESS_SOURCES = [
        'vscode.github-authentication',
        'vscode.microsoft-authentication'
    ]; }
    constructor(extHostContext, progressService, _commandService) {
        this._commandService = _commandService;
        this._progress = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostProgress);
        this._progressService = progressService;
    }
    dispose() {
        this._progress.forEach(handle => handle.resolve());
        this._progress.clear();
    }
    async $startProgress(handle, options, extensionId) {
        const task = this._createTask(handle);
        if (options.location === 15 /* ProgressLocation.Notification */ && extensionId) {
            const sourceIsUrgent = MainThreadProgress_1.URGENT_PROGRESS_SOURCES.includes(extensionId);
            const notificationOptions = {
                ...options,
                priority: sourceIsUrgent ? NotificationPriority.URGENT : NotificationPriority.DEFAULT,
                location: 15 /* ProgressLocation.Notification */,
                secondaryActions: [toAction({
                        id: extensionId,
                        label: localize('manageExtension', "Manage Extension"),
                        run: () => this._commandService.executeCommand('_extensions.manage', extensionId)
                    })]
            };
            options = notificationOptions;
        }
        try {
            this._progressService.withProgress(options, task, () => this._proxy.$acceptProgressCanceled(handle));
        }
        catch (err) {
            // the withProgress-method will throw synchronously when invoked with bad options
            // which is then an enternal/extension error
            onUnexpectedExternalError(err);
        }
    }
    $progressReport(handle, message) {
        const entry = this._progress.get(handle);
        entry?.progress.report(message);
    }
    $progressEnd(handle) {
        const entry = this._progress.get(handle);
        if (entry) {
            entry.resolve();
            this._progress.delete(handle);
        }
    }
    _createTask(handle) {
        return (progress) => {
            return new Promise(resolve => {
                this._progress.set(handle, { resolve, progress });
            });
        };
    }
};
MainThreadProgress = MainThreadProgress_1 = __decorate([
    extHostNamedCustomer(MainContext.MainThreadProgress),
    __param(1, IProgressService),
    __param(2, ICommandService)
], MainThreadProgress);
export { MainThreadProgress };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFByb2dyZXNzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRQcm9ncmVzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFhLGdCQUFnQixFQUFtRixNQUFNLCtDQUErQyxDQUFDO0FBQzdLLE9BQU8sRUFBMkIsV0FBVyxFQUF3QixjQUFjLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMzSCxPQUFPLEVBQUUsb0JBQW9CLEVBQW1CLE1BQU0sc0RBQXNELENBQUM7QUFDN0csT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDM0QsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFHdEYsSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBa0I7O2FBRU4sNEJBQXVCLEdBQUc7UUFDakQsOEJBQThCO1FBQzlCLGlDQUFpQztLQUNqQyxBQUg4QyxDQUc3QztJQU1GLFlBQ0MsY0FBK0IsRUFDYixlQUFpQyxFQUNsQyxlQUFpRDtRQUFoQyxvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFOM0QsY0FBUyxHQUFHLElBQUksR0FBRyxFQUF1RSxDQUFDO1FBUWxHLElBQUksQ0FBQyxNQUFNLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDdEUsSUFBSSxDQUFDLGdCQUFnQixHQUFHLGVBQWUsQ0FBQztJQUN6QyxDQUFDO0lBRUQs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