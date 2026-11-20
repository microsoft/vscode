/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fork } from 'child_process';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { raceTimeout } from '../../../base/common/async.js';
import { FileAccess } from '../../../base/common/network.js';
import { readAgentMessagePresentation } from '../common/meta/agentMessageMeta.js';
import { readForwardedChatErrorFetchType } from '../common/meta/errorMeta.js';
import { ChatTurnMatchKind, ChatTurnReadDirection, type ListChatTurnsParams, type ListChatTurnsResult, type ReadChatTurnsParams, type ReadChatTurnsResult, type SearchChatTurnsParams, type SearchChatTurnsResult } from '../common/state/protocol/channels-chat/commands.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { getTurnError, MessageKind, ResponsePartKind, type Turn } from '../common/state/sessionState.js';
import { DEFAULT_MAX_REASSEMBLY_BYTES } from '../common/webPubSub/chunking.js';
import type { IChatMatchCounts, IChatSearchText } from './chatHistorySearchWorker.js';

const pageBytes = 4 * 1024 * 1024;
const hardBytes = DEFAULT_MAX_REASSEMBLY_BYTES - 1024;
let activeSearches = 0;

function queryLimit(limit: number | undefined, defaultValue: number): number {
	if (limit === undefined) {
		return defaultValue;
	}
	if (!Number.isSafeInteger(limit) || limit < 1) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid chat history limit');
	}
	return Math.min(limit, 100);
}

class ReplyBudget {
	private _bytes = 0;

	add(value: object): boolean {
		const size = Buffer.byteLength(JSON.stringify(value)) + 1;
		if (this._bytes && this._bytes + size > pageBytes) {
			return false;
		}
		if (size > hardBytes) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, 'Chat history item exceeds the transport message size limit');
		}
		this._bytes += size;
		return true;
	}
}

function promptPreview(text: string): string {
	const start = text.search(/\S/);
	if (start === -1) {
		return '';
	}
	const end = text.indexOf('\n', start);
	const line = text.slice(start, end === -1 ? undefined : end).trimEnd();
	const prefix = [...line.slice(0, 162)];
	return prefix.length <= 80 ? line : prefix.slice(0, 79).join('') + '…';
}

function searchText(turn: Turn): IChatSearchText {
	const { hiddenFromTranscript, requestHiddenFromTranscript } = readAgentMessagePresentation(turn.message);
	const error = getTurnError(turn);
	const filter = error && readForwardedChatErrorFetchType(error);
	return {
		request: hiddenFromTranscript || requestHiddenFromTranscript || turn.message.origin.kind === MessageKind.SystemNotification ? '' : turn.message.text,
		markdown: hiddenFromTranscript || filter === 'filtered' || filter === 'filteredRetry' ? [] : turn.responseParts.flatMap(part => part.kind === ResponsePartKind.Markdown && part.content ? [part.content] : []),
	};
}

async function countMatches(params: SearchChatTurnsParams, batch: readonly IChatSearchText[]): Promise<IChatMatchCounts[]> {
	if (activeSearches >= 4) {
		throw new ProtocolError(JsonRpcErrorCodes.InternalError, 'Chat history search is busy');
	}
	const worker = fork(FileAccess.asFileUri('vs/platform/agentHost/node/chatHistorySearchWorker.js').fsPath, [], {
		execArgv: ['--max-old-space-size=96'],
		env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: undefined },
		stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
		serialization: 'advanced',
	});
	activeSearches++;
	const closed = new Promise<void>(resolve => worker.once('close', () => resolve()));
	try {
		const result = await raceTimeout(new Promise<IChatMatchCounts[] | 'invalid'>((resolve, reject) => {
			worker.once('message', resolve);
			worker.once('error', () => reject(new ProtocolError(JsonRpcErrorCodes.InternalError, 'Chat history search worker failed')));
			worker.once('exit', () => reject(new ProtocolError(JsonRpcErrorCodes.InternalError, 'Chat history search worker stopped')));
			worker.send({ params: { query: params.query, matchCase: params.matchCase, wholeWord: params.wholeWord, isRegex: params.isRegex }, batch });
		}), 2000);
		if (!result || result === 'invalid') {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, result ? 'Invalid chat history search pattern' : 'Chat history search exceeded its time budget');
		}
		return result;
	} finally {
		worker.kill('SIGKILL');
		await closed;
		activeSearches--;
	}
}

/** Continuations are authenticated per subscription, without retaining past queries or transcripts. */
export class ChatHistoryQueries {
	private readonly _key = randomBytes(32);
	private _turns?: WeakRef<readonly Turn[]>;
	private _revision = 0;

	private _version(turns: readonly Turn[]): number {
		if (this._turns?.deref() !== turns) {
			this._turns = new WeakRef(turns);
			this._revision++;
		}
		return this._revision;
	}

	private _signature(scope: string, position: Buffer): Buffer {
		return createHmac('sha256', this._key).update(scope).update(position).digest();
	}

	private _cursor(scope: string, version: number, index: number, skip = 0): string {
		const position = Buffer.alloc(12);
		position.writeUInt32BE(version);
		position.writeUInt32BE(index, 4);
		position.writeUInt32BE(skip, 8);
		return Buffer.concat([position, this._signature(scope, position)]).toString('base64url');
	}

	private _resume(scope: string, version: number, cursor: string | undefined, start: number) {
		if (cursor === undefined) {
			return { index: start, skip: 0 };
		}
		const data = typeof cursor === 'string' && cursor.length === 59 ? Buffer.from(cursor, 'base64url') : undefined;
		if (data?.length !== 44 || data.toString('base64url') !== cursor || !timingSafeEqual(data.subarray(12), this._signature(scope, data.subarray(0, 12)))) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid chat history cursor');
		}
		if (data.readUInt32BE() !== version) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'Chat history changed; restart the query');
		}
		return { index: data.readUInt32BE(4), skip: data.readUInt32BE(8) };
	}

	list(turns: readonly Turn[], params: ListChatTurnsParams): ListChatTurnsResult {
		const limit = queryLimit(params.limit, 100);
		const version = this._version(turns);
		const { index } = this._resume('list', version, params.cursor, 0);
		const budget = new ReplyBudget();
		const items: ListChatTurnsResult['items'] = [];
		for (let i = index; i < turns.length; i++) {
			const { id, message, startedAt } = turns[i];
			const presentation = readAgentMessagePresentation(message);
			if (presentation.hiddenFromTranscript || presentation.requestHiddenFromTranscript || message.origin.kind === MessageKind.SystemNotification) {
				continue;
			}
			const item = { turnId: id, preview: promptPreview(message.text), ...(startedAt ? { startedAt } : {}) };
			if (items.length === limit || !budget.add(item)) {
				return { items, nextCursor: this._cursor('list', version, i) };
			}
			items.push(item);
		}
		return { items };
	}

	async search(turns: readonly Turn[], params: SearchChatTurnsParams): Promise<SearchChatTurnsResult> {
		const limit = queryLimit(params.limit, 100);
		if (typeof params.query !== 'string' || !params.query.length || params.query.length > 4096 ||
			[params.isRegex, params.matchCase, params.wholeWord].some(flag => flag !== undefined && typeof flag !== 'boolean')) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid chat history search parameters');
		}
		const version = this._version(turns);
		const scope = JSON.stringify([params.query, !!params.isRegex, !!params.matchCase, !!params.wholeWord]);
		const { index, skip } = this._resume(scope, version, params.cursor, turns.length - 1);
		const batch: IChatSearchText[] = [];
		let chars = 0;
		for (let i = index; i >= 0 && batch.length < 256; i--) {
			const text = searchText(turns[i]);
			const size = text.request.length + text.markdown.reduce((total, part) => total + part.length, 0);
			if (batch.length && chars + size > 1024 * 1024) {
				break;
			}
			if (size > hardBytes) {
				throw new ProtocolError(JsonRpcErrorCodes.InternalError, 'Chat turn exceeds the search size limit');
			}
			batch.push(text);
			chars += size;
		}
		const counts = await countMatches(params, batch);
		const budget = new ReplyBudget();
		const items: SearchChatTurnsResult['items'] = [];
		for (const [offset, { request, response }] of counts.entries()) {
			const i = index - offset;
			for (let n = offset ? 0 : skip; n < request + response; n++) {
				const item = n < response
					? { turnId: turns[i].id, kind: ChatTurnMatchKind.Response, occurrence: response - n - 1 }
					: { turnId: turns[i].id, kind: ChatTurnMatchKind.Request, occurrence: response + request - n - 1 };
				if (items.length === limit || !budget.add(item)) {
					return { items, nextCursor: this._cursor(scope, version, i, n) };
				}
				items.push(item);
			}
		}
		const next = index - batch.length;
		return next >= 0 ? { items, nextCursor: this._cursor(scope, version, next) } : { items };
	}
}

export function readChatTurns(turns: readonly Turn[], params: ReadChatTurnsParams, project: (turn: Turn) => Turn): ReadChatTurnsResult {
	const limit = queryLimit(params.limit, 10);
	const direction = params.direction === undefined ? ChatTurnReadDirection.Around : params.direction;
	if (typeof params.turnId !== 'string' || !params.turnId || (direction !== ChatTurnReadDirection.Around && direction !== ChatTurnReadDirection.Before && direction !== ChatTurnReadDirection.After)) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid chat history window');
	}
	const anchor = turns.findIndex(turn => turn.id === params.turnId);
	if (anchor === -1) {
		throw new ProtocolError(AhpErrorCodes.NotFound, 'Chat history anchor not found');
	}
	const budget = new ReplyBudget();
	const page: Turn[] = [];
	let start = direction === ChatTurnReadDirection.After ? anchor + 1 : anchor;
	let end = start;
	while (page.length < limit) {
		const before = direction === ChatTurnReadDirection.Before || (direction === ChatTurnReadDirection.Around && start > 0 && (end === turns.length || anchor - start < end - anchor));
		const index = before ? start - 1 : end;
		if (index < 0 || index >= turns.length) {
			break;
		}
		const turn = project(turns[index]);
		if (!budget.add(turn)) {
			break;
		}
		if (before) {
			page.unshift(turn);
			start--;
		} else {
			page.push(turn);
			end++;
		}
	}
	return { turns: page, hasBefore: start > 0, hasAfter: end < turns.length };
}
