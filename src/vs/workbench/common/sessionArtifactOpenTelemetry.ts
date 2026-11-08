/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';

/** The window surface an agent session artifact was opened from. */
export type SessionArtifactOpenSurface = 'agentsWindow' | 'editorWindow';

/** Bounded kind of an opened agent session artifact. */
export type SessionArtifactOpenKind = 'pullRequest' | 'issue' | 'commit' | 'website' | 'file' | 'resource';

/** Whether an opened item was recorded on the session, or derived from an image the agent generated in its response. */
export type SessionArtifactOpenSource = 'recorded' | 'generatedImage';

export interface ISessionArtifactOpen {
	readonly surface: SessionArtifactOpenSurface;
	/** SHA-1 hash of the Agents window session id. */
	readonly agentSessionId?: string;
	/** Backend agent host session id, as reported by agentHost.toolInvoked. */
	readonly backendSessionId?: string;
	readonly kind: SessionArtifactOpenKind;
	readonly isArtifact: boolean;
	readonly source: SessionArtifactOpenSource;
}

type SessionArtifactOpenEvent = {
	surface: SessionArtifactOpenSurface;
	agentSessionId?: string;
	backendSessionId?: string;
	itemCategory: 'artifact' | 'reference';
	itemKind: SessionArtifactOpenKind;
	itemSource: SessionArtifactOpenSource;
};

type SessionArtifactOpenClassification = {
	owner: 'benibenj';
	comment: 'Tracks when a user opens a recorded artifact or reference of an agent session, from the Agents window or an editor window.';
	surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the item was opened from the Agents window or an editor window.' };
	agentSessionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SHA-1 hash of the globally unique Agents window session identifier, used to correlate opens for the same session without exposing provider or resource details. Only reported from the Agents window.' };
	backendSessionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Backend agent host session identifier, matching agentHost.toolInvoked, to correlate opens with the artifacts recorded in the session. Only reported from an editor window, for VS Code agent hosts; omitted for other hosts, whose session resources are opaque.' };
	itemCategory: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the opened item was recorded as an artifact or a reference.' };
	itemKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded kind of the opened item: pullRequest, issue, commit, website, file, or resource.' };
	itemSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the opened item was recorded on the session (by the agent or a host action) or is an image the agent generated in its response, which is listed without being recorded.' };
};

/**
 * Reports that the user opened a recorded artifact or reference of an agent session.
 */
export function reportSessionArtifactOpen(telemetryService: ITelemetryService, open: ISessionArtifactOpen): void {
	telemetryService.publicLog2<SessionArtifactOpenEvent, SessionArtifactOpenClassification>('agents/sessionArtifactOpen', {
		surface: open.surface,
		...(open.agentSessionId !== undefined ? { agentSessionId: open.agentSessionId } : {}),
		...(open.backendSessionId !== undefined ? { backendSessionId: open.backendSessionId } : {}),
		itemCategory: open.isArtifact ? 'artifact' : 'reference',
		itemKind: open.kind,
		itemSource: open.source,
	});
}
