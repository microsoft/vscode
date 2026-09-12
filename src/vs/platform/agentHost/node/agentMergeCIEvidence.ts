/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { LRUCache } from '../../../base/common/map.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { GitHubWorkflowJob, GitHubWorkflowLog } from '../../github/common/githubPullRequestMutationService.js';
import { AgentMergeCIRequest } from './shared/agentMergeServerTools.js';

export const agentMergeCIResponseBytes = 48_000;
const evidenceLifetime = 5 * 60_000;
const maximumEvidenceEntries = 8;
const maximumEvidenceCharacters = 32 * 1024 * 1024;
const excerptBytes = 6_000;
const lineIndexStride = 1_024;

export interface AgentMergeCIEvidence {
	readonly id: string;
	readonly scope: string;
	readonly runAttempt: number;
	readonly job: GitHubWorkflowJob;
	readonly log: GitHubWorkflowLog;
	readonly lineCount: number;
	/** One UTF-16 offset per 1,024 lines bounds seeking without a full per-line index. */
	readonly lineStartOffsets: Uint32Array;
	readonly expiresAt: number;
}

export interface AgentMergeCIContinuation {
	readonly request: AgentMergeCIRequest;
	readonly summaryOffset?: number;
	readonly signature?: string;
}

/** Holds only redacted, immutable evidence; authorization is rechecked by the tool before every use. */
export class AgentMergeCIEvidenceStore extends Disposable {
	private readonly _entries = new Map<string, AgentMergeCIEvidence>();
	private readonly _listeners = this._register(new DisposableMap<string>());
	private readonly _cursors = new LRUCache<string, AgentMergeCIContinuation & { scope: string; expiresAt: number }>(128);
	private readonly _expiry = this._register(new RunOnceScheduler(() => this._prune(), evidenceLifetime));
	private _characters = 0;

	find(scope: string, jobId: string, runId: string, runAttempt: number): AgentMergeCIEvidence | undefined {
		this._prune();
		const entry = [...this._entries.values()].find(entry => entry.scope === scope && entry.job.id === jobId && entry.job.runId === runId && entry.runAttempt === runAttempt);
		if (!entry) {
			return undefined;
		}
		// Reused evidence must not expire while its new summary is still being assembled.
		const refreshed = { ...entry, expiresAt: Date.now() + evidenceLifetime };
		this._entries.delete(entry.id);
		this._entries.set(entry.id, refreshed);
		return refreshed;
	}

	get(id: string, scope: string): AgentMergeCIEvidence {
		this._prune();
		const entry = this._entries.get(id);
		if (!entry || entry.scope !== scope) {
			throw new Error('Invalid, expired, or unauthorized CI evidence ID. Read a new summary for the active Agent Merge turn.');
		}
		this._entries.delete(id);
		this._entries.set(id, entry);
		return entry;
	}

	canAdd(retainedIds: ReadonlySet<string>, characters = 0): boolean {
		const retained = [...this._entries.values()].filter(entry => retainedIds.has(entry.id));
		return retained.length < maximumEvidenceEntries
			&& retained.reduce((total, entry) => total + entry.log.text.length, characters) <= maximumEvidenceCharacters;
	}

	/** Returns undefined when the log cannot fit without evicting evidence already advertised on this page. */
	tryAdd(scope: string, runAttempt: number, job: GitHubWorkflowJob, log: GitHubWorkflowLog, signal: AbortSignal, retainedIds: ReadonlySet<string> = new Set()): AgentMergeCIEvidence | undefined {
		signal.throwIfAborted();
		if (this._store.isDisposed || log.text.length > maximumEvidenceCharacters) {
			throw new Error('CI evidence storage is unavailable or its memory limit was exceeded.');
		}
		this._prune();
		if (!this.canAdd(retainedIds, log.text.length)) {
			return undefined;
		}
		while (this._entries.size >= maximumEvidenceEntries || this._characters + log.text.length > maximumEvidenceCharacters) {
			this._delete([...this._entries.keys()].find(id => !retainedIds.has(id))!);
		}
		const entry: AgentMergeCIEvidence = {
			id: generateUuid(), scope, runAttempt,
			job: { id: job.id, runId: job.runId, name: job.name.slice(0, 200), headSha: job.headSha, runAttempt: job.runAttempt, checkRunId: job.checkRunId },
			log: { ...log },
			...indexLines(log.text),
			expiresAt: Date.now() + evidenceLifetime,
		};
		this._entries.set(entry.id, entry);
		this._characters += log.text.length;
		this._listeners.set(entry.id, Event.once(Event.fromDOMEventEmitter(signal, 'abort'))(() => this._delete(entry.id)));
		this._expiry.schedule();
		return entry;
	}

