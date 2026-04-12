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
import { IExtensionsWorkbenchService } from '../common/extensions.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { MenuRegistry, MenuId } from '../../../../platform/actions/common/actions.js';
import { localize } from '../../../../nls.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { Action } from '../../../../base/common/actions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Promises } from '../../../../base/common/async.js';
let ExtensionDependencyChecker = class ExtensionDependencyChecker extends Disposable {
    constructor(extensionService, extensionsWorkbenchService, notificationService, hostService) {
        super();
        this.extensionService = extensionService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.notificationService = notificationService;
        this.hostService = hostService;
        CommandsRegistry.registerCommand('workbench.extensions.installMissingDependencies', () => this.installMissingDependencies());
        MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
            command: {
                id: 'workbench.extensions.installMissingDependencies',
                category: localize('extensions', "Extensions"),
                title: localize('auto install missing deps', "Install Missing Dependencies")
            }
        });
    }
    async getUninstalledMissingDependencies() {
        const allMissingDependencies = await this.getAllMissingDependencies();
        const localExtensions = await this.extensionsWorkbenchService.queryLocal();
        return allMissingDependencies.filter(id => localExtensions.every(l => !areSameExtensions(l.identifier, { id })));
    }
    async getAllMissingDependencies() {
        await this.extensionService.whenInstalledExtensionsRegistered();
        const runningExtensionsIds = this.extensionService.extensions.reduce((result, r) => { result.add(r.identifier.value.toLowerCase()); return result; }, new Set());
        const missingDependencies = new Set();
        for (const extension of this.extensionService.extensions) {
            if (extension.extensionDependencies) {
                extension.extensionDependencies.forEach(dep => {
                    if (!runningExtensionsIds.has(dep.toLowerCase())) {
                        missingDependencies.add(dep);
                    }
                });
            }
        }
        return [...missingDependencies.values()];
    }
    async installMissingDependencies() {
        const missingDependencies = await this.getUninstalledMissingDependencies();
        if (missingDependencies.length) {
            const extensions = await this.extensionsWorkbenchService.getExtensions(missingDependencies.map(id => ({ id })), CancellationToken.None);
            if (extensions.length) {
                await Promises.settled(extensions.map(extension => this.extensionsWorkbenchService.install(extension)));
                this.notificationService.notify({
                    severity: Severity.Info,
                    message: localize('finished installing missing deps', "Finished installing missing dependencies. Please reload the window now."),
                    actions: {
                        primary: [new Action('realod', localize('reload', "Reload Window"), '', true, () => this.hostService.reload())]
                    }
                });
            }
        }
        else {
            this.notificationService.info(localize('no missing deps', "There are no missing dependencies to install."));
        }
    }
};
ExtensionDependencyChecker = __decorate([
    __param(0, IExtensionService),
    __param(1, IExtensionsWorkbenchService),
    __param(2, INotificationService),
    __param(3, IHostService)
], ExtensionDependencyChecker);
export { ExtensionDependencyChecker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc0RlcGVuZGVuY3lDaGVja2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNEZXBlbmRlbmN5Q2hlY2tlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUV0RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0RUFBNEUsQ0FBQztBQUMvRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXJELElBQU0sMEJBQTBCLEdBQWhDLE1BQU0sMEJBQTJCLFNBQVEsVUFBVTtJQUV6RCxZQUNxQyxnQkFBbUMsRUFDekIsMEJBQXVELEVBQzlELG1CQUF5QyxFQUNqRCxXQUF5QjtRQUV4RCxLQUFL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