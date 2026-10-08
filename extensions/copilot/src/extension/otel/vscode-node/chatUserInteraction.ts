/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOTelService } from '../../../platform/otel/common/otelService';

/** Mirrors src/vs/platform/otel/common/chatUserInteraction.ts at the command boundary. */
export async function recordChatUserInteraction(otel: IOTelService, value: unknown): Promise<void> {
	if (!otel.config.enabled) {
		return;
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Invalid chat user interaction timing');
	}
	const data = value as Record<string, unknown>;
	const isId = (value: unknown): value is string => typeof value === 'string' && /^[\w.-]{1,256}$/.test(value);
	const oneOf = (value: unknown, values: readonly string[]) => typeof value === 'string' && values.includes(value);
	const duration = data.result === 'success' ? data.timeToFirstProgress : data.timeToTermination;
	if (data.schemaVersion !== 1 || !isId(data.rendererId)
		|| (data.requestId !== undefined && !isId(data.requestId))
		|| typeof data.interactionOrdinal !== 'number' || !Number.isSafeInteger(data.interactionOrdinal) || data.interactionOrdinal < 1
		|| !oneOf(data.result, ['success', 'cancelled', 'error', 'completedWithoutProgress', 'notDispatched', 'queued', 'navigated', 'hidden', 'disposed'])
		|| !oneOf(data.requestPhase, ['first', 'followup', 'unknown'])
		|| typeof data.windowVisible !== 'boolean' || typeof data.windowFocused !== 'boolean'
		|| typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0
		|| (data.result === 'success'
			? !data.requestId || !oneOf(data.firstProgressKind, ['text', 'reasoning', 'tool']) || !data.windowVisible || data.timeToTermination !== undefined
			: data.firstProgressKind !== undefined || data.timeToFirstProgress !== undefined)) {
		throw new Error('Invalid chat user interaction timing');
	}
	const attributes: Record<string, string | number | boolean> = {};
	for (const key of ['schemaVersion', 'rendererId', 'interactionOrdinal', 'requestId', 'result', 'requestPhase', 'firstProgressKind', 'timeToFirstProgress', 'timeToTermination', 'windowVisible', 'windowFocused']) {
		const value = data[key];
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			attributes[`vscode.chat.user_interaction.${key}`] = value;
		}
	}
	otel.startSpan('vscode.chat.user_perceived_time_to_first_progress', { attributes }).end();
	await otel.flush();
}
