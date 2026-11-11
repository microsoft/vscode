/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../chat/browser/actions/chatActions.js';
import { Menus } from '../menus.js';
import { getAgentsChatPartComposerTarget, IAgentsChatPartService } from './agentsChatPart.js';

/** Whether the chat part of the editor window shows. */
export const AgentsChatPartVisibleContext = new RawContextKey<boolean>('agentsChatPartVisible', false, localize('agentsChatPartVisible', "Whether the chat part beside the editor area shows."));

/**
 * Registers the actions of the chat part of an editor window with the Sessions view, until the returned disposable is
 * disposed: a new session in a tab of its own, and focusing and closing the chat part.
 */
export function registerAgentsChatPartActions(): IDisposable {
	const store = new DisposableStore();

	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.newSession',
				title: localize2('agentsView.newSession', "New Session"),
				icon: Codicon.add,
				category: CHAT_CATEGORY,
				f1: true,
				precondition: ChatContextKeys.enabled,
				menu: [{ id: Menus.SidebarSessionsHeader, group: 'navigation', order: 0, when: ChatContextKeys.enabled }],
			});
		}
		async run(accessor: ServicesAccessor): Promise<void> {
			const chatPart = accessor.get(IAgentsChatPartService);
			await chatPart.openComposer(getAgentsChatPartComposerTarget(accessor.get(IWorkspaceContextService)));
		}
	}));

	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.focusChatPart',
				title: localize2('agentsView.focusChatPart', "Focus Chat Part"),
				category: CHAT_CATEGORY,
				f1: true,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, AgentsChatPartVisibleContext),
			});
		}
		run(accessor: ServicesAccessor): void {
			accessor.get(IAgentsChatPartService).focus();
		}
	}));

	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.closeChatPart',
				title: localize2('agentsView.closeChatPart', "Close Chat Part"),
				category: CHAT_CATEGORY,
				f1: true,
				precondition: AgentsChatPartVisibleContext,
			});
		}
		run(accessor: ServicesAccessor): void {
			// The chat part's service shows the Chat view again where closing the chat part should
			accessor.get(IAgentsChatPartService);
			accessor.get(IWorkbenchLayoutService).setPartHidden(true, Parts.CHAT_PART);
		}
	}));

	return store;
}