	continue(scope: string, continuation: AgentMergeCIContinuation): { cursor: string } {
		const cursor = generateUuid();
		this._cursors.set(cursor, { ...continuation, scope, expiresAt: Date.now() + evidenceLifetime });
		this._expiry.schedule();
		return { cursor };
	}

	resolve(cursor: string, scope: string): AgentMergeCIContinuation {
		this._prune();
		const continuation = this._cursors.get(cursor);
		if (!continuation || continuation.scope !== scope) {
			throw new Error('Invalid, expired, or unauthorized CI cursor. Read a new summary for the active Agent Merge turn.');
		}
		return continuation;
	}

	private _delete(id: string): void {
		const entry = this._entries.get(id);
		if (entry) {
			this._characters -= entry.log.text.length;
			this._entries.delete(id);
			this._listeners.deleteAndDispose(id);
		}
	}

	private _prune(): void {
		for (const entry of this._entries.values()) {
			if (entry.expiresAt <= Date.now()) {
				this._delete(entry.id);
			}
		}
		for (const [id, cursor] of [...this._cursors]) {
			if (cursor.expiresAt <= Date.now()) {
				this._cursors.delete(id);
			}
		}
		if (this._entries.size || this._cursors.size) {
			this._expiry.schedule();
		}
	}

	override dispose(): void {
		this._entries.clear();
		this._cursors.clear();
		this._characters = 0;
		super.dispose();
	}
}

interface CILine {
	readonly line: number;
	readonly column: number;
	readonly text: string;
}

export interface CIExcerpt {
	readonly lines: readonly CILine[];
	readonly next?: AgentMergeCIRequest;
	readonly previous?: AgentMergeCIRequest;
}

export function ciJsonBytes(value: object): number {
	return VSBuffer.fromString(JSON.stringify(value)).byteLength;
}

function indexLines(text: string): Pick<AgentMergeCIEvidence, 'lineCount' | 'lineStartOffsets'> {
	const offsets: number[] = [];
	let lineCount = 0;
	for (let offset = 0; offset < text.length; lineCount++) {
		if (lineCount % lineIndexStride === 0) {
			offsets.push(offset);
		}
		const end = text.indexOf('\n', offset);
		offset = end < 0 ? text.length : end + 1;
	}
	return { lineCount, lineStartOffsets: Uint32Array.from(offsets) };
}

function* linesInRange(entry: AgentMergeCIEvidence, first: number, last: number): Iterable<{ line: number; start: number; end: number }> {
	const text = entry.log.text;
	const checkpoint = Math.floor((first - 1) / lineIndexStride);
	let line = checkpoint * lineIndexStride + 1;
	for (let start = entry.lineStartOffsets[checkpoint] ?? text.length; start < text.length && line <= last; line++) {
		const newline = text.indexOf('\n', start);
		const end = newline < 0 ? text.length : newline;
		if (line >= first) {
			yield { line, start, end: end > start && text[end - 1] === '\r' ? end - 1 : end };
		}
		start = end + 1;
	}
}

export function readCIRange(entry: AgentMergeCIEvidence, request: AgentMergeCIRequest, budget = excerptBytes): CIExcerpt {
	const first = request.startLine ?? 1;
	const last = Math.min(request.endLine ?? first + 199, entry.lineCount);
	if (first > Math.max(1, entry.lineCount)) {
		throw new Error('The requested line is outside the captured CI evidence. The total line count is unknown when complete is false.');
	}
	const result: CILine[] = [];
	let remaining = budget;
	for (const line of linesInRange(entry, first, last)) {
		let column = line.line === first ? request.startColumn ?? 1 : 1;
		if (column > Math.max(1, line.end - line.start)) {
			throw new Error('The requested column is outside the captured CI line.');
		}
		do {
			const text = entry.log.text.slice(line.start + column - 1, Math.min(line.end, line.start + column - 1 + 500));
			const part = { line: line.line, column, text };
			const bytes = ciJsonBytes(part) + 1;
			if (bytes > remaining || result.length >= 200) {
				return { lines: result, next: { mode: 'range', evidenceId: entry.id, startLine: line.line, startColumn: column, endLine: last } };
			}
			result.push(part);
			remaining -= bytes;
			column += text.length;
		} while (line.start + column - 1 < line.end);
	}
	return { lines: result };
}

