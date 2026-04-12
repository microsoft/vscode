/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getFontSnippets } from '../../../../base/browser/fonts.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { Extensions as DragAndDropExtensions } from '../../../../platform/dnd/browser/dnd.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ITerminalLogService } from '../../../../platform/terminal/common/terminal.js';
import { TerminalLogService } from '../../../../platform/terminal/common/terminalLogService.js';
import { registerTerminalPlatformConfiguration } from '../../../../platform/terminal/common/terminalPlatformConfiguration.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { Extensions as ViewContainerExtensions } from '../../../common/views.js';
import { ITerminalProfileService, TERMINAL_VIEW_ID } from '../common/terminal.js';
import { TerminalEditingService } from './terminalEditingService.js';
import { registerColors } from '../common/terminalColorRegistry.js';
import { registerTerminalConfiguration } from '../common/terminalConfiguration.js';
import { terminalStrings } from '../common/terminalStrings.js';
import './media/terminal.css';
import './media/terminalVoice.css';
import './media/widgets.css';
import './media/xterm.css';
import { RemoteTerminalBackendContribution } from './remoteTerminalBackend.js';
import { ITerminalConfigurationService, ITerminalEditingService, ITerminalEditorService, ITerminalGroupService, ITerminalInstanceService, ITerminalService, terminalEditorId } from './terminal.js';
import { registerTerminalActions } from './terminalActions.js';
import { setupTerminalCommands } from './terminalCommands.js';
import { TerminalConfigurationService } from './terminalConfigurationService.js';
import { TerminalEditor } from './terminalEditor.js';
import { TerminalEditorInput } from './terminalEditorInput.js';
import { TerminalInputSerializer } from './terminalEditorSerializer.js';
import { TerminalEditorService } from './terminalEditorService.js';
import { TerminalGroupService } from './terminalGroupService.js';
import { terminalViewIcon } from './terminalIcons.js';
import { TerminalInstanceService } from './terminalInstanceService.js';
import { TerminalMainContribution } from './terminalMainContribution.js';
import { setupTerminalMenus } from './terminalMenus.js';
import { TerminalProfileService } from './terminalProfileService.js';
import { TerminalService } from './terminalService.js';
import { TerminalTelemetryContribution } from './terminalTelemetry.js';
import { TerminalViewPane } from './terminalView.js';
// Register services
registerSingleton(ITerminalLogService, TerminalLogService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITerminalConfigurationService, TerminalConfigurationService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITerminalService, TerminalService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITerminalEditorService, TerminalEditorService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITerminalEditingService, TerminalEditingService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITerminalGroupService, TerminalGroupService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITerminalInstanceService, TerminalInstanceService, 1 /* InstantiationType.Delayed */);
registerSingleton(ITerminalProfileService, TerminalProfileService, 1 /* InstantiationType.Delayed */);
// Register workbench contributions
// This contribution blocks startup as it's critical to enable the web embedder window.createTerminal API
registerWorkbenchContribution2(TerminalMainContribution.ID, TerminalMainContribution, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(RemoteTerminalBackendContribution.ID, RemoteTerminalBackendContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(TerminalTelemetryContribution.ID, TerminalTelemetryContribution, 3 /* WorkbenchPhase.AfterRestored */);
// Register configurations
registerTerminalPlatformConfiguration();
registerTerminalConfiguration(getFontSnippets);
// Register editor/dnd contributions
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(TerminalEditorInput.ID, TerminalInputSerializer);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(TerminalEditor, terminalEditorId, terminalStrings.terminal), [
    new SyncDescriptor(TerminalEditorInput)
]);
Registry.as(DragAndDropExtensions.DragAndDropContribution).register({
    dataFormatKey: "Terminals" /* TerminalDataTransfers.Terminals */,
    getEditorInputs(data) {
        const editors = [];
        try {
            const terminalEditors = JSON.parse(data);
            for (const terminalEditor of terminalEditors) {
                editors.push({ resource: URI.parse(terminalEditor) });
            }
        }
        catch (error) {
            // Invalid transfer
        }
        return editors;
    },
    setData(resources, event) {
        const terminalResources = resources.filter(({ resource }) => resource.scheme === Schemas.vscodeTerminal);
        if (terminalResources.length) {
            event.dataTransfer?.setData("Terminals" /* TerminalDataTransfers.Terminals */, JSON.stringify(terminalResources.map(({ resource }) => resource.toString())));
        }
    }
});
// Register views
const VIEW_CONTAINER = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
    id: TERMINAL_VIEW_ID,
    title: nls.localize2('terminal', "Terminal"),
    icon: terminalViewIcon,
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [TERMINAL_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
    storageId: TERMINAL_VIEW_ID,
    hideIfEmpty: true,
    order: 3,
    windowVisibility: 3 /* WindowVisibility.Both */
}, 1 /* ViewContainerLocation.Panel */, { doNotRegisterOpenCommand: true, isDefault: true });
Registry.as(ViewContainerExtensions.ViewsRegistry).registerViews([{
        id: TERMINAL_VIEW_ID,
        name: nls.localize2('terminal', "Terminal"),
        containerIcon: terminalViewIcon,
        canToggleVisibility: true,
        canMoveView: true,
        ctorDescriptor: new SyncDescriptor(TerminalViewPane),
        windowVisibility: 3 /* WindowVisibility.Both */,
        openCommandActionDescriptor: {
            id: "workbench.action.terminal.toggleTerminal" /* TerminalCommandId.Toggle */,
            mnemonicTitle: nls.localize({ key: 'miToggleIntegratedTerminal', comment: ['&& denotes a mnemonic'] }, "&&Terminal"),
            keybindings: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 91 /* KeyCode.Backquote */,
                mac: { primary: 256 /* KeyMod.WinCtrl */ | 91 /* KeyCode.Backquote */ }
            },
            order: 3
        }
    }], VIEW_CONTAINER);
registerTerminalActions();
setupTerminalCommands();
setupTerminalMenus();
registerColors();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXBFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsVUFBVSxJQUFJLHFCQUFxQixFQUFpRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzdKLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRixPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxxQ0FBcUMsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQzlILE9BQU8sRUFBRSxvQkFBb0IsRUFBdUIsTUFBTSw0QkFBNEIsQ0FBQztBQUN2RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN0RixPQUFPLEVBQWtCLDhCQUE4QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEcsT0FBTyxFQUFFLGdCQUFnQixFQUEwQixNQUFNLDJCQUEyQixDQUFDO0FBQ3JGLE9BQU8s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