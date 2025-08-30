/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
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
import { IErdosHelpService } from './erdosHelpService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ErdosConsoleFocused } from '../../../common/contextkeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IErdosConsoleService } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';

export class ShowHelpAtCursor extends Action2 {
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
		const editorService = accessor.get(IEditorService);
		const helpService = accessor.get(IErdosHelpService);
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);
		const notificationService = accessor.get(INotificationService);
		const languageService = accessor.get(ILanguageService);
		const consoleService = accessor.get(IErdosConsoleService);

		let editor = editorService.activeTextEditorControl as IEditor;

		if (consoleService.activeCodeEditor?.hasTextFocus()) {
			editor = consoleService.activeCodeEditor;
		}

		if (!editor) {
			notificationService.info(localize('erdos.help.noHelpSource', "No help is available here. Place the cursor in the editor on the item you'd like help with."));
			return;
		}

		const position = editor.getPosition();
		if (!position) {
			return;
		}

		const model = editor.getModel() as ITextModel;
		const helpTopicProviders =
			languageFeaturesService.helpTopicProvider.all(model);
		if (helpTopicProviders.length > 0) {
			const provider = helpTopicProviders[0];
			try {
				const topic = await provider.provideHelpTopic(
					model,
					position,
					CancellationToken.None);

				const languageId = model.getLanguageIdAtPosition(
					position.lineNumber,
					position.column);
				const languageName = languageService.getLanguageName(languageId);

				if (typeof topic === 'string' && topic.length > 0) {
					const found = await helpService.showHelpTopic(languageId, topic);
					if (!found) {
						notificationService.info(localize('erdos.help.helpTopicNotFound', "No {0} help available for '{1}'", languageName, topic));
					}
				} else {
					notificationService.info(localize('erdos.help.noHelpTopic', "No {0} help is available at this location.", languageName));
				}
			} catch (err) {
				notificationService.warn(localize('erdos.help.helpTopicError', "An error occurred while looking up the help topic: {0}", err.message));
			}
		}
	}
}

export class LookupHelpTopic extends Action2 {
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
		const editorService = accessor.get(IEditorService);
		const helpService = accessor.get(IErdosHelpService);
		const sessionService = accessor.get(IRuntimeSessionService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const languageService = accessor.get(ILanguageService);

		let languageId = undefined;
		const editor = editorService.activeTextEditorControl as IEditor;
		if (editor) {
			const model = editor.getModel() as ITextModel;
			languageId = model.getLanguageId();
		}

		if (!languageId) {
			const session = sessionService.foregroundSession;
			if (session) {
				languageId = session.runtimeMetadata.languageId;
			} else {
				const message = localize('erdos.help.noInterpreters', "There are no interpreters running. Start an interpreter to look up help topics.");
				notificationService.info(message);
				return;
			}
		}

		const sessions = sessionService.activeSessions;
		let found = false;
		for (const session of sessions) {
			if (session.runtimeMetadata.languageId === languageId) {
				found = true;
				break;
			}
		}
		if (!found) {
			const message = localize('erdos.help.noLanguage', "Open a file for the language you want to look up help topics for, or start an interpreter for that language.");
			notificationService.info(message);
			return;
		}

		const languageName = languageService.getLanguageName(languageId);

		const topic = await quickInputService.input({
			prompt: localize('erdos.help.enterHelpTopic', "Enter {0} help topic", languageName),
			value: '',
			ignoreFocusLost: true,
			validateInput: async (value: string) => {
				if (value.length === 0) {
					return localize('erdos.help.noTopic', "No help topic provided.");
				}
				return undefined;
			}
		});

		if (topic) {
			try {
				const found = await helpService.showHelpTopic(languageId, topic);
				if (!found) {
					const message = localize('erdos.help.helpTopicUnavailable',
						"No help found for '{0}'.", topic);
					notificationService.info(message);
					return;
				}
			} catch (err) {
				const message = localize('erdos.help.errorLookingUpTopic',
					"Error finding help on '{0}': {1} ({2}).", topic, err.message, err.code);
				notificationService.warn(message);
				return;
			}
		}
	}
}
