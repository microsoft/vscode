/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent } from '@github/copilot-sdk';
import { LRUCache } from '../../../../base/common/map.js';
import type { CopilotFusionEvent } from './copilotFusionProgress.js';

/** Follows early Fusion routing through the durable event chain to its genuine user-message echo. */
export class CopilotFusionRequestCorrelation {
	private readonly _resolutions = new LRUCache<string, { readonly fusionId: string; readonly turnId: string }>(512);

	getPrecedingResolution(event: SessionEvent): { readonly fusionId: string; readonly turnId: string } | undefined {
		return event.parentId ? this._resolutions.get(event.parentId) : undefined;
	}

	observe(event: SessionEvent, isKnownResolution = false): void {
		if (!event.agentId && (event.type === 'abort' || event.type === 'session.idle' || event.type === 'session.error')) {
			this.clear();
			return;
		}
		if (!event.agentId && event.type === 'session.fusion_completed') {
			for (const [id, resolution] of [...this._resolutions]) {
				if (resolution.fusionId === event.data.fusionId) {
					this._resolutions.delete(id);
				}
			}
		}
		if (event.ephemeral || (event.type === 'user.message' && !event.agentId && !isSyntheticUserMessage(event))) {
			return;
		}
		// A late known resolution carries the chain forward without replacing the pending workflow.
		const resolution = event.type === 'session.fusion_resolved' && !event.agentId && !isKnownResolution
			? { fusionId: event.data.fusionId, turnId: event.data.turnId }
			: this.getPrecedingResolution(event);
		if (resolution !== undefined) {
			this._resolutions.set(event.id, resolution);
		}
	}

	clear(): void {
		this._resolutions.clear();
	}
}

export function getFusionEventKey(event: CopilotFusionEvent): string {
	return event.type === 'session.fusion_route_started' || event.type === 'session.fusion_route_failed'
		? `attempt:${event.data.attemptId}` : `fusion:${event.data.fusionId}`;
}

/** Fusion workflow turn IDs need not match the agent-loop IDs on user messages or assistant turn boundaries. */
export function getFusionEventSdkTurnId(event: CopilotFusionEvent): string | undefined {
	return event.type === 'session.fusion_resolved' || event.type === 'session.fusion_completed' ? event.data.turnId : undefined;
}

export function isSyntheticUserMessage(event: SessionEvent): boolean {
	return event.type === 'user.message' && !!event.data.source && event.data.source.toLowerCase() !== 'user' && !isInterAgentUserMessage(event);
}

export function isInterAgentUserMessage(event: SessionEvent): boolean {
	return event.type === 'user.message' && !!event.agentId && !!event.data.source?.toLowerCase().startsWith('agent-');
}
