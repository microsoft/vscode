/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { AgentSessionStatus } from './agentSessionsModel.js';
import { IChatWidgetService } from '../chat.js';
import { openSession } from './agentSessionsOpener.js';

/**
 * Action to open the most urgent session needing user input
 */
class OpenInputNeededSessionAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openInputNeededSession';

	constructor() {
		super({
			id: OpenInputNeededSessionAction.ID,
			title: localize('openInputNeededSession', "Open Session Needing Input"),
			f1: false, // Don't show in command palette
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const agentSessionsService = accessor.get(IAgentSessionsService);
		const chatWidgetService = accessor.get(IChatWidgetService);

		// Get sessions needing input (excluding those with open widgets)
		const attentionNeededSessions = agentSessionsService.model.sessions.filter(s =>
			s.status === AgentSessionStatus.NeedsInput &&
			!s.isArchived() &&
			!chatWidgetService.getWidgetBySessionResource(s.resource)
		);

		if (attentionNeededSessions.length === 0) {
			return;
		}

		// Sort by most recently started request
		const sorted = [...attentionNeededSessions].sort((a, b) => {
			const timeA = a.timing.lastRequestStarted ?? a.timing.created;
			const timeB = b.timing.lastRequestStarted ?? b.timing.created;
			return timeB - timeA;
		});

		const mostRecent = sorted[0];
		await accessor.get(IInstantiationService).invokeFunction(openSession, mostRecent);
	}
}

registerAction2(OpenInputNeededSessionAction);
