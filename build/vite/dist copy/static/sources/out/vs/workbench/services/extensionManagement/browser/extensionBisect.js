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
var ExtensionBisectService_1, ExtensionBisectUi_1;
import { localize, localize2 } from '../../../../nls.js';
import { IExtensionManagementService, IGlobalExtensionEnablementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { isResolverExtension } from '../../../../platform/extensions/common/extensions.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INotificationService, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IHostService } from '../../host/browser/host.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../common/contributions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IWorkbenchExtensionEnablementService } from '../common/extensionManagement.js';
// --- bisect service
export const IExtensionBisectService = createDecorator('IExtensionBisectService');
class BisectState {
    static fromJSON(raw) {
        if (!raw) {
            return undefined;
        }
        try {
            const data = JSON.parse(raw);
            return new BisectState(data.extensions, data.low, data.high, data.mid);
        }
        catch {
            return undefined;
        }
    }
    constructor(extensions, low, high, mid = ((low + high) / 2) | 0) {
        this.extensions = extensions;
        this.low = low;
        this.high = high;
        this.mid = mid;
    }
}
let ExtensionBisectService = class ExtensionBisectService {
    static { ExtensionBisectService_1 = this; }
    static { this._storageKey = 'extensionBisectState'; }
    constructor(logService, _storageService, _envService) {
        this._storageService = _storageService;
        this._envService = _envService;
        this._disabled = new Map();
        const raw = _storageService.get(ExtensionBisectService_1._storageKey, -1 /* StorageScope.APPLICATION */);
        this._state = BisectState.fromJSON(raw);
        if (this._state) {
            const { mid, high } = this._state;
            for (let i = 0; i < this._state.extensions.length; i++) {
                const isDisabled = i >= mid && i < high;
                this._disabled.set(this._state.extensions[i], isDisabled);
            }
            logService.warn('extension BISECT active', [...this._disabled]);
        }
    }
    get isActive() {
        return !!this._state;
    }
    get disabledCount() {
        return this._state ? this._state.high - this._state.mid : -1;
    }
    isDisabledByBisect(extension) {
        if (!this._state) {
            // bisect isn't active
            return false;
        }
        if (isResolverExtension(extension.manifest, this._envService.remoteAuthority)) {
            // the current remote resolver extension cannot be disabled
            return false;
        }
        if (this._isEnabledInEnv(extension)) {
            // Extension enabled in env cannot be disabled
            return false;
        }
        const disabled = this._disabled.get(extension.identifier.id);
        return disabled ?? false;
    }
    _isEnabledInEnv(extension) {
        return Array.isArray(this._envService.enableExtensions) && this._envService.enableExtensions.some(id => areSameExtensions({ id }, extension.identifier));
    }
    async start(extensions) {
        if (this._state) {
            throw new Error('invalid state');
        }
        const extensionIds = extensions.map(ext => ext.identifier.id);
        const newState = new BisectState(extensionIds, 0, extensionIds.length, 0);
        this._storageService.store(ExtensionBisectService_1._storageKey, JSON.stringify(newState), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        await this._storageService.flush();
    }
    async next(seeingBad) {
        if (!this._state) {
            throw new Error('invalid state');
        }
        // check if bad when all extensions are disabled
        if (seeingBad && this._state.mid === 0 && this._state.high === this._state.extensions.length) {
            return { bad: true, id: '' };
        }
        // check if there is only one left
        if (this._state.low === this._state.high - 1) {
            await this.reset();
            return { id: this._state.extensions[this._state.low], bad: seeingBad };
        }
        // the second half is disabled so if there is still bad it must be
        // in the first half
        const nextState = new BisectState(this._state.extensions, seeingBad ? this._state.low : this._state.mid, seeingBad ? this._state.mid : this._state.high);
        this._storageService.store(ExtensionBisectService_1._storageKey, JSON.stringify(nextState), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        await this._storageService.flush();
        return undefined;
    }
    async reset() {
        this._storageService.remove(ExtensionBisectService_1._storageKey, -1 /* StorageScope.APPLICATION */);
        await this._storageService.flush();
    }
};
ExtensionBisectService = ExtensionBisectService_1 = __decorate([
    __param(0, ILogService),
    __param(1, IStorageService),
    __param(2, IWorkbenchEnvironmentService)
], ExtensionBisectService);
registerSingleton(IExtensionBisectService, ExtensionBisectService, 1 /* InstantiationType.Delayed */);
// --- bisect UI
let ExtensionBisectUi = class ExtensionBisectUi {
    static { ExtensionBisectUi_1 = this; }
    static { this.ctxIsBisectActive = new RawContextKey('isExtensionBisectActive', false); }
    constructor(contextKeyService, _extensionBisectService, _notificationService, _commandService) {
        this._extensionBisectService = _extensionBisectService;
        this._notificationService = _notificationService;
        this._commandService = _commandService;
        if (_extensionBisectService.isActive) {
            ExtensionBisectUi_1.ctxIsBisectActive.bindTo(contextKeyService).set(true);
            this._showBisectPrompt();
        }
    }
    _showBisectPrompt() {
        const goodPrompt = {
            label: localize('I cannot reproduce', "I can't reproduce"),
            run: () => this._commandService.executeCommand('extension.bisect.next', false)
        };
        const badPrompt = {
            label: localize('This is Bad', "I can reproduce"),
            run: () => this._commandService.executeCommand('extension.bisect.next', true)
        };
        const stop = {
            label: 'Stop Bisect',
            run: () => this._commandService.executeCommand('extension.bisect.stop')
        };
        const message = this._extensionBisectService.disabledCount === 1
            ? localize('bisect.singular', "Extension Bisect is active and has disabled 1 extension. Check if you can still reproduce the problem and proceed by selecting from these options.")
            : localize('bisect.plural', "Extension Bisect is active and has disabled {0} extensions. Check if you can still reproduce the problem and proceed by selecting from these options.", this._extensionBisectService.disabledCount);
        this._notificationService.prompt(Severity.Info, message, [goodPrompt, badPrompt, stop], { sticky: true, priority: NotificationPriority.URGENT });
    }
};
ExtensionBisectUi = ExtensionBisectUi_1 = __decorate([
    __param(0, IContextKeyService),
    __param(1, IExtensionBisectService),
    __param(2, INotificationService),
    __param(3, ICommandService)
], ExtensionBisectUi);
Registry.as(Extensions.Workbench).registerWorkbenchContribution(ExtensionBisectUi, 3 /* LifecyclePhase.Restored */);
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'extension.bisect.start',
            title: localize2('title.start', 'Start Extension Bisect'),
            category: Categories.Help,
            f1: true,
            precondition: ExtensionBisectUi.ctxIsBisectActive.negate(),
            menu: {
                id: MenuId.ViewContainerTitle,
                when: ContextKeyExpr.equals('viewContainer', 'workbench.view.extensions'),
                group: '2_enablement',
                order: 4
            }
        });
    }
    async run(accessor) {
        const dialogService = accessor.get(IDialogService);
        const hostService = accessor.get(IHostService);
        const extensionManagement = accessor.get(IExtensionManagementService);
        const extensionEnablementService = accessor.get(IWorkbenchExtensionEnablementService);
        const extensionsBisect = accessor.get(IExtensionBisectService);
        const extensions = (await extensionManagement.getInstalled(1 /* ExtensionType.User */)).filter(ext => extensionEnablementService.isEnabled(ext));
        const res = await dialogService.confirm({
            message: localize('msg.start', "Extension Bisect"),
            detail: localize('detail.start', "Extension Bisect will use binary search to find an extension that causes a problem. During the process the window reloads repeatedly (~{0} times). Each time you must confirm if you are still seeing problems.", 2 + Math.log2(extensions.length) | 0),
            primaryButton: localize({ key: 'msg2', comment: ['&& denotes a mnemonic'] }, "&&Start Extension Bisect")
        });
        if (res.confirmed) {
            await extensionsBisect.start(extensions);
            hostService.reload();
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'extension.bisect.next',
            title: localize2('title.isBad', 'Continue Extension Bisect'),
            category: Categories.Help,
            f1: true,
            precondition: ExtensionBisectUi.ctxIsBisectActive
        });
    }
    async run(accessor, seeingBad) {
        const dialogService = accessor.get(IDialogService);
        const hostService = accessor.get(IHostService);
        const bisectService = accessor.get(IExtensionBisectService);
        const productService = accessor.get(IProductService);
        const extensionEnablementService = accessor.get(IGlobalExtensionEnablementService);
        const commandService = accessor.get(ICommandService);
        if (!bisectService.isActive) {
            return;
        }
        if (seeingBad === undefined) {
            const goodBadStopCancel = await this._checkForBad(dialogService, bisectService);
            if (goodBadStopCancel === null) {
                return;
            }
            seeingBad = goodBadStopCancel;
        }
        if (seeingBad === undefined) {
            await bisectService.reset();
            hostService.reload();
            return;
        }
        const done = await bisectService.next(seeingBad);
        if (!done) {
            hostService.reload();
            return;
        }
        if (done.bad) {
            // DONE but nothing found
            await dialogService.info(localize('done.msg', "Extension Bisect"), localize('done.detail2', "Extension Bisect is done but no extension has been identified. This might be a problem with {0}.", productService.nameShort));
        }
        else {
            // DONE and identified extension
            const res = await dialogService.confirm({
                type: Severity.Info,
                message: localize('done.msg', "Extension Bisect"),
                primaryButton: localize({ key: 'report', comment: ['&& denotes a mnemonic'] }, "&&Report Issue & Continue"),
                cancelButton: localize('continue', "Continue"),
                detail: localize('done.detail', "Extension Bisect is done and has identified {0} as the extension causing the problem.", done.id),
                checkbox: { label: localize('done.disbale', "Keep this extension disabled"), checked: true }
            });
            if (res.checkboxChecked) {
                await extensionEnablementService.disableExtension({ id: done.id }, undefined);
            }
            if (res.confirmed) {
                await commandService.executeCommand('workbench.action.openIssueReporter', done.id);
            }
        }
        await bisectService.reset();
        hostService.reload();
    }
    async _checkForBad(dialogService, bisectService) {
        const { result } = await dialogService.prompt({
            type: Severity.Info,
            message: localize('msg.next', "Extension Bisect"),
            detail: localize('bisect', "Extension Bisect is active and has disabled {0} extensions. Check if you can still reproduce the problem and proceed by selecting from these options.", bisectService.disabledCount),
            buttons: [
                {
                    label: localize({ key: 'next.good', comment: ['&& denotes a mnemonic'] }, "I ca&&n't reproduce"),
                    run: () => false // good now
                },
                {
                    label: localize({ key: 'next.bad', comment: ['&& denotes a mnemonic'] }, "I can &&reproduce"),
                    run: () => true // bad
                },
                {
                    label: localize({ key: 'next.stop', comment: ['&& denotes a mnemonic'] }, "&&Stop Bisect"),
                    run: () => undefined // stop
                }
            ],
            cancelButton: {
                label: localize({ key: 'next.cancel', comment: ['&& denotes a mnemonic'] }, "&&Cancel Bisect"),
                run: () => null // cancel
            }
        });
        return result;
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'extension.bisect.stop',
            title: localize2('title.stop', 'Stop Extension Bisect'),
            category: Categories.Help,
            f1: true,
            precondition: ExtensionBisectUi.ctxIsBisectActive
        });
    }
    async run(accessor) {
        const extensionsBisect = accessor.get(IExtensionBisectService);
        const hostService = accessor.get(IHostService);
        await extensionsBisect.reset();
        hostService.reload();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uQmlzZWN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvYnJvd3Nlci9leHRlbnNpb25CaXNlY3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLDJCQUEyQixFQUFFLGlDQUFpQyxFQUFtQixNQUFNLHdFQUF3RSxDQUFDO0FBQ3pLLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUE2QixtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RILE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsb0JBQW9CLEVBQWlCLG9CQUFvQixFQUFFLFFBQVEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQy9JLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsZUFBZSxFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDekgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRWhGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFtQyxNQUFNLGtDQUFrQyxDQUFDO0FBQy9GLE9BQU8sRUFB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