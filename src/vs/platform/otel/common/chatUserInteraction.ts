/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vBoolean, vEnum, vNumber, vObj, vOptionalProp, vString, type ValidatorType } from '../../../base/common/validation.js';

export const ChatUserInteractionSpanName = 'vscode.chat.user_perceived_time_to_first_progress';
export const ChatUserInteractionAttributePrefix = 'vscode.chat.user_interaction.';
export const ReportChatUserInteractionCommand = 'github.copilot.chat.otel.recordUserInteraction';

/** Content-free wire contract shared by renderer and Agent Host. The extension mirrors this boundary. */
export const chatUserInteractionValidator = vObj({
	schemaVersion: vNumber(),
	rendererId: vString(),
	interactionOrdinal: vNumber(),
	requestId: vOptionalProp(vString()),
	result: vEnum('success', 'cancelled', 'error', 'completedWithoutProgress', 'notDispatched', 'queued', 'navigated', 'hidden', 'disposed'),
	requestPhase: vEnum('first', 'followup', 'unknown'),
	firstProgressKind: vOptionalProp(vEnum('text', 'reasoning', 'tool')),
	timeToFirstProgress: vOptionalProp(vNumber()),
	timeToTermination: vOptionalProp(vNumber()),
	windowVisible: vBoolean(),
	windowFocused: vBoolean(),
});

export type IChatUserInteractionTiming = ValidatorType<typeof chatUserInteractionValidator>;

export function chatUserInteractionAttributes(value: unknown): Record<string, string | number | boolean> {
	const validated = chatUserInteractionValidator.validate(value);
	if (validated.error) {
		throw new Error('Invalid chat user interaction timing');
	}
	const data = validated.content;
	const isId = (value: string) => /^[\w.-]{1,256}$/.test(value);
	const duration = data.result === 'success' ? data.timeToFirstProgress : data.timeToTermination;
	if (data.schemaVersion !== 1 || !isId(data.rendererId) || (data.requestId !== undefined && !isId(data.requestId))
		|| !Number.isSafeInteger(data.interactionOrdinal) || data.interactionOrdinal < 1
		|| duration === undefined || !Number.isFinite(duration) || duration < 0
		|| (data.result === 'success'
			? !data.requestId || !data.firstProgressKind || !data.windowVisible || data.timeToTermination !== undefined
			: data.firstProgressKind !== undefined || data.timeToFirstProgress !== undefined)) {
		throw new Error('Invalid chat user interaction timing');
	}
	return Object.fromEntries(Object.entries(data)
		.filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
		.map(([key, value]) => [`${ChatUserInteractionAttributePrefix}${key}`, value]));
}
