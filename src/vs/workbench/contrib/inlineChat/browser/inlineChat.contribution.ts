/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IMenuItem, isIMenuItem, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import * as InlineChatActions from 'vs/workbench/contrib/inlineChat/browser/inlineChatActions';
import { CTX_INLINE_CHAT_CONFIG_TXT_BTNS, CTX_INLINE_CHAT_REQUEST_IN_PROGRESS, INLINE_CHAT_ID, InlineChatConfigKeys, MENU_INLINE_CHAT_CONTENT_STATUS, MENU_INLINE_CHAT_EXECUTE, MENU_INLINE_CHAT_WIDGET_STATUS } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { InlineChatNotebookContribution } from 'vs/workbench/contrib/inlineChat/browser/inlineChatNotebook';
import { IWorkbenchContributionsRegistry, registerWorkbenchContribution2, Extensions as WorkbenchExtensions, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { InlineChatSavingServiceImpl } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSavingServiceImpl';
import { InlineChatAccessibleView } from 'vs/workbench/contrib/inlineChat/browser/inlineChatAccessibleView';
import { IInlineChatSavingService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSavingService';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionService';
import { InlineChatEnabler, InlineChatSessionServiceImpl } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionServiceImpl';
import { AccessibleViewRegistry } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { CancelAction, SubmitAction } from 'vs/workbench/contrib/chat/browser/actions/chatExecuteActions';
import { localize } from 'vs/nls';
import { CONTEXT_CHAT_INPUT_HAS_TEXT } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';


// --- browser

registerSingleton(IInlineChatSessionService, InlineChatSessionServiceImpl, InstantiationType.Delayed);
registerSingleton(IInlineChatSavingService, InlineChatSavingServiceImpl, InstantiationType.Delayed);

registerEditorContribution(INLINE_CHAT_ID, InlineChatController, EditorContributionInstantiation.Eager); // EAGER because of notebook dispose/create of editors

// --- MENU special ---

const sendActionMenuItem: IMenuItem = {
	group: '0_main',
	order: 0,
	command: {
		id: SubmitAction.ID,
		title: localize('edit', "Send"),
	},
	when: ContextKeyExpr.and(
		CONTEXT_CHAT_INPUT_HAS_TEXT,
		CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated(),
		CTX_INLINE_CHAT_CONFIG_TXT_BTNS
	),
};

MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_CONTENT_STATUS, sendActionMenuItem);
MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, sendActionMenuItem);

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

registerAction2(InlineChatActions.CopyRecordings);

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(InlineChatNotebookContribution, LifecyclePhase.Restored);

registerWorkbenchContribution2(InlineChatEnabler.Id, InlineChatEnabler, WorkbenchPhase.AfterRestored);

AccessibleViewRegistry.register(new InlineChatAccessibleView());


// MARK - Menu Copier
// menu copier that we use for text-button mode.
// When active it filters out the send and cancel actions from the chat menu
class MenuCopier implements IDisposable {

	static Id = 'inlineChat.menuCopier';

	readonly dispose: () => void;

	constructor(@IConfigurationService configService: IConfigurationService,) {

		const store = new DisposableStore();
		function updateMenu() {
			store.clear();
			for (const item of MenuRegistry.getMenuItems(MenuId.ChatExecute)) {
				if (configService.getValue<boolean>(InlineChatConfigKeys.ExpTextButtons) && isIMenuItem(item) && (item.command.id === SubmitAction.ID || item.command.id === CancelAction.ID)) {
					continue;
				}
				store.add(MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_EXECUTE, item));
			}
		}
		updateMenu();
		const listener = MenuRegistry.onDidChangeMenu(e => {
			if (e.has(MenuId.ChatExecute)) {
				updateMenu();
			}
		});
		const listener2 = configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(InlineChatConfigKeys.ExpTextButtons)) {
				updateMenu();
			}
		});

		this.dispose = () => {
			listener.dispose();
			listener2.dispose();
			store.dispose();
		};
	}
}

registerWorkbenchContribution2(MenuCopier.Id, MenuCopier, WorkbenchPhase.AfterRestored);
