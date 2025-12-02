/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsessionsactions.css';
import { localize, localize2 } from '../../../../../nls.js';
import { IAgentSession } from './agentSessionsModel.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { EventHelper, h, hide, show } from '../../../../../base/browser/dom.js';
import { assertReturnsDefined } from '../../../../../base/common/types.js';
import { Action2, ISubmenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { ViewAction } from '../../../../browser/parts/views/viewPane.js';
import { AGENT_SESSIONS_VIEW_ID, AgentSessionProviders, openAgentSessionsView } from './agentSessions.js';
import { AgentSessionsView } from './agentSessionsView.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatService } from '../../common/chatService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';

//#region Item Title Actions

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentSession.archive',
			title: localize2('archive', "Archive"),
			icon: Codicon.archive,
			menu: {
				id: MenuId.AgentSessionItemToolbar,
				group: 'navigation',
				order: 1,
				when: ChatContextKeys.isArchivedItem.negate(),
			}
		});
	}
	run(accessor: ServicesAccessor, session: IAgentSession): void {
		session.setArchived(true);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentSession.unarchive',
			title: localize2('unarchive', "Unarchive"),
			icon: Codicon.inbox,
			menu: {
				id: MenuId.AgentSessionItemToolbar,
				group: 'navigation',
				order: 1,
				when: ChatContextKeys.isArchivedItem,
			}
		});
	}
	run(accessor: ServicesAccessor, session: IAgentSession): void {
		session.setArchived(false);
	}
});

//#endregion

//#region Item Detail Actions

export class AgentSessionShowDiffAction extends Action {

	static ID = 'agentSession.showDiff';

	constructor(
		private readonly session: IAgentSession
	) {
		super(AgentSessionShowDiffAction.ID, localize('showDiff', "Open Changes"), undefined, true);
	}

	override async run(): Promise<void> {
		// This will be handled by the action view item
	}

	getSession(): IAgentSession {
		return this.session;
	}
}

export class AgentSessionDiffActionViewItem extends ActionViewItem {

	override get action(): AgentSessionShowDiffAction {
		return super.action as AgentSessionShowDiffAction;
	}

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(null, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		const label = assertReturnsDefined(this.label);
		label.textContent = '';

		const session = this.action.getSession();
		const diff = session.statistics;
		if (!diff) {
			return;
		}

		const elements = h(
			'div.agent-session-diff-container@diffContainer',
			[
				h('span.agent-session-diff-files@filesSpan'),
				h('span.agent-session-diff-added@addedSpan'),
				h('span.agent-session-diff-removed@removedSpan')
			]
		);

		if (diff.files > 0) {
			elements.filesSpan.textContent = diff.files === 1 ? localize('diffFile', "1 file") : localize('diffFiles', "{0} files", diff.files);
			show(elements.filesSpan);
		} else {
			hide(elements.filesSpan);
		}

		if (diff.insertions >= 0 /* render even `0` for more homogeneity */) {
			elements.addedSpan.textContent = `+${diff.insertions}`;
			show(elements.addedSpan);
		} else {
			hide(elements.addedSpan);
		}

		if (diff.deletions >= 0 /* render even `0` for more homogeneity */) {
			elements.removedSpan.textContent = `-${diff.deletions}`;
			show(elements.removedSpan);
		} else {
			hide(elements.removedSpan);
		}

		label.appendChild(elements.diffContainer);
	}

	override onClick(event: MouseEvent): void {
		EventHelper.stop(event, true);

		const session = this.action.getSession();

		this.commandService.executeCommand(`agentSession.${session.providerType}.openChanges`, this.action.getSession().resource);
	}
}

CommandsRegistry.registerCommand(`agentSession.${AgentSessionProviders.Local}.openChanges`, async (accessor: ServicesAccessor, resource: URI) => {
	const chatService = accessor.get(IChatService);

	const session = chatService.getSession(resource);
	session?.editingSession?.show();
});

//#endregion

//#region View Actions

registerAction2(class extends ViewAction<AgentSessionsView> {
	constructor() {
		super({
			id: 'agentSessionsView.refresh',
			title: localize2('refresh', "Refresh Agent Sessions"),
			icon: Codicon.refresh,
			menu: {
				id: MenuId.AgentSessionsTitle,
				group: 'navigation',
				order: 1
			},
			viewId: AGENT_SESSIONS_VIEW_ID
		});
	}
	runInView(accessor: ServicesAccessor, view: AgentSessionsView): void {
		view.refresh();
	}
});

registerAction2(class extends ViewAction<AgentSessionsView> {
	constructor() {
		super({
			id: 'agentSessionsView.find',
			title: localize2('find', "Find Agent Session"),
			icon: Codicon.search,
			menu: {
				id: MenuId.AgentSessionsTitle,
				group: 'navigation',
				order: 2
			},
			viewId: AGENT_SESSIONS_VIEW_ID
		});
	}
	runInView(accessor: ServicesAccessor, view: AgentSessionsView): void {
		view.openFind();
	}
});

MenuRegistry.appendMenuItem(MenuId.AgentSessionsTitle, {
	submenu: MenuId.AgentSessionsFilterSubMenu,
	title: localize2('filterAgentSessions', "Filter Agent Sessions"),
	group: 'navigation',
	order: 100,
	icon: Codicon.filter
} satisfies ISubmenuItem);

//#endregion

//#region Recent Sessions in Chat View Actions

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentSessions.showAll',
			title: localize2('showAllSessions', "Show All Agent Sessions"),
			icon: Codicon.history,
			menu: {
				id: MenuId.ChatRecentSessionsToolbar,
				group: 'navigation',
				order: 1,
			}
		});
	}
	run(accessor: ServicesAccessor): void {
		openAgentSessionsView(accessor);
	}
});

//#endregion
