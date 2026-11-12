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
			return localize('autopilotActivity.addressReviews', "Addressing Comments");
		case 'fixCI':
			return localize('autopilotActivity.fixCI', "Fixing CI");
		case 'resolveConflicts':
			return localize('autopilotActivity.resolveConflicts', "Updating Branch");
	}
}

/** Parsing an Agent Merge prompt is not free, and the session summary asks again on every update of a running turn. */
const autopilotTurnActivities = new WeakMap<Message, { readonly activity: string | undefined }>();

/**
 * Describes the turn `message` started when Autopilot started it, such as "Autopilot: Fixing CI...": an Agent Merge
 * repair, or an artifact action an Autopilot rule ran. Integrations that do not describe their action while it runs,
 * such as those of extensions, are described by the action's label. `undefined` for any other turn.
 */
export function getAutopilotTurnActivity(message: Message): string | undefined {
	let cached = autopilotTurnActivities.get(message);
	if (!cached) {
		cached = { activity: computeAutopilotTurnActivity(message) };
		autopilotTurnActivities.set(message, cached);
	}
	return cached.activity;
}

function computeAutopilotTurnActivity(message: Message): string | undefined {
	if (message.origin.kind !== MessageKind.SystemNotification) {
		return undefined;
	}
	let label: string;
	if (isAgentMergeMessage(message)) {
		const actions = parseAgentMergePrompt(message.text)?.actions ?? [];
		label = actions.length === 1 ? getPullRequestRepairActivityLabel(actions[0]) : localize('autopilotActivity.pullRequest', "Fixing Pull Request");
	} else {
		const request = readArtifactIntegrationRequest(message);
		if (request?.source !== 'automation') {
			return undefined;
		}
		label = request.action.activityLabel ?? request.action.label;
	}
	return localize('autopilotActivity', "Autopilot: {0}...", label);
}
