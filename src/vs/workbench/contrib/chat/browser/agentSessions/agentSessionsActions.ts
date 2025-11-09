/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsessionsactions.css';
import { localize } from '../../../../../nls.js';
import { IAgentSessionViewModel } from './agentSessionViewModel.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { EventHelper, h } from '../../../../../base/browser/dom.js';
import { assertReturnsDefined } from '../../../../../base/common/types.js';

//#region Diff Statistics Action

export class AgentSessionShowDiffAction extends Action {

	static ID = 'agentSession.showDiff';

	constructor(
		private readonly session: IAgentSessionViewModel
	) {
		super(AgentSessionShowDiffAction.ID, localize('showDiff', "Open Changes"), undefined, true);
	}

	override async run(): Promise<void> {
		// This will be handled by the action view item
	}

	getSession(): IAgentSessionViewModel {
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

		elements.filesSpan.textContent = diff.files > 0 ? `${diff.files}` : '';
		elements.addedSpan.textContent = diff.insertions > 0 ? `+${diff.insertions}` : '';
		elements.removedSpan.textContent = diff.deletions > 0 ? `-${diff.deletions}` : '';

		label.appendChild(elements.diffContainer);
	}

	override onClick(event: MouseEvent): void {
		EventHelper.stop(event, true);

		const session = this.action.getSession();

		this.commandService.executeCommand(`agentSession.${session.provider.chatSessionType}.openChanges`, this.action.getSession().resource);
	}
}

//#endregion