export function readCITail(entry: AgentMergeCIEvidence, lineCount = 100, budget = excerptBytes): CIExcerpt {
	const candidates = [...linesInRange(entry, Math.max(1, entry.lineCount - lineCount + 1), entry.lineCount)];
	const result: CILine[] = [];
	let remaining = budget;
	for (const line of candidates.reverse()) {
		let end = line.end;
		do {
			const start = Math.max(line.start, end - 200);
			const part = { line: line.line, column: start - line.start + 1, text: entry.log.text.slice(start, end) };
			const bytes = ciJsonBytes(part) + 1;
			if (bytes > remaining || result.length >= 200) {
				return {
					lines: result.reverse(),
					previous: { mode: 'range', evidenceId: entry.id, startLine: Math.max(1, line.line - 199), endLine: line.line },
				};
			}
			result.push(part);
			remaining -= bytes;
			end = start;
		} while (end > line.start);
	}
	const first = result.at(-1)?.line ?? 1;
	return {
		lines: result.reverse(),
		previous: first > 1 ? { mode: 'range', evidenceId: entry.id, startLine: Math.max(1, first - 200), endLine: first - 1 } : undefined,
	};
}

export function searchCIEvidence(entry: AgentMergeCIEvidence, request: AgentMergeCIRequest) {
	const query = new RegExp(escapeRegExpCharacters(request.query!), 'i');
	const first = request.startLine ?? 1;
	if (first > Math.max(1, entry.lineCount)) {
		throw new Error('The search start line is outside the captured CI evidence.');
	}
	const context = request.contextLines ?? 2;
	const matches: { line: number; excerpt: readonly CILine[]; read: AgentMergeCIRequest }[] = [];
	let bytes = 0;
	let scannedThrough = first - 1;
	for (const line of linesInRange(entry, first, Math.min(entry.lineCount, first + 49_999))) {
		if (matches.length >= 5) {
			break;
		}
		const text = entry.log.text.slice(line.start, line.end);
		const index = text.search(query);
		if (index >= 0) {
			const excerpt: CILine[] = [];
			for (const surrounding of linesInRange(entry, Math.max(1, line.line - context), Math.min(entry.lineCount, line.line + context))) {
				const column = surrounding.line === line.line ? index + 1 : 1;
				const length = surrounding.line === line.line ? 200 : 60;
				excerpt.push({ line: surrounding.line, column, text: entry.log.text.slice(surrounding.start + column - 1, Math.min(surrounding.end, surrounding.start + column - 1 + length)) });
			}
			const match = {
				line: line.line, excerpt,
				read: { mode: 'range' as const, evidenceId: entry.id, startLine: line.line, startColumn: index + 1, endLine: line.line },
			};
			const size = ciJsonBytes(match);
			if (bytes + size > 8_000 && matches.length) {
				break;
			}
			matches.push(match);
			bytes += size;
		}
		scannedThrough = line.line;
	}
	return {
		matches,
		scannedThrough,
		next: scannedThrough < entry.lineCount ? { ...request, startLine: scannedThrough + 1 } : undefined,
	};
}

export function ciFailureExcerpt(entry: AgentMergeCIEvidence): readonly CILine[] {
	const result: CILine[] = [];
	for (const line of linesInRange(entry, 1, entry.lineCount)) {
		const text = entry.log.text.slice(line.start, line.end);
		const index = text.search(/\b(?:[1-9]\d* failing|failed|AssertionError|Error|FAIL(?:URE|ED)?)\b|##\[error\]/i);
		if (index >= 0) {
			const column = Math.max(1, index - 40 + 1);
			result.push({ line: line.line, column, text: text.slice(column - 1, column - 1 + 200) });
			if (result.length > 3) {
				result.shift();
			}
		}
	}
	return result;
}

export function ciEvidenceMetadata(entry: AgentMergeCIEvidence) {
	return {
		evidenceId: entry.id,
		runId: entry.job.runId,
		runAttempt: entry.runAttempt,
		jobId: entry.job.id,
		jobHeadSha: entry.job.headSha ?? null,
		jobRunAttempt: entry.job.runAttempt ?? null,
		complete: !entry.log.truncated,
		capturedLines: entry.lineCount,
		lineNumbering: 'One-based lines and UTF-16 columns in the cached redacted text.',
		totalLines: entry.log.truncated ? null : entry.lineCount,
		bytesRead: entry.log.bytesRead ?? null,
		maximumBytes: entry.log.maximumBytes ?? null,
		terminalLimit: entry.log.truncated ? 'Download stopped before EOF. Only the captured prefix is available; the true tail and uncaptured lines are unavailable. Repeating this read cannot extend the download limit.' : null,
		expiresAt: new Date(entry.expiresAt).toISOString(),
	};
}
