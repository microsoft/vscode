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
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { URI } from '../../../../base/common/uri.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ITerminalGroupService, ITerminalService as IIntegratedTerminalService } from '../../terminal/browser/terminal.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { getMultiSelectedResources, IExplorerService } from '../../files/browser/files.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { Schemas } from '../../../../base/common/network.js';
import { distinct } from '../../../../base/common/arrays.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import { dirname, basename } from '../../../../base/common/path.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IExternalTerminalService } from '../../../../platform/externalTerminal/common/externalTerminal.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
const OPEN_IN_TERMINAL_COMMAND_ID = 'openInTerminal';
const OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID = 'openInIntegratedTerminal';
function registerOpenTerminalCommand(id, explorerKind) {
    CommandsRegistry.registerCommand({
        id: id,
        handler: async (accessor, resource) => {
            const configurationService = accessor.get(IConfigurationService);
            const fileService = accessor.get(IFileService);
            const integratedTerminalService = accessor.get(IIntegratedTerminalService);
            const remoteAgentService = accessor.get(IRemoteAgentService);
            const terminalGroupService = accessor.get(ITerminalGroupService);
            let externalTerminalService = undefined;
            try {
                externalTerminalService = accessor.get(IExternalTerminalService);
            }
            catch { }
            const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
            return fileService.resolveAll(resources.map(r => ({ resource: r }))).then(async (stats) => {
                // Always use integrated terminal when using a remote
                const config = configurationService.getValue();
                const useIntegratedTerminal = remoteAgentService.getConnection() || explorerKind === 'integrated';
                const targets = distinct(stats.filter(data => data.success));
                if (useIntegratedTerminal) {
                    // TODO: Use uri for cwd in createterminal
                    const opened = {};
                    const cwds = targets.map(({ stat }) => {
                        const resource = stat.resource;
                        if (stat.isDirectory) {
                            return resource;
                        }
                        return URI.from({
                            scheme: resource.scheme,
                            authority: resource.authority,
                            fragment: resource.fragment,
                            query: resource.query,
                            path: dirname(resource.path)
                        });
                    });
                    for (const cwd of cwds) {
                        if (opened[cwd.path]) {
                            return;
                        }
                        opened[cwd.path] = true;
                        const instance = await integratedTerminalService.createTerminal({ config: { cwd } });
                        if (instance && instance.target !== TerminalLocation.Editor && (resources.length === 1 || !resource || cwd.path === resource.path || cwd.path === dirname(resource.path))) {
                            integratedTerminalService.setActiveInstance(instance);
                            terminalGroupService.showPanel(true);
                        }
                    }
                }
                else if (externalTerminalService) {
                    distinct(targets.map(({ stat }) => stat.isDirectory ? stat.resource.fsPath : dirname(stat.resource.fsPath))).forEach(cwd => {
                        externalTerminalService.openTerminal(config.terminal.external, cwd);
                    });
                }
            });
        }
    });
}
registerOpenTerminalCommand(OPEN_IN_TERMINAL_COMMAND_ID, 'external');
registerOpenTerminalCommand(OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID, 'integrated');
let ExternalTerminalContribution = class ExternalTerminalContribution extends Disposable {
    constructor(_configurationService) {
        super();
        this._configurationService = _configurationService;
        const shouldShowIntegratedOnLocal = ContextKeyExpr.and(ResourceContextKey.Scheme.isEqualTo(Schemas.file), ContextKeyExpr.or(ContextKeyExpr.equals('config.terminal.explorerKind', 'integrated'), ContextKeyExpr.equals('config.terminal.explorerKind', 'both')));
        const shouldShowExternalKindOnLocal = ContextKeyExpr.and(ResourceContextKey.Scheme.isEqualTo(Schemas.file), ContextKeyExpr.or(ContextKeyExpr.equals('config.terminal.explorerKind', 'external'), ContextKeyExpr.equals('config.terminal.explorerKind', 'both')));
        this._openInIntegratedTerminalMenuItem = {
            group: 'navigation',
            order: 30,
            command: {
                id: OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID,
                title: nls.localize('scopedConsoleAction.Integrated', "Open in Integrated Terminal")
            },
            when: ContextKeyExpr.or(shouldShowIntegratedOnLocal, ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote))
        };
        this._openInTerminalMenuItem = {
            group: 'navigation',
            order: 31,
            command: {
                id: OPEN_IN_TERMINAL_COMMAND_ID,
                title: nls.localize('scopedConsoleAction.external', "Open in External Terminal")
            },
            when: shouldShowExternalKindOnLocal
        };
        MenuRegistry.appendMenuItem(MenuId.ExplorerContext, this._openInTerminalMenuItem);
        MenuRegistry.appendMenuItem(MenuId.ExplorerContext, this._openInIntegratedTerminalMenuItem);
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('terminal.explorerKind') || e.affectsConfiguration('terminal.external')) {
                this._refreshOpenInTerminalMenuItemTitle();
            }
        }));
        this._refreshOpenInTerminalMenuItemTitle();
    }
    isWindows() {
        const config = this._configurationService.getValue().terminal;
        if (isWindows && config.external?.windowsExec) {
            const file = basename(config.external.windowsExec);
            if (file === 'wt' || file === 'wt.exe') {
                return true;
            }
        }
        return false;
    }
    _refreshOpenInTerminalMenuItemTitle() {
        if (this.isWindows()) {
            this._openInTerminalMenuItem.command.title = nls.localize('scopedConsoleAction.wt', "Open in Windows Terminal");
        }
    }
};
ExternalTerminalContribution = __decorate([
    __param(0, IConfigurationService)
], ExternalTerminalContribution);
export { ExternalTerminalContribution };
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ExternalTerminalContribution, 3 /* LifecyclePhase.Restored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxUZXJtaW5hbC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlcm5hbFRlcm1pbmFsL2Jyb3dzZXIvZXh0ZXJuYWxUZXJtaW5hbC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQWEsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsZ0JBQWdCLElBQUksMEJBQTBCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMzSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLGdCQUFnQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDM0YsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDcEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUEyRCxVQUFVLElBQUksbUJBQW1CLEVBQUUs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