/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { isPlainRecord } from '../../common/agentHostModelSelection.js';
import type { AgentHostTeamWorkRequest } from '../../common/agentHostPersistentTeam.js';
import { PersistentTeamToolName } from '../../common/serverToolNames.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import type { IAgentHostPersistentTeamService } from '../agentHostPersistentTeamService.js';
import type { IServerToolGroup } from './agentServerToolHost.js';

function parseWorkRequest(value: unknown): AgentHostTeamWorkRequest {
	if (isPlainRecord(value)) {
		if (value.action === 'phase' && (value.phase === 'manager' || value.phase === 'integration')) {
			return { action: value.action, phase: value.phase };
		}
		if (value.role === 'worker' || value.role === 'scout') {
			if (value.action === 'assign' && typeof value.objective === 'string' && value.objective.trim() && typeof value.deliverable === 'string' && value.deliverable.trim()) {
				return { action: value.action, role: value.role, objective: value.objective, deliverable: value.deliverable };
			}
			if (value.action === 'review' && typeof value.reportId === 'string' && value.reportId && typeof value.accept === 'boolean' && typeof value.feedback === 'string' && value.feedback.trim()) {
				return { action: value.action, role: value.role, reportId: value.reportId, accept: value.accept, feedback: value.feedback };
			}
		}
	}
	throw new Error('Invalid manage_team input. Assign requires role, objective and deliverable; review requires role, reportId, accept and feedback; phase requires manager or integration.');
}

export function createPersistentTeamServerToolGroup(teams?: IAgentHostPersistentTeamService): IServerToolGroup {
	return {
		definitions: [{
			name: PersistentTeamToolName,
			title: 'Manage Team Work',
			description: 'Manage the current Team task as its Lead. Record each engineer objective and deliverable before dispatching work with send_message. Review each exact host-delivered report with accept and concrete feedback; rejected work goes back to the same engineer via send_message. This tool records durable workflow decisions, not messages or permission approvals. Integration requires every current report accepted and all engineers idle. After requesting a phase change, yield for the host to apply it. Reuse the existing engineers, do not poll, and do not retry failed work without the user.',
			inputSchema: {
				type: 'object',
				properties: {
					action: { type: 'string', enum: ['assign', 'review', 'phase'] },
					role: { type: 'string', enum: ['worker', 'scout'] },
					objective: { type: 'string', description: 'Concrete engineering work and ownership boundaries.' },
					deliverable: { type: 'string', description: 'Expected result and acceptance criteria, including verification.' },
					reportId: { type: 'string', description: 'Exact current report ID delivered by the host.' },
					accept: { type: 'boolean', description: 'Whether the deliverable meets its acceptance criteria. False requests rework.' },
					feedback: { type: 'string', description: 'Review findings and evidence, or concrete corrections for the owning engineer.' },
					phase: { type: 'string', enum: ['manager', 'integration'] },
				},
				required: ['action'],
			},
		}],
		isEnabled: name => !!teams && name === PersistentTeamToolName,
		isEnabledForSession: (_name, session) => teams?.getLeadPhase(session, buildDefaultChatUri(session)) !== undefined,
		execute: (_state, context, name, args) => {
			if (!teams || name !== PersistentTeamToolName || !context.turnId) {
				throw new Error('Team work management requires an active Lead turn.');
			}
			return teams.manageWork(context.sessionUri, context.chatUri, context.turnId, parseWorkRequest(args));
		},
		getDisplay: (_name, _args, result) => ({
			displayName: localize('persistentTeam.manageWork', "Manage Team Work"),
			invocationMessage: localize('persistentTeam.managingWork', "Managing engineer assignments and reviews"),
			pastTenseMessage: result?.success === false
				? localize('persistentTeam.manageWorkFailed', "Could not update Team work")
				: localize('persistentTeam.managedWork', "Updated Team work"),
		}),
	};
}
