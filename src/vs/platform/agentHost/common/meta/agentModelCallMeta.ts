/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../base/common/types.js';
import type { UsageInfo } from '../state/protocol/common/state.js';

export const agentModelCallMetaKey = 'vscode.modelCall';

export interface IAgentModelCallDiagnostics {
	readonly schemaVersion: 1;
	readonly sdkSessionId: string;
	readonly eventId: string;
	readonly apiCallId?: string;
	readonly providerCallId?: string;
	readonly serviceRequestId?: string;
	readonly agentId?: string;
	readonly model?: string;
	readonly turnId?: string;
	readonly durationMs?: number;
	readonly timeToFirstTokenMs?: number;
	readonly outputTtftMs?: number;
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly cacheReadTokens?: number;
}

/** Validates bounded, content-free model-call diagnostics independently of turn aggregates. */
export function readAgentModelCallDiagnostics(usage: UsageInfo): IAgentModelCallDiagnostics | undefined {
	const value = usage._meta?.[agentModelCallMetaKey];
	if (!isObject(value)) {
		return undefined;
	}
	const record = value as Record<string, unknown>;
	if (record.schemaVersion !== 1) {
		return undefined;
	}
	const id = (key: string): string | undefined => {
		const candidate = record[key];
		return typeof candidate === 'string' && candidate.length > 0 && candidate.length <= 256 ? candidate : undefined;
	};
	const measurement = (key: string): number | undefined => {
		const candidate = record[key];
		return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 ? candidate : undefined;
	};
	const sdkSessionId = id('sdkSessionId');
	const eventId = id('eventId');
	if (!sdkSessionId || !eventId) {
		return undefined;
	}
	return {
		schemaVersion: 1, sdkSessionId, eventId,
		apiCallId: id('apiCallId'), providerCallId: id('providerCallId'), serviceRequestId: id('serviceRequestId'),
		agentId: id('agentId'), model: id('model'), turnId: id('turnId'),
		durationMs: measurement('durationMs'), timeToFirstTokenMs: measurement('timeToFirstTokenMs'), outputTtftMs: measurement('outputTtftMs'),
		inputTokens: measurement('inputTokens'), outputTokens: measurement('outputTokens'), cacheReadTokens: measurement('cacheReadTokens'),
	};
}
