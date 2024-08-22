/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions';
import { IMenuItem, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions';
import { InlineChatController } from './inlineChatController';
import * as InlineChatActions from './inlineChatActions';
import { CTX_INLINE_CHAT_EDITING, CTX_INLINE_CHAT_REQUEST_IN_PROGRESS, INLINE_CHAT_ID, MENU_INLINE_CHAT_CONTENT_STATUS, MENU_INLINE_CHAT_WIDGET_STATUS } from '../common/inlineChat';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { Registry } from '../../../../platform/registry/common/platform';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle';
import { InlineChatNotebookContribution } from './inlineChatNotebook';
import { IWorkbenchContributionsRegistry, registerWorkbenchContribution2, Extensions as WorkbenchExtensions, WorkbenchPhase } from '../../../common/contributions';
import { InlineChatSavingServiceImpl } from './inlineChatSavingServiceImpl';
import { InlineChatAccessibleView } from './inlineChatAccessibleView';
import { IInlineChatSavingService } from './inlineChatSavingService';
import { IInlineChatSessionService } from './inlineChatSessionService';
import { InlineChatEnabler, InlineChatSessionServiceImpl } from './inlineChatSessionServiceImpl';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry';
import { CancelAction, SubmitAction } from '../../chat/browser/actions/chatExecuteActions';
import { localize } from '../../../../nls';
import { CONTEXT_CHAT_INPUT_HAS_TEXT } from '../../chat/common/chatContextKeys';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey';
import { InlineChatAccessibilityHelp } from './inlineChatAccessibilityHelp';
import { InlineChatExansionContextKey, InlineChatExpandLineAction } from './inlineChatCurrentLine';


// --- browser

registerSingleton(IInlineChatSessionService, InlineChatSessionServiceImpl, InstantiationType.Delayed);
registerSingleton(IInlineChatSavingService, InlineChatSavingServiceImpl, InstantiationType.Delayed);

registerEditorContribution(INLINE_CHAT_ID, InlineChatController, EditorContributionInstantiation.Eager); // EAGER because of notebook dispose/create of editors

registerEditorContribution(InlineChatExansionContextKey.Id, InlineChatExansionContextKey, EditorContributionInstantiation.BeforeFirstInteraction);
registerAction2(InlineChatExpandLineAction);

// --- MENU special ---

const editActionMenuItem: IMenuItem = {
	group: '0_main',
	order: 0,
	command: {
		id: SubmitAction.ID,
		title: localize('send.edit', "Edit Code"),
	},
	when: ContextKeyExpr.and(
		CONTEXT_CHAT_INPUT_HAS_TEXT,
		CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated(),
		CTX_INLINE_CHAT_EDITING
	),
};

const generateActionMenuItem: IMenuItem = {
	group: '0_main',
	order: 0,
	command: {
		id: SubmitAction.ID,
		title: localize('send.generate', "Generate"),
	},
	when: ContextKeyExpr.and(
		CONTEXT_CHAT_INPUT_HAS_TEXT,
		CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated(),
		CTX_INLINE_CHAT_EDITING.toNegated()
	),
};

MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_CONTENT_STATUS, editActionMenuItem);
MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_CONTENT_STATUS, generateActionMenuItem);
MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, editActionMenuItem);
MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, generateActionMenuItem);

const cancelActionMenuItem: IMenuItem = {
	group: '0_main',
	order: 0,
	command: {
		id: CancelAction.ID,
		title: localize('cancel', "Stop Request"),
		shortTitle: localize('cancelShort', "Stop"),
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
registerAction2(InlineChatActions.DiscardAction);
registerAction2(InlineChatActions.RerunAction);
registerAction2(InlineChatActions.MoveToNextHunk);
registerAction2(InlineChatActions.MoveToPreviousHunk);

registerAction2(InlineChatActions.ArrowOutUpAction);
registerAction2(InlineChatActions.ArrowOutDownAction);
registerAction2(InlineChatActions.FocusInlineChat);
registerAction2(InlineChatActions.ViewInChatAction);

registerAction2(InlineChatActions.ToggleDiffForChange);
registerAction2(InlineChatActions.AcceptChanges);

registerAction2(InlineChatActions.ReportIssueAction);

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(InlineChatNotebookContribution, LifecyclePhase.Restored);

registerWorkbenchContribution2(InlineChatEnabler.Id, InlineChatEnabler, WorkbenchPhase.AfterRestored);
AccessibleViewRegistry.register(new InlineChatAccessibleView());
AccessibleViewRegistry.register(new InlineChatAccessibilityHelp());
