/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent } from '@github/copilot-sdk';
import type { CopilotFusionEvent } from './copilotFusionProgress.js';

export function getFusionEventKey(event: CopilotFusionEvent): string {
	return event.type === 'session.fusion_route_started' || event.type === 'session.fusion_route_failed'
		? `attempt:${event.data.attemptId}` : `fusion:${event.data.fusionId}`;
}

export function getFusionEventSdkTurnId(event: CopilotFusionEvent): string | undefined {
	return event.type === 'session.fusion_resolved' || event.type === 'session.fusion_completed' ? event.data.turnId : undefined;
}

export function isSyntheticUserMessage(event: SessionEvent): boolean {
	return event.type === 'user.message' && !!event.data.source && event.data.source.toLowerCase() !== 'user';
}
