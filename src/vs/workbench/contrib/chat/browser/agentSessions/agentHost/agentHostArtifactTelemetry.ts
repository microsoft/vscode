/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agent.js';
import { ISessionArtifact, SessionArtifactType } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';

type AgentHostSessionArtifactOpenEvent = {
	agentSessionId: string;
	itemCategory: 'artifact' | 'reference';
	itemKind: SessionArtifactType;
};

type AgentHostSessionArtifactOpenClassification = {
	owner: 'bhavyaus';
	comment: 'Tracks when a user opens a recorded Agent Host artifact or reference from the chat input pills of an editor window. The Agents window reports the same interaction as agents/sessionArtifactOpen.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Backend agent host session identifier, matching agentHost.toolInvoked, to correlate opens with the artifacts recorded in the session.' };
	itemCategory: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the opened item was recorded as an artifact or a reference.' };
	itemKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded kind of the opened item: pullRequest, issue, commit, website, file, or resource.' };
};

/**
 * Reports that the user opened a recorded artifact or reference of an Agent Host session.
 */
export function reportAgentHostSessionArtifactOpen(telemetryService: ITelemetryService, backendSession: URI, artifact: Pick<ISessionArtifact, 'type' | 'isArtifact'>): void {
	telemetryService.publicLog2<AgentHostSessionArtifactOpenEvent, AgentHostSessionArtifactOpenClassification>('agentHost.sessionArtifactOpen', {
		agentSessionId: AgentSession.id(backendSession),
		itemCategory: artifact.isArtifact ? 'artifact' : 'reference',
		itemKind: artifact.type,
	});
}
