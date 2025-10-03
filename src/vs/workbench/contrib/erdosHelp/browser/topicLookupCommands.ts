/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditor } from '../../../../editor/common/editorCommon.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IErdosHelpService } from './services/helpService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ErdosConsoleFocused } from '../../../common/contextkeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IErdosConsoleService } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';

export class DisplayTopicAtPosition extends Action2 {
	constructor() {
		super({
			id: 'erdos.help.showHelpAtCursor',
			title: {
				value: localize('erdos.help.showHelpAtCursor', 'Show Help at Cursor'),
				original: 'Show Help at Cursor'
			},
			keybinding: {
				weight: KeybindingWeight.EditorCore,
				primary: KeyCode.F1,
				secondary: [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyH)],
				when: ContextKeyExpr.or(EditorContextKeys.focus, ErdosConsoleFocused)
			},
			category: Categories.Help,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorAccess = accessor.get(IEditorService);
		const documentationAccess: IErdosHelpService = accessor.get(IErdosHelpService);
		const languageFeatures = accessor.get(ILanguageFeaturesService);
		const notifier = accessor.get(INotificationService);
		const languageInfo = accessor.get(ILanguageService);
		const consoleAccess = accessor.get(IErdosConsoleService);

		let activeEditor = editorAccess.activeTextEditorControl as IEditor;

		if (consoleAccess.activeCodeEditor?.hasTextFocus()) {
			activeEditor = consoleAccess.activeCodeEditor;
		}

		if (!activeEditor) {
			notifier.info(localize('erdos.help.noHelpSource', "No help is available here. Place the cursor in the editor on the item you'd like help with."));
			return;
		}

		const cursorPosition = activeEditor.getPosition();
		if (!cursorPosition) {
			return;
		}

		const documentModel = activeEditor.getModel() as ITextModel;
		const availableProviders = languageFeatures.helpTopicProvider.all(documentModel);
		
		if (availableProviders.length > 0) {
			const selectedProvider = availableProviders[0];
			try {
				const resolvedTopic = await selectedProvider.provideHelpTopic(
					documentModel,
					cursorPosition,
					CancellationToken.None);

				const detectedLanguageId = documentModel.getLanguageIdAtPosition(
					cursorPosition.lineNumber,
					cursorPosition.column);
				const languageDisplayName = languageInfo.getLanguageName(detectedLanguageId);

				if (typeof resolvedTopic === 'string' && resolvedTopic.length > 0) {
					const wasLocated = await documentationAccess.showHelpTopic(detectedLanguageId, resolvedTopic);
					if (!wasLocated) {
						notifier.info(localize('erdos.help.helpTopicNotFound', "No {0} help available for '{1}'", languageDisplayName, resolvedTopic));
					}
				} else {
					notifier.info(localize('erdos.help.noHelpTopic', "No {0} help is available at this location.", languageDisplayName));
				}
			} catch (err: any) {
				notifier.warn(localize('erdos.help.helpTopicError', "An error occurred while looking up the help topic: {0}", err.message));
			}
		}
	}
}

export class SearchDocumentation extends Action2 {
	constructor() {
		super({
			id: 'erdos.help.lookupHelpTopic',
			title: {
				value: localize('erdos.help.lookupHelpTopic', 'Look Up Help Topic'),
				original: 'Look Up Help Topic'
			},
			category: Categories.Help,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorAccess = accessor.get(IEditorService);
		const documentationAccess: IErdosHelpService = accessor.get(IErdosHelpService);
		const sessionManager = accessor.get(IRuntimeSessionService);
		const inputDialog = accessor.get(IQuickInputService);
		const notifier = accessor.get(INotificationService);
		const languageInfo = accessor.get(ILanguageService);

		let detectedLanguageId = undefined;
		const currentEditor = editorAccess.activeTextEditorControl as IEditor;
		if (currentEditor) {
			const documentModel = currentEditor.getModel() as ITextModel;
			detectedLanguageId = documentModel.getLanguageId();
		}

		if (!detectedLanguageId) {
			const primarySession = sessionManager.foregroundSession;
			if (primarySession) {
				detectedLanguageId = primarySession.runtimeMetadata.languageId;
			} else {
				const alertMessage = localize('erdos.help.noInterpreters', "There are no interpreters running. Start an interpreter to look up help topics.");
				notifier.info(alertMessage);
				return;
			}
		}

		const runningSessions = sessionManager.activeSessions;
		let sessionExists = false;
		for (const session of runningSessions) {
			if (session.runtimeMetadata.languageId === detectedLanguageId) {
				sessionExists = true;
				break;
			}
		}
		if (!sessionExists) {
			const alertMessage = localize('erdos.help.noLanguage', "Open a file for the language you want to look up help topics for, or start an interpreter for that language.");
			notifier.info(alertMessage);
			return;
		}

		const languageDisplayName = languageInfo.getLanguageName(detectedLanguageId);

		const userInput = await inputDialog.input({
			prompt: localize('erdos.help.enterHelpTopic', "Enter {0} help topic", languageDisplayName),
			value: '',
			ignoreFocusLost: true,
			validateInput: async (value: string) => {
				if (value.length === 0) {
					return localize('erdos.help.noTopic', "No help topic provided.");
				}
				return undefined;
			}
		});

		if (userInput) {
			try {
				const wasLocated = await documentationAccess.showHelpTopic(detectedLanguageId, userInput);
				if (!wasLocated) {
					const alertMessage = localize('erdos.help.helpTopicUnavailable',
						"No help found for '{0}'.", userInput);
					notifier.info(alertMessage);
					return;
				}
			} catch (err: any) {
				const alertMessage = localize('erdos.help.errorLookingUpTopic',
					"Error finding help on '{0}': {1} ({2}).", userInput, err.message, err.code);
				notifier.warn(alertMessage);
				return;
			}
		}
	}
}

// Legacy exports for backward compatibility
export const ShowHelpAtCursor = DisplayTopicAtPosition;
export const LookupHelpTopic = SearchDocumentation;
