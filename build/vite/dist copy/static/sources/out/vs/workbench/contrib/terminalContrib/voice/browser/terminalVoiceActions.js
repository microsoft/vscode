/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IExtensionManagementService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchExtensionEnablementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { HasSpeechProvider, SpeechToTextInProgress } from '../../../speech/common/speechService.js';
import { registerActiveInstanceAction, sharedWhenClause } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { TerminalVoiceSession } from './terminalVoice.js';
const VOICE_CATEGORY = localize2('voiceCategory', "Voice");
export function registerTerminalVoiceActions() {
    registerActiveInstanceAction({
        id: "workbench.action.terminal.startVoice" /* TerminalCommandId.StartVoice */,
        title: localize2('workbench.action.terminal.startDictation', "Start Dictation in Terminal"),
        category: VOICE_CATEGORY,
        precondition: ContextKeyExpr.and(SpeechToTextInProgress.toNegated(), sharedWhenClause.terminalAvailable),
        f1: true,
        icon: Codicon.mic,
        run: async (activeInstance, c, accessor) => {
            const contextKeyService = accessor.get(IContextKeyService);
            const commandService = accessor.get(ICommandService);
            const dialogService = accessor.get(IDialogService);
            const workbenchExtensionEnablementService = accessor.get(IWorkbenchExtensionEnablementService);
            const extensionManagementService = accessor.get(IExtensionManagementService);
            if (HasSpeechProvider.getValue(contextKeyService)) {
                const instantiationService = accessor.get(IInstantiationService);
                TerminalVoiceSession.getInstance(instantiationService).start();
                return;
            }
            const extensions = await extensionManagementService.getInstalled();
            const extension = extensions.find(extension => extension.identifier.id === 'ms-vscode.vscode-speech');
            const extensionIsDisabled = extension && !workbenchExtensionEnablementService.isEnabled(extension);
            let run;
            let message;
            let primaryButton;
            if (extensionIsDisabled) {
                message = localize('terminal.voice.enableSpeechExtension', "Would you like to enable the speech extension?");
                primaryButton = localize('enableExtension', "Enable Extension");
                run = () => workbenchExtensionEnablementService.setEnablement([extension], 13 /* EnablementState.EnabledWorkspace */);
            }
            else {
                message = localize('terminal.voice.installSpeechExtension', "Would you like to install 'VS Code Speech' extension from 'Microsoft'?");
                run = () => commandService.executeCommand('workbench.extensions.installExtension', 'ms-vscode.vscode-speech');
                primaryButton = localize('installExtension', "Install Extension");
            }
            const detail = localize('terminal.voice.detail', "Microphone support requires this extension.");
            const confirmed = await dialogService.confirm({ message, primaryButton, type: 'info', detail });
            if (confirmed.confirmed) {
                await run();
            }
        },
    });
    registerActiveInstanceAction({
        id: "workbench.action.terminal.stopVoice" /* TerminalCommandId.StopVoice */,
        title: localize2('workbench.action.terminal.stopDictation', "Stop Dictation in Terminal"),
        category: VOICE_CATEGORY,
        precondition: TerminalContextKeys.terminalDictationInProgress,
        f1: true,
        keybinding: {
            primary: 9 /* KeyCode.Escape */,
            weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 100
        },
        run: (activeInstance, c, accessor) => {
            const instantiationService = accessor.get(IInstantiationService);
            TerminalVoiceSession.getInstance(instantiationService).stop(true);
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxWb2ljZUFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvdm9pY2UvYnJvd3Nlci90ZXJtaW5hbFZvaWNlQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUN4SCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUd0RyxPQUFPLEVBQW1CLG9DQUFvQyxFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFDL0ksT0FBTyxFQUFFLGlCQUFpQixFQUFFLHNCQUFzQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLGdCQUFnQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFOUcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDckYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFMUQsTUFBTSxjQUFjLEdBQUcsU0FBUyxDQUFDLGVBQWUsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUUzRCxNQUFNLFVBQVUsNEJBQTRCO0lBQzNDLDRCQUE0QixDQUFD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