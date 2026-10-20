/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { open } from 'fs/promises';
import { CancellationError } from '../../../../base/common/errors.js';
import type { CancellationToken } from '../../../../base/common/cancellation.js';
import type { URI } from '../../../../base/common/uri.js';
import { isObject } from '../../../../base/common/types.js';
import type { IAgentChatSessionEvent } from '../../common/agent.js';

const metadataEventTypes = new Set([
	'session.start', 'session.resume', 'session.title_changed', 'session.idle',
	'assistant.turn_start', 'assistant.turn_end',
	'permission.requested', 'permission.completed', 'tool.user_requested',
	'user_input.requested', 'user_input.completed',
	'elicitation.requested', 'elicitation.completed',
	'exit_plan_mode.requested', 'exit_plan_mode.completed',
	'abort',
]);
const maxLineBytes = 1024 * 1024;

/** Only root-agent catalog metadata is admitted; content, auth, configuration and unknown events are excluded. */
export function toCopilotSessionMetadataEvent(chat: URI, event: unknown): IAgentChatSessionEvent | undefined {
	if (!isObject(event)) {
		return undefined;
	}
	const fields = event as Partial<{ type: string; agentId: string; id: string; timestamp: string; data: object; ephemeral: boolean }>;
	if (typeof fields.type !== 'string' || !metadataEventTypes.has(fields.type) || fields.agentId !== undefined
		|| typeof fields.id !== 'string' || !fields.id
		|| typeof fields.timestamp !== 'string' || !Number.isFinite(Date.parse(fields.timestamp))
		|| !isObject(fields.data)) {
		return undefined;
	}
	return { chat, id: fields.id, timestamp: fields.timestamp, persisted: fields.ephemeral !== true, type: fields.type, data: fields.data };
}

/** Reconciles the latest genuine title/state facts after the cursor, with bounded memory and explicit unreadable-record loss. */
export async function* readCopilotSessionMetadataEvents(chat: URI, path: string, token: CancellationToken, afterEventId?: string, onDidReadEventId?: (id: string) => void): AsyncIterable<IAgentChatSessionEvent> {
	const file = await open(path, 'r');
	try {
		const { size, mtimeMs } = await file.stat();
		if (!size) {
			return;
		}
		const stream = file.createReadStream({ end: size - 1, highWaterMark: 64 * 1024, autoClose: false });
		const cancellation = token.onCancellationRequested(() => stream.destroy(new CancellationError()));
		let pending = Buffer.alloc(0);
		let oversized = false;
		let position = 0;
		let foundCursor = afterEventId === undefined;
		let title: { readonly position: number; readonly event: IAgentChatSessionEvent } | undefined;
		let state: { readonly position: number; readonly event: IAgentChatSessionEvent } | undefined;
		let lost = 0;
		let lastLostPosition = 0;
		try {
			for await (const chunk of stream) {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				if (!Buffer.isBuffer(chunk)) {
					throw new Error('Invalid Copilot journal chunk');
				}
				let start = 0;
				while (start < chunk.length) {
					const newline = chunk.indexOf(10, start);
					const end = newline === -1 ? chunk.length : newline;
					const bytes = chunk.subarray(start, end);
					if (!oversized) {
						if (pending.length + bytes.length > maxLineBytes) {
							pending = Buffer.alloc(0);
							oversized = true;
						} else {
							pending = Buffer.concat([pending, bytes]);
						}
					}
					position += end - start + (newline === -1 ? 0 : 1);
					start = end + 1;
					if (newline === -1) {
						continue;
					}
					let event: IAgentChatSessionEvent | undefined;
					let unreadable = oversized;
					if (!oversized) {
						try {
							event = toCopilotSessionMetadataEvent(chat, JSON.parse(pending.toString('utf8')));
						} catch (error) {
							if (!(error instanceof SyntaxError)) { throw error; }
							unreadable = true;
						}
					}
					pending = Buffer.alloc(0);
					oversized = false;
					if (event) {
						onDidReadEventId?.(event.id);
					}
					const lossId = `journal-gap:${position}`;
					if (!foundCursor) {
						if (event?.id === afterEventId || unreadable && lossId === afterEventId) {
							foundCursor = true;
							yield event ?? { chat, id: lossId, timestamp: new Date(mtimeMs).toISOString(), persisted: true, type: 'session.events_truncated', data: { dropped_count: 1 } };
						}
						continue;
					}
					if (afterEventId !== undefined) {
						if (unreadable) {
							yield { chat, id: lossId, timestamp: new Date(mtimeMs).toISOString(), persisted: true, type: 'session.events_truncated', data: { dropped_count: 1 } };
						} else if (event) {
							yield event;
						}
						continue;
					}
					if (unreadable) {
						lost++;
						lastLostPosition = position;
					} else if (event?.type === 'session.title_changed') {
						title = { position, event };
					} else if (event) {
						state = { position, event };
					}
				}
			}
		} finally {
			cancellation.dispose();
			stream.destroy();
		}
		const reconciled = [title, state].filter(value => value !== undefined);
		if (lost) {
			reconciled.push({
				position: lastLostPosition,
				event: {
					chat, id: `journal-gap:${lastLostPosition}`, timestamp: new Date(mtimeMs).toISOString(),
					persisted: true, type: 'session.events_truncated', data: { dropped_count: lost }
				},
			});
		}
		for (const item of reconciled.sort((a, b) => a.position - b.position)) {
			yield item.event;
		}
	} finally {
		await file.close();
	}
}
