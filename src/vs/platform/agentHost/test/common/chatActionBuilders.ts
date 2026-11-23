/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionType, type ChatToolCallCompleteAction, type ChatToolCallReadyAction, type ChatToolCallStartAction, type ChatTurnCompleteAction, type ChatTurnStartedAction } from '../../common/state/sessionActions.js';
import { MessageKind } from '../../common/state/sessionState.js';

// Builders for the chat actions that tests construct most often. Each returns the same object, with the
// same key order, as the equivalent inline literal: required fields first, then any optional fields in
// the order they are passed.

/**
 * A user message with `text` starts turn `turnId`, at `startedAt` or else now.
 */
export function chatTurnStarted(turnId: string, text: string, startedAt = new Date().toISOString()): ChatTurnStartedAction {
	return { type: ActionType.ChatTurnStarted, turnId, startedAt, message: { text, origin: { kind: MessageKind.User } } };
}

/**
 * Turn `turnId` completes after `duration` milliseconds.
 */
export function chatTurnComplete(turnId: string, duration: number): ChatTurnCompleteAction {
	return { type: ActionType.ChatTurnComplete, turnId, duration };
}

/**
 * Tool call `toolCallId` starts in turn `turnId`.
 */
export function chatToolCallStart(turnId: string, toolCallId: string, toolName: string, displayName: string, optional?: Omit<ChatToolCallStartAction, 'type' | 'turnId' | 'toolCallId' | 'toolName' | 'displayName'>): ChatToolCallStartAction {
	return { type: ActionType.ChatToolCallStart, turnId, toolCallId, toolName, displayName, ...optional };
}

/**
 * Tool call `toolCallId` in turn `turnId` is ready to run or to be confirmed.
 */
export function chatToolCallReady(turnId: string, toolCallId: string, invocationMessage: ChatToolCallReadyAction['invocationMessage'], optional?: Omit<ChatToolCallReadyAction, 'type' | 'turnId' | 'toolCallId' | 'invocationMessage'>): ChatToolCallReadyAction {
	return { type: ActionType.ChatToolCallReady, turnId, toolCallId, invocationMessage, ...optional };
}

/**
 * Tool call `toolCallId` in turn `turnId` completes with `result`.
 */
export function chatToolCallComplete(turnId: string, toolCallId: string, result: ChatToolCallCompleteAction['result'], optional?: Omit<ChatToolCallCompleteAction, 'type' | 'turnId' | 'toolCallId' | 'result'>): ChatToolCallCompleteAction {
	return { type: ActionType.ChatToolCallComplete, turnId, toolCallId, result, ...optional };
}
