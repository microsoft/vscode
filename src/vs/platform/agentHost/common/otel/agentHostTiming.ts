/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vBoolean, vEnum, vNumber, vObj, vOptionalProp, vString, type ValidatorType } from '../../../../base/common/validation.js';
import { hasKey } from '../../../../base/common/types.js';

export const AgentHostTurnTimingSpanName = 'vscode.agent_host.turn_timing';
export const AgentHostFirstResponseSpanName = 'vscode.agent_host.first_response';
export const AgentHostTimingAttributePrefix = 'vscode.agent_host.';

/** Content-free renderer measurements; identifiers on this wire are opaque IDs, never URIs. */
export const agentHostFirstResponseValidator = vObj({
	requestId: vString(),
	provider: vString(),
	agentSessionId: vOptionalProp(vString()),
	chatId: vOptionalProp(vString()),
	outcome: vEnum('success', 'cancelled', 'error', 'notDispatched'),
	sessionTurnKind: vEnum('first', 'later', 'unknown'),
	invocationKind: vEnum('newTurn', 'existingTurn', 'subagent', 'unknown'),
	firstResponseTextMs: vOptionalProp(vNumber()),
	rootToolCallsBeforeFirstText: vOptionalProp(vNumber()),
	rendererRootInvocationOrdinal: vOptionalProp(vNumber()),
	trustInteractionRequired: vBoolean(),
	totalElapsedMs: vNumber(),
	hasResponseText: vBoolean(),
});

export type IAgentHostFirstResponseDiagnostic = ValidatorType<typeof agentHostFirstResponseValidator>;

export interface IAgentHostTurnTimingDiagnostic {
	provider: string;
	turnId: string;
	agentSessionId: string;
	chatId?: string;
	isSubagentSession: boolean;
	result: 'success' | 'error' | 'cancelled';
	totalTime: number;
	timeToProviderDispatch?: number;
	timeToFirstProgress?: number;
	timeToFirstSubstantiveProgress?: number;
	sendStageWorkingDirectoryMs?: number;
	sendStageModelSelectionMs?: number;
	sendStageAttachmentsMs?: number;
	sendStageContributionsMs?: number;
	sendStageCheckpointMs?: number;
	hostRootTurnOrdinal?: number;
	hostProcessAgeMs?: number;
	titleGenerationStrategy?: 'activeAgent' | 'utility' | 'deferred';
}

/** Project an allowlist, preserving observed zeroes and omitting invalid or unavailable values. */
export function agentHostTimingAttributes(diagnostic: IAgentHostTurnTimingDiagnostic | IAgentHostFirstResponseDiagnostic, source: 'host' | 'renderer'): Record<string, string | number | boolean> | undefined {
	const turnId = hasKey(diagnostic, { turnId: true }) ? diagnostic.turnId : diagnostic.requestId;
	const isIdentifier = (value: string | undefined): value is string => typeof value === 'string' && /^[\w.-]{1,256}$/.test(value);
	if (!isIdentifier(diagnostic.provider) || !isIdentifier(turnId)) {
		return undefined;
	}
	const attributes: Record<string, string | number | boolean> = {};
	const put = (key: string, value: string | number | boolean) => attributes[`${AgentHostTimingAttributePrefix}${key}`] = value;
	put('schemaVersion', 1);
	put('source', source);
	put('provider', diagnostic.provider);
	put('turnId', turnId);
	for (const key of ['agentSessionId', 'chatId'] as const) {
		const value = diagnostic[key];
		if (isIdentifier(value)) {
			put(key, value);
		}
	}
	const measurement = (key: string, value: number | undefined) => {
		if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
			put(key, value);
		}
	};
	if (hasKey(diagnostic, { turnId: true })) {
		put('result', diagnostic.result);
		put('isSubagentSession', diagnostic.isSubagentSession);
		if (diagnostic.titleGenerationStrategy !== undefined) {
			put('titleGenerationStrategy', diagnostic.titleGenerationStrategy);
		}
		for (const key of ['totalTime', 'timeToProviderDispatch', 'timeToFirstProgress', 'timeToFirstSubstantiveProgress', 'sendStageWorkingDirectoryMs', 'sendStageModelSelectionMs', 'sendStageAttachmentsMs', 'sendStageContributionsMs', 'sendStageCheckpointMs', 'hostRootTurnOrdinal', 'hostProcessAgeMs'] as const) {
			measurement(key, diagnostic[key]);
		}
	} else {
		put('requestId', diagnostic.requestId);
		put('outcome', diagnostic.outcome);
		put('sessionTurnKind', diagnostic.sessionTurnKind);
		put('invocationKind', diagnostic.invocationKind);
		put('trustInteractionRequired', diagnostic.trustInteractionRequired);
		put('hasResponseText', diagnostic.hasResponseText);
		if (diagnostic.hasResponseText) {
			for (const key of ['firstResponseTextMs', 'rootToolCallsBeforeFirstText'] as const) {
				measurement(key, diagnostic[key]);
			}
		}
		for (const key of ['rendererRootInvocationOrdinal', 'totalElapsedMs'] as const) {
			measurement(key, diagnostic[key]);
		}
	}
	return attributes;
}
