/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AssistantMessageToolRequest, JsonValue, SessionEvent } from '@microsoft/copilot-sdk';
import { open } from 'fs/promises';
import { createInterface } from 'readline';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { localize } from '../../../../nls.js';
import type { ILogService } from '../../../log/common/log.js';

/** Recognizes the SDK's journal decoder failure, not general storage or authentication failures. */
export function isCopilotJournalCorruptionError(error: unknown): boolean {
	const message = getErrorMessage(error);
	return /\bSession file is corrupted\b/i.test(message)
		|| (message.includes('Failed to read persisted event journal') && message.includes('Invalid event at line'));
}

type JsonObject = { [key: string]: JsonValue | undefined };

function object(value: JsonValue | undefined): JsonObject | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function string(value: JsonValue | undefined): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/** Projects only validated transcript fields; runtime configuration and rich payloads are never replayed from damaged journals. */
function recoverEvent(value: JsonValue): SessionEvent | undefined {
	const event = object(value);
	const data = object(event?.data);
	if (!event || !data || typeof event.id !== 'string' || !event.id || typeof event.timestamp !== 'string'
		|| !Number.isFinite(Date.parse(event.timestamp)) || !(event.parentId === null || typeof event.parentId === 'string')
		|| !(event.agentId === undefined || typeof event.agentId === 'string') || event.checkpoint === true) {
		return undefined;
	}
	const envelope = { id: event.id, timestamp: event.timestamp, parentId: event.parentId, agentId: event.agentId };
	const legacyAttribution = { parentToolCallId: string(data.parentToolCallId) };
	switch (event.type) {
		case 'user.message':
			if (typeof data.content === 'string') {
				return {
					...envelope, type: event.type,
					data: {
						content: data.content,
						source: string(data.source),
						clientTurnId: string(data.clientTurnId),
						isAutopilotContinuation: data.isAutopilotContinuation === true,
						interactionId: string(data.interactionId),
						delivery: data.delivery === 'steering' || data.delivery === 'queued' || data.delivery === 'idle' ? data.delivery : undefined,
					},
				};
			}
			break;
		case 'assistant.message': {
			if (typeof data.content !== 'string' || typeof data.messageId !== 'string') {
				break;
			}
			const toolRequests: AssistantMessageToolRequest[] = [];
			if (data.toolRequests !== undefined) {
				if (!Array.isArray(data.toolRequests)) {
					break;
				}
				for (const value of data.toolRequests) {
					const request = object(value);
					if (!request || typeof request.toolCallId !== 'string' || typeof request.name !== 'string') {
						return undefined;
					}
					toolRequests.push({ toolCallId: request.toolCallId, name: request.name, arguments: request.arguments });
				}
			}
			return {
				...envelope, type: event.type,
				data: { content: data.content, messageId: data.messageId, reasoningText: string(data.reasoningText), ...legacyAttribution, toolRequests },
			};
		}
		case 'tool.execution_start':
			if (typeof data.toolCallId === 'string' && typeof data.toolName === 'string') {
				return { ...envelope, type: event.type, data: { toolCallId: data.toolCallId, toolName: data.toolName, arguments: data.arguments, ...legacyAttribution } };
			}
			break;
		case 'tool.execution_complete': {
			const result = object(data.result);
			const error = object(data.error);
			if (typeof data.toolCallId !== 'string' || typeof data.success !== 'boolean'
				|| (data.result !== undefined && (!result || typeof result.content !== 'string'))
				|| (data.error !== undefined && (!error || typeof error.message !== 'string'))) {
				break;
			}
			return {
				...envelope, type: event.type,
				data: {
					toolCallId: data.toolCallId, success: data.success, ...legacyAttribution,
					result: result && typeof result.content === 'string' ? { content: result.content, detailedContent: string(result.detailedContent) } : undefined,
					error: error && typeof error.message === 'string' ? { message: error.message, code: string(error.code) } : undefined,
				},
			};
		}
		case 'subagent.started':
			if (typeof data.toolCallId === 'string' && typeof data.agentName === 'string'
				&& typeof data.agentDisplayName === 'string' && typeof data.agentDescription === 'string') {
				return {
					...envelope, type: event.type,
					data: { toolCallId: data.toolCallId, agentName: data.agentName, agentDisplayName: data.agentDisplayName, agentDescription: data.agentDescription, model: string(data.model) },
				};
			}
			break;
		case 'assistant.turn_start':
		case 'assistant.turn_end':
			if (typeof data.turnId === 'string') {
				return { ...envelope, type: event.type, data: { turnId: data.turnId } };
			}
			break;
		case 'session.error':
			if (typeof data.errorType === 'string' && typeof data.message === 'string') {
				return { ...envelope, type: event.type, data: { errorType: data.errorType, message: data.message } };
			}
			break;
		case 'abort':
			if (data.reason === 'user_initiated' || data.reason === 'remote_command' || data.reason === 'user_abort' || data.reason === 'autopilot_credit_limit') {
				return { ...envelope, type: event.type, data: { reason: data.reason } };
			}
			break;
		case 'session.idle':
			return { ...envelope, type: event.type, ephemeral: true, data: {} };
	}
	return undefined;
}

/** Reads a fixed, read-only journal snapshot after the SDK rejects it. Unsupported or invalid records are omitted explicitly. */
export async function recoverCopilotSessionHistory(path: string, logService: ILogService): Promise<SessionEvent[]> {
	const file = await open(path, 'r');
	try {
		const stat = await file.stat();
		if (!stat.isFile()) {
			throw new Error(localize('copilot.historyRecoveryNotFile', "The session history is not a regular file."));
		}
		const { size } = stat;
		if (!size) {
			throw new Error(localize('copilot.historyRecoveryEmpty', "No conversation could be recovered from the damaged session history."));
		}
		const stream = file.createReadStream({ end: size - 1, autoClose: false });
		const lines = createInterface({ input: stream, crlfDelay: Infinity });
		stream.on('error', error => lines.emit('error', error));
		const events: SessionEvent[] = [];
		let omitted = 0;
		try {
			for await (const line of lines) {
				if (!line.trim()) {
					continue;
				}
				let value: JsonValue;
				try {
					value = JSON.parse(line);
				} catch (error) {
					if (!(error instanceof SyntaxError)) {
						throw error;
					}
					omitted++;
					continue;
				}
				const event = recoverEvent(value);
				if (event) {
					events.push(event);
				} else {
					omitted++;
				}
			}
		} finally {
			lines.close();
			stream.destroy();
		}
		logService.warn(`[Copilot] Recovered ${events.length} transcript records from a damaged journal; omitted ${omitted} invalid or unsupported records. Rich payloads are excluded; the original journal was not changed.`);
		if (!events.some(event => event.type === 'user.message' || event.type === 'assistant.message')) {
			throw new Error(localize('copilot.historyRecoveryEmpty', "No conversation could be recovered from the damaged session history."));
		}
		return events;
	} finally {
		await file.close();
	}
}
