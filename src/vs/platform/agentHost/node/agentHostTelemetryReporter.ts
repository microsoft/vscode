/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AgentSession } from '../common/agentService.js';
import type { MessageAttachment } from '../common/state/protocol/state.js';
import { isSubagentSession, type SessionState } from '../common/state/sessionState.js';

export type AgentHostUserMessageSentSource = 'direct' | 'queued';

export interface IAgentHostUserMessageSentEvent {
	provider: string;
	agentSessionId: string;
	source: AgentHostUserMessageSentSource;
	isSubagentSession: boolean;
	turnCount: number;
	activeClientId?: string;
	activeClientToolCount?: number;
	activeClientCustomizationCount?: number;
	attachmentCount: number;
}

export type IAgentHostUserMessageSentClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user message was sent directly or from the queued-message flow.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the message was sent to a subagent session.' };
	turnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of completed turns in the session when the message was sent.' };
	activeClientId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The active client identifier for the session, if any.' };
	activeClientToolCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of tools provided by the active client, if any.' };
	activeClientCustomizationCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations provided by the active client, if any.' };
	attachmentCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of attachments included with the user message.' };
	owner: 'roblourens';
	comment: 'Tracks user messages sent from the agent host process to an agent provider.';
};

export class AgentHostTelemetryReporter {

	constructor(private readonly _telemetryService: ITelemetryService) { }

	userMessageSent(provider: string, session: string, sessionState: SessionState | undefined, source: AgentHostUserMessageSentSource, attachments: readonly MessageAttachment[] | undefined): void {
		const attachmentCount = attachments?.length ?? 0;
		const activeClient = sessionState?.activeClient;
		this._telemetryService.publicLog2<IAgentHostUserMessageSentEvent, IAgentHostUserMessageSentClassification>('agentHost.userMessageSent', {
			provider,
			agentSessionId: AgentSession.id(session),
			source,
			isSubagentSession: isSubagentSession(session),
			turnCount: sessionState?.turns.length ?? 0,
			...(activeClient ? {
				activeClientId: activeClient.clientId,
				activeClientToolCount: activeClient.tools.length,
				activeClientCustomizationCount: activeClient.customizations?.length ?? 0,
			} : {}),
			attachmentCount,
		});
	}
}
