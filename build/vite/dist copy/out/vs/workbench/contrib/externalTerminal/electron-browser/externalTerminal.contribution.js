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
import * as paths from '../../../../base/common/path.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Schemas } from '../../../../base/common/network.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IExternalTerminalService } from '../../../../platform/externalTerminal/electron-browser/externalTerminalService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TerminalContextKeys } from '../../terminal/common/terminalContextKey.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
const OPEN_NATIVE_CONSOLE_COMMAND_ID = 'workbench.action.terminal.openNativeConsole';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: OPEN_NATIVE_CONSOLE_COMMAND_ID,
    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 33 /* KeyCode.KeyC */,
    when: TerminalContextKeys.notFocus,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    handler: async (accessor) => {
        const historyService = accessor.get(IHistoryService);
        // Open external terminal in local workspaces
        const terminalService = accessor.get(IExternalTerminalService);
        const configurationService = accessor.get(IConfigurationService);
        const remoteAuthorityResolverService = accessor.get(IRemoteAuthorityResolverService);
        const workspaceContextService = accessor.get(IWorkspaceContextService);
        const quickInputService = accessor.get(IQuickInputService);
        const labelService = accessor.get(ILabelService);
        const config = configurationService.getValue('terminal.external');
        // When there are multiple workspace folders, let the user pick one
        const folders = workspaceContextService.getWorkspace().folders;
        let root;
        if (folders.length > 1) {
            const folderPicks = folders.map(folder => ({
                label: folder.name,
                description: labelService.getUriLabel(folder.uri, { relative: true })
            }));
            const pick = await quickInputService.pick(folderPicks, {
                placeHolder: nls.localize('selectWorkspace', "Select workspace folder")
            });
            if (!pick) {
                return;
            }
            root = folders[folderPicks.indexOf(pick)].uri;
        }
        else {
            root = historyService.getLastActiveWorkspaceRoot();
        }
        // It's a local workspace, open the root
        if (root?.scheme === Schemas.file) {
            terminalService.openTerminal(config, root.fsPath);
            return;
        }
        // If it's a remote workspace, open the canonical URI if it is a local folder
        try {
            if (root?.scheme === Schemas.vscodeRemote) {
                const canonicalUri = await remoteAuthorityResolverService.getCanonicalURI(root);
                if (canonicalUri.scheme === Schemas.file) {
                    terminalService.openTerminal(config, canonicalUri.fsPath);
                    return;
                }
            }
        }
        catch { }
        // Open the current file's folder if it's local or its canonical URI is local
        // Opens current file's folder, if no folder is open in editor
        const activeFile = historyService.getLastActiveFile(Schemas.file);
        if (activeFile?.scheme === Schemas.file) {
            terminalService.openTerminal(config, paths.dirname(activeFile.fsPath));
            return;
        }
        try {
            if (activeFile?.scheme === Schemas.vscodeRemote) {
                const canonicalUri = await remoteAuthorityResolverService.getCanonicalURI(activeFile);
                if (canonicalUri.scheme === Schemas.file) {
                    terminalService.openTerminal(config, canonicalUri.fsPath);
                    return;
                }
            }
        }
        catch { }
        // Fallback to opening without a cwd which will end up using the local home path
        terminalService.openTerminal(config, undefined);
    }
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: OPEN_NATIVE_CONSOLE_COMMAND_ID,
        title: nls.localize2('globalConsoleAction', "Open New External Terminal")
    }
});
let ExternalTerminalContribution = class ExternalTerminalContribution {
    constructor(_externalTerminalService) {
        this._externalTerminalService = _externalTerminalService;
        this._updateConfiguration();
    }
    async _updateConfiguration() {
        const terminals = await this._externalTerminalService.getDefaultTerminalForPlatforms();
        const configurationRegistry = Registry.as(Extensions.Configuration);
        const terminalKindProperties = {
            type: 'string',
            enum: [
                'integrated',
                'external',
                'both'
            ],
            enumDescriptions: [
                nls.localize('terminal.kind.integrated', "Show the integrated terminal action."),
                nls.localize('terminal.kind.external', "Show the external terminal action."),
                nls.localize('terminal.kind.both', "Show both integrated and external terminal actions.")
            ],
            default: 'integrated'
        };
        configurationRegistry.registerConfiguration({
            id: 'externalTerminal',
            order: 100,
            title: nls.localize('terminalConfigurationTitle', "External Terminal"),
            type: 'object',
            properties: {
                'terminal.explorerKind': {
                    ...terminalKindProperties,
                    description: nls.localize('explorer.openInTerminalKind', "When opening a file from the Explorer in a terminal, determines what kind of terminal will be launched"),
                },
                'terminal.sourceControlRepositoriesKind': {
                    ...terminalKindProperties,
                    description: nls.localize('sourceControlRepositories.openInTerminalKind', "When opening a repository from the Source Control Repositories view in a terminal, determines what kind of terminal will be launched"),
                },
                'terminal.external.windowsExec': {
                    type: 'string',
                    description: nls.localize('terminal.external.windowsExec', "Customizes which terminal to run on Windows."),
                    default: terminals.windows,
                    scope: 1 /* ConfigurationScope.APPLICATION */
                },
                'terminal.external.osxExec': {
                    type: 'string',
                    description: nls.localize('terminal.external.osxExec', "Customizes which terminal application to run on macOS."),
                    default: terminals.osx,
                    scope: 1 /* ConfigurationScope.APPLICATION */
                },
                'terminal.external.linuxExec': {
                    type: 'string',
                    description: nls.localize('terminal.external.linuxExec', "Customizes which terminal to run on Linux."),
                    default: terminals.linux,
                    scope: 1 /* ConfigurationScope.APPLICATION */
                }
            }
        });
    }
};
ExternalTerminalContribution = __decorate([
    __param(0, IExternalTerminalService)
], ExternalTerminalContribution);
export { ExternalTerminalContribution };
// Register workbench contributions
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ExternalTerminalContribution, 3 /* LifecyclePhase.Restored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxUZXJtaW5hbC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlcm5hbFRlcm1pbmFsL2VsZWN0cm9uLWJyb3dzZXIvZXh0ZXJuYWxUZXJtaW5hbC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEtBQUssS0FBSyxNQUFNLGlDQUFpQyxDQUFDO0FBRXpELE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFdEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxtQkFBbUIsRUFBb0IsTUFBTSwrREFBK0QsQ0FBQztBQUN0SCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUEwQixVQUFVLEVBQXlELE1BQU0sb0VBQW9FLENBQUM7QUFDL0ssT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBMkQsVUFBVSxJQUFJLG1CQUFtQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDOUksT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sbUZBQW1GLENBQUM7QUFDN0gsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDbEYsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFaEgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDOUYsT0FBTyxF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