/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IMenuItem, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { InlineChatController, InlineChatController1, InlineChatController2, InlineChatRunOptions } from './inlineChatController.js';
import * as InlineChatActions from './inlineChatActions.js';
import { CTX_INLINE_CHAT_EDITING, CTX_INLINE_CHAT_V1_ENABLED, CTX_INLINE_CHAT_REQUEST_IN_PROGRESS, INLINE_CHAT_ID, MENU_INLINE_CHAT_WIDGET_STATUS, ACTION_START } from '../common/inlineChat.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { InlineChatNotebookContribution } from './inlineChatNotebook.js';
import { IWorkbenchContributionsRegistry, registerWorkbenchContribution2, Extensions as WorkbenchExtensions, WorkbenchPhase } from '../../../common/contributions.js';
import { InlineChatAccessibleView } from './inlineChatAccessibleView.js';
import { IInlineChatSessionService } from './inlineChatSessionService.js';
import { InlineChatEnabler, InlineChatEscapeToolContribution, InlineChatSessionServiceImpl } from './inlineChatSessionServiceImpl.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { CancelAction, ChatSubmitAction } from '../../chat/browser/actions/chatExecuteActions.js';
import { localize } from '../../../../nls.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { InlineChatAccessibilityHelp } from './inlineChatAccessibilityHelp.js';
import { InlineChatCodeActionsProvider } from './inlineChatCodeActions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';

registerEditorContribution(InlineChatController2.ID, InlineChatController2, EditorContributionInstantiation.Eager); // EAGER because of notebook dispose/create of editors
registerEditorContribution(INLINE_CHAT_ID, InlineChatController1, EditorContributionInstantiation.Eager); // EAGER because of notebook dispose/create of editors
registerEditorContribution(InlineChatController.ID, InlineChatController, EditorContributionInstantiation.Eager); // EAGER because of notebook dispose/create of editors

registerAction2(InlineChatActions.KeepSessionAction2);
registerAction2(InlineChatActions.UndoAndCloseSessionAction2);

// --- browser

registerSingleton(IInlineChatSessionService, InlineChatSessionServiceImpl, InstantiationType.Delayed);

// --- MENU special ---

const editActionMenuItem: IMenuItem = {
	group: '0_main',
	order: 0,
	command: {
		id: ChatSubmitAction.ID,
		title: localize('send.edit', "Edit Code"),
	},
	when: ContextKeyExpr.and(
		ChatContextKeys.inputHasText,
		CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated(),
		CTX_INLINE_CHAT_EDITING,
		CTX_INLINE_CHAT_V1_ENABLED
	),
};

const generateActionMenuItem: IMenuItem = {
	group: '0_main',
	order: 0,
	command: {
		id: ChatSubmitAction.ID,
		title: localize('send.generate', "Generate"),
	},
	when: ContextKeyExpr.and(
		ChatContextKeys.inputHasText,
		CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated(),
		CTX_INLINE_CHAT_EDITING.toNegated(),
		CTX_INLINE_CHAT_V1_ENABLED
	),
};

MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, editActionMenuItem);
MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, generateActionMenuItem);

const cancelActionMenuItem: IMenuItem = {
	group: '0_main',
	order: 0,
	command: {
		id: CancelAction.ID,
		title: localize('cancel', "Cancel Request"),
		shortTitle: localize('cancelShort', "Cancel"),
	},
	when: ContextKeyExpr.and(
		CTX_INLINE_CHAT_REQUEST_IN_PROGRESS,
	),
};

MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, cancelActionMenuItem);

// --- actions ---

registerAction2(InlineChatActions.StartSessionAction);
registerAction2(InlineChatActions.CloseAction);
registerAction2(InlineChatActions.ConfigureInlineChatAction);
registerAction2(InlineChatActions.UnstashSessionAction);
registerAction2(InlineChatActions.DiscardHunkAction);
registerAction2(InlineChatActions.RerunAction);
registerAction2(InlineChatActions.MoveToNextHunk);
registerAction2(InlineChatActions.MoveToPreviousHunk);

registerAction2(InlineChatActions.ArrowOutUpAction);
registerAction2(InlineChatActions.ArrowOutDownAction);
registerAction2(InlineChatActions.FocusInlineChat);
registerAction2(InlineChatActions.ViewInChatAction);

registerAction2(InlineChatActions.ToggleDiffForChange);
registerAction2(InlineChatActions.AcceptChanges);

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(InlineChatNotebookContribution, LifecyclePhase.Restored);

registerWorkbenchContribution2(InlineChatEnabler.Id, InlineChatEnabler, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(InlineChatEscapeToolContribution.Id, InlineChatEscapeToolContribution, WorkbenchPhase.AfterRestored);
AccessibleViewRegistry.register(new InlineChatAccessibleView());
AccessibleViewRegistry.register(new InlineChatAccessibilityHelp());

// Register command to show language picker for translate
CommandsRegistry.registerCommand('inlineChat.showTranslateLanguagePicker', async (accessor, runOptions: InlineChatRunOptions) => {
	const quickInputService = accessor.get(IQuickInputService);
	const commandService = accessor.get(ICommandService);

	const languages: Array<{ code: string; name: string }> = [
		{ code: 'en', name: 'English' },
		{ code: 'es', name: 'Spanish' },
		{ code: 'de', name: 'German' },
		{ code: 'zh', name: 'Chinese' },
		{ code: 'fr', name: 'French' },
		{ code: 'ja', name: 'Japanese' },
	];

	const picks: IQuickPickItem[] = languages.map(lang => ({
		label: lang.name,
		id: lang.code,
	}));

	const selected = await quickInputService.pick(picks, {
		placeHolder: localize('selectLanguage', 'Select a language to translate to'),
		matchOnDescription: false,
		matchOnDetail: false,
	});

	if (selected && selected.id) {
		const lang = languages.find(l => l.code === selected.id);
		if (lang && runOptions) {
			await commandService.executeCommand(ACTION_START, {
				...runOptions,
				message: localize('translateToLanguage', "Translate this code to {0}", lang.name),
				autoSend: true
			});
		}
	}
});

// Register command to show style picker for paraphrase
CommandsRegistry.registerCommand('inlineChat.showParaphraseStylePicker', async (accessor, runOptions: InlineChatRunOptions) => {
	const quickInputService = accessor.get(IQuickInputService);
	const commandService = accessor.get(ICommandService);

	const styles: Array<{ code: string; name: string }> = [
		{ code: 'scientific', name: 'Scientific' },
		{ code: 'clear', name: 'Clear' },
		{ code: 'concise', name: 'Concise' },
		{ code: 'punchy', name: 'Punchy' },
	];

	const picks: IQuickPickItem[] = styles.map(style => ({
		label: style.name,
		id: style.code,
	}));

	const selected = await quickInputService.pick(picks, {
		placeHolder: localize('selectParaphraseStyle', 'Select a style to paraphrase'),
		matchOnDescription: false,
		matchOnDetail: false,
	});

	if (selected && selected.id) {
		const style = styles.find(s => s.code === selected.id);
		if (style && runOptions) {
			await commandService.executeCommand(ACTION_START, {
				...runOptions,
				message: localize('paraphraseInStyle', "Paraphrase this code in {0} style", style.name),
				autoSend: true
			});
		}
	}
});

// Register Code Actions Provider for inline chat
class InlineChatCodeActionsContribution extends Disposable {
	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		this._register(InlineChatCodeActionsProvider.registerProvider(instantiationService));
	}
}
registerWorkbenchContribution2('inlineChat.codeActions', InlineChatCodeActionsContribution, WorkbenchPhase.AfterRestored);
