/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { AgentMergeRepairAction } from './agentMerge.js';
import { parseAgentMergePrompt } from './agentMergePrompt.js';
import { readArtifactIntegrationRequest } from './meta/agentHostArtifactIntegrationMeta.js';
import { isAgentMergeMessage } from './meta/agentMergeMessageMeta.js';
import { MessageKind, type Message } from './state/sessionState.js';

/**
 * Describes a pull request repair while it runs, such as "Fixing CI". Shared by Agent Merge and the GitHub pull
 * request artifact integration, whose repair actions have the same identities.
 */
export function getPullRequestRepairActivityLabel(action: AgentMergeRepairAction): string {
	switch (action) {
		case 'addressReviews':
			return localize('systemTurnActivity.addressReviews', "Addressing Comments");
		case 'fixCI':
			return localize('systemTurnActivity.fixCI', "Fixing CI");
		case 'resolveConflicts':
			return localize('systemTurnActivity.resolveConflicts', "Updating Branch");
	}
}

/** Parsing an Agent Merge prompt is not free, and the session summary asks again on every update of a running turn. */
const systemTurnActivities = new WeakMap<Message, { readonly activity: string | undefined }>();

/**
 * Describes the turn `message` started when the host sent it on someone's behalf: "Agent Merge: Fixing CI..." for an
 * Agent Merge repair, "Autopilot: Fixing CI..." for an artifact prompt action an Autopilot rule ran, and "Fixing CI..."
 * for one a person or an agent ran. Actions that do not describe themselves while they run, such as those of
 * extensions, are described by their label. `undefined` for any other turn.
 */
export function getSystemTurnActivity(message: Message): string | undefined {
	let cached = systemTurnActivities.get(message);
	if (!cached) {
		cached = { activity: computeSystemTurnActivity(message) };
		systemTurnActivities.set(message, cached);
	}
	return cached.activity;
}

function computeSystemTurnActivity(message: Message): string | undefined {
	if (message.origin.kind !== MessageKind.SystemNotification) {
		return undefined;
	}
	if (isAgentMergeMessage(message)) {
		const actions = parseAgentMergePrompt(message.text)?.actions ?? [];
		const label = actions.length === 1 ? getPullRequestRepairActivityLabel(actions[0]) : localize('systemTurnActivity.pullRequest', "Fixing Pull Request");
		return localize('systemTurnActivity.agentMerge', "Agent Merge: {0}...", label);
	}
	const request = readArtifactIntegrationRequest(message);
	if (!request) {
		return undefined;
	}
	const label = request.action.activityLabel ?? request.action.label;
	return request.source === 'automation'
		? localize('systemTurnActivity.autopilot', "Autopilot: {0}...", label)
		: localize('systemTurnActivity.action', "{0}...", label);
}
