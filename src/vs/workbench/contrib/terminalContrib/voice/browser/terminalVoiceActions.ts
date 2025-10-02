/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../base/common/actions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IExtensionManagementService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
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
			const notificationService = accessor.get(INotificationService);
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
			const learnMoreAction = {
				label: localize('viewExtension', "View Extension"),
				run: () => commandService.executeCommand('workbench.extensions.search', '@id:ms-vscode.vscode-speech'),
				id: '',
				tooltip: '',
				class: undefined,
				enabled: true
			};

			const actions: IAction[] = [];
			let message: string;
			if (extensionIsDisabled) {
				message = localize('terminal.voice.enableSpeechExtension', "You must enable the Speech extension to use Dictation in the Terminal.");
				actions.push({
					id: 'enableSpeechExtension',
					tooltip: '',
					class: undefined,
					enabled: true,
					label: localize('enableSpeechExtension', "Enable for Workspace"),
					run: () => workbenchExtensionEnablementService.setEnablement([extension], EnablementState.EnabledWorkspace),
				}, learnMoreAction);
			} else {
				message = localize('terminal.voice.installSpeechExtension', "You must install the Speech extension to use Dictation in the Terminal.");
				actions.push({
					id: 'installSpeechExtension',
					label: localize('installSpeechExtension', "Install Speech Extension"),
					run: () => commandService.executeCommand('workbench.extensions.installExtension', 'ms-vscode.vscode-speech'),
					tooltip: '',
					class: undefined,
					enabled: true
				}, learnMoreAction);
			}
			notificationService.notify({ severity: Severity.Info, message, actions: { primary: actions } });
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.StopVoice,
		title: localize2('workbench.action.terminal.stopDictation', "Stop Dictation in Terminal"),
		precondition: TerminalContextKeys.terminalDictationInProgress,
		f1: true,
		run: (activeInstance, c, accessor) => {
			const instantiationService = accessor.get(IInstantiationService);
			TerminalVoiceSession.getInstance(instantiationService).stop(true);
		}
	});
}
