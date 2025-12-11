/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { IAgentSession } from './agentSessionsModel.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { AgentSessionsSorter } from './agentSessionsViewer.js';

export class AgentSessionsPicker {
	private readonly sorter = new AgentSessionsSorter();

	constructor(
		private readonly anchor: HTMLElement | undefined,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) { }

	async pickAgentSession(): Promise<void> {
		const picks = this.agentSessionsService.model.sessions
			.filter(session => !session.isArchived())
			.sort(this.sorter.compare.bind(this.sorter))
			.map(session => ({
				label: session.label,
				description: typeof session.description === 'string'
					? session.description
					: undefined,
				iconClass: ThemeIcon.asClassName(session.icon),
				session
			} satisfies IQuickPickItem & { session: IAgentSession }));

		const session = await this.quickInputService.pick(picks, {
			anchor: this.anchor,
			placeHolder: localize('chatAgentPickerPlaceholder', "Select the agent session to view, type to filter all sessions")

		});

		if (session?.session.resource) {
			this.chatWidgetService.openSession(session.session.resource, ChatViewPaneTarget);
		}
	}
}
