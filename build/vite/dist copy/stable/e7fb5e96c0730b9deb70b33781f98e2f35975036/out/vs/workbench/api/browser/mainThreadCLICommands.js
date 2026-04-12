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
import { Schemas } from '../../../base/common/network.js';
import { isWeb } from '../../../base/common/platform.js';
import { isString } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../platform/commands/common/commands.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionManagementCLI } from '../../../platform/extensionManagement/common/extensionManagementCLI.js';
import { getExtensionId } from '../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { AbstractMessageLogger } from '../../../platform/log/common/log.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { IExtensionManagementServerService } from '../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../services/extensions/common/extensionManifestPropertiesService.js';
// this class contains the commands that the CLI server is reying on
CommandsRegistry.registerCommand('_remoteCLI.openExternal', function (accessor, uri) {
    const openerService = accessor.get(IOpenerService);
    return openerService.open(isString(uri) ? uri : URI.revive(uri), { openExternal: true, allowTunneling: true });
});
CommandsRegistry.registerCommand('_remoteCLI.windowOpen', function (accessor, toOpen, options) {
    const commandService = accessor.get(ICommandService);
    if (!toOpen.length) {
        return commandService.executeCommand('_files.newWindow', options);
    }
    return commandService.executeCommand('_files.windowOpen', toOpen, options);
});
CommandsRegistry.registerCommand('_remoteCLI.getSystemStatus', function (accessor) {
    const commandService = accessor.get(ICommandService);
    return commandService.executeCommand('_issues.getSystemStatus');
});
CommandsRegistry.registerCommand('_remoteCLI.manageExtensions', async function (accessor, args) {
    const instantiationService = accessor.get(IInstantiationService);
    const extensionManagementServerService = accessor.get(IExtensionManagementServerService);
    const remoteExtensionManagementService = extensionManagementServerService.remoteExtensionManagementServer?.extensionManagementService;
    if (!remoteExtensionManagementService) {
        return;
    }
    const lines = [];
    const logger = new class extends AbstractMessageLogger {
        log(level, message) {
            lines.push(message);
        }
    }();
    const childInstantiationService = instantiationService.createChild(new ServiceCollection([IExtensionManagementService, remoteExtensionManagementService]));
    try {
        const cliService = childInstantiationService.createInstance(RemoteExtensionManagementCLI, logger);
        if (args.list) {
            await cliService.listExtensions(!!args.list.showVersions, args.list.category, undefined);
        }
        else {
            const revive = (inputs) => inputs.map(input => isString(input) ? input : URI.revive(input));
            if (Array.isArray(args.install) && args.install.length) {
                try {
                    await cliService.installExtensions(revive(args.install), [], { isMachineScoped: true }, !!args.force);
                }
                catch (e) {
                    lines.push(e.message);
                }
            }
            if (Array.isArray(args.uninstall) && args.uninstall.length) {
                try {
                    await cliService.uninstallExtensions(revive(args.uninstall), !!args.force, undefined);
                }
                catch (e) {
                    lines.push(e.message);
                }
            }
        }
        return lines.join('\n');
    }
    finally {
        childInstantiationService.dispose();
    }
});
let RemoteExtensionManagementCLI = class RemoteExtensionManagementCLI extends ExtensionManagementCLI {
    constructor(logger, extensionManagementService, extensionGalleryService, labelService, envService, _extensionManifestPropertiesService, productService) {
        super([], logger, extensionManagementService, extensionGalleryService, productService);
        this._extensionManifestPropertiesService = _extensionManifestPropertiesService;
        const remoteAuthority = envService.remoteAuthority;
        this._location = remoteAuthority ? labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority) : undefined;
    }
    get location() {
        return this._location;
    }
    validateExtensionKind(manifest) {
        if (!this._extensionManifestPropertiesService.canExecuteOnWorkspace(manifest)
            // Web extensions installed on remote can be run in web worker extension host
            && !(isWeb && this._extensionManifestPropertiesService.canExecuteOnWeb(manifest))) {
            this.logger.info(localize('cannot be installed', "Cannot install the '{0}' extension because it is declared to not run in this setup.", getExtensionId(manifest.publisher, manifest.name)));
            return false;
        }
        return true;
    }
};
RemoteExtensionManagementCLI = __decorate([
    __param(1, IExtensionManagementService),
    __param(2, IExtensionGalleryService),
    __param(3, ILabelService),
    __param(4, IWorkbenchEnvironmentService),
    __param(5, IExtensionManifestPropertiesService),
    __param(6, IProductService)
], RemoteExtensionManagementCLI);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENMSUNvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRDTElDb21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLDJCQUEyQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUksT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFDaEgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBRXpHLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSx5REFBeUQsQ0FBQztBQUNsSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHFCQUFxQixFQUFxQixNQUFNLHFDQUFxQyxDQUFDO0FBQy9GLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFckYs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