/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IExtensionManagementService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EnablementState, IWorkbenchExtensionEnablementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { HasSpeechProvider, SpeechToTextInProgress } from '../../../speech/common/speechService.js';
import { registerActiveInstanceAction, sharedWhenClause } from '../../../terminal/browser/terminalActions.js';
import { TerminalCommandId } from '../../../terminal/common/terminal.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { TerminalVoiceSession } from './terminalVoice.js';

export function registerTerminalVoiceActions() {
	registerActiveInstanceAction({
		id: TerminalCommandId.StartVoice,
		title: localize2('workbench.action.terminal.startDictation', "Start Dictation in Terminal"),
		precondition: ContextKeyExpr.and(
			SpeechToTextInProgress.toNegated(),
			sharedWhenClause.terminalAvailable
		),
		f1: true,
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
			let run: () => Promise<unknown>;
			let message: string;
			let primaryButton: string;
			if (extensionIsDisabled) {
				message = localize('terminal.voice.enableSpeechExtension', "Would you like to enable the speech extension?");
				primaryButton = localize('enableExtension', "Enable Extension");
				run = () => workbenchExtensionEnablementService.setEnablement([extension], EnablementState.EnabledWorkspace);
			} else {
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
		id: TerminalCommandId.StopVoice,
		title: localize2('workbench.action.terminal.stopDictation', "Stop Dictation in Terminal"),
		precondition: TerminalContextKeys.terminalDictationInProgress,
		f1: true,
		keybinding: {
			primary: KeyCode.Escape,
			weight: KeybindingWeight.WorkbenchContrib + 100
		},
		run: (activeInstance, c, accessor) => {
			const instantiationService = accessor.get(IInstantiationService);
			TerminalVoiceSession.getInstance(instantiationService).stop(true);
		}
	});
}
