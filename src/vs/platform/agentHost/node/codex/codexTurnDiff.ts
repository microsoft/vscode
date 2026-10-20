/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { relative, resolve } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationResult, toFileOperationResult, type IFileService } from '../../../files/common/files.js';
import type { ILogService } from '../../../log/common/log.js';
import type { IFileEditContent, ISessionDatabase } from '../../common/sessionDataService.js';
import { FileEditKind } from '../../common/state/sessionState.js';
import type { TurnDiffUpdatedNotification } from './protocol/generated/v2/TurnDiffUpdatedNotification.js';

interface IDiffHunk {
	readonly beforeStart: number;
	readonly afterStart: number;
	readonly before: string[];
	readonly after: string[];
}

interface IFileDiff {
	readonly beforePath: string | undefined;
	readonly afterPath: string | undefined;
	readonly beforeHash: string;
	readonly afterHash: string;
	readonly hunks: readonly IDiffHunk[];
}

export interface ICodexTurnDiffSnapshot {
	readonly turnId: string;
	readonly diff: string;
	readonly startSequence: number;
	readonly sequence: number;
	readonly fileSequences: ReadonlyMap<string, { readonly first: number; readonly last: number }>;
}

export interface ICodexTurnDiffCapture {
	readonly notification: TurnDiffUpdatedNotification;
	readonly snapshots: readonly ICodexTurnDiffSnapshot[];
	readonly initialDiffs: readonly string[];
}

function contentLines(content: string): string[] {
	return content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function blobHash(content: string): string {
	const bytes = VSBuffer.fromString(content);
	return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes.buffer).digest('hex');
}

/** Parses the git-style, three-context-line diffs emitted by Codex's turn diff tracker. */
function parseTurnDiff(diff: string, cwd: URI): IFileDiff[] {
	return diff.split(/(?=^diff --git )/m).filter(section => section.length > 0).map(section => {
		const lines = section.split('\n');
		const firstHunk = lines.findIndex(line => line.startsWith('@@ '));
		const headers = firstHunk < 0 ? lines : lines.slice(0, firstHunk);
		const hashes = /^index ([a-f0-9]{40})\.\.([a-f0-9]{40})(?: .*)?$/.exec(headers.find(line => line.startsWith('index ')) ?? '');
		if (!lines[0].startsWith('diff --git ') || !hashes) {
			throw new Error('Invalid Codex turn diff headers');
		}
		// Empty-file creates/deletes have no hunks or ---/+++ headers.
		const emptyPath = /^diff --git a\/(.+) b\/\1$/.exec(lines[0])?.[1];
		const beforeHeader = headers.find(line => line.startsWith('--- '))?.slice(4)
			?? (headers.includes('new file mode 100644') ? '/dev/null' : emptyPath && `a/${emptyPath}`);
		const afterHeader = headers.find(line => line.startsWith('+++ '))?.slice(4)
			?? (headers.includes('deleted file mode 100644') ? '/dev/null' : emptyPath && `b/${emptyPath}`);
		const path = (header: string | undefined, prefix: string): string | undefined => {
			if (header === '/dev/null') {
				return undefined;
			}
			if (!header?.startsWith(prefix) || header.length === prefix.length) {
				throw new Error('Invalid Codex turn diff path');
			}
			return resolve(cwd.fsPath, header.slice(prefix.length));
		};
		const beforePath = path(beforeHeader, 'a/');
		const afterPath = path(afterHeader, 'b/');
		if (!beforePath && !afterPath) {
			throw new Error('Codex turn diff has no file');
		}
		const hunks: IDiffHunk[] = [];
		for (let index = firstHunk; index >= 0 && index < lines.length; index++) {
			if (index === lines.length - 1 && lines[index] === '') {
				break;
			}
			const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[index]);
			if (!header) {
				throw new Error('Invalid Codex turn diff hunk');
			}
			const beforeCount = Number(header[2] ?? 1);
			const afterCount = Number(header[4] ?? 1);
			const hunk: IDiffHunk = {
				beforeStart: Number(header[1]) - (beforeCount > 0 ? 1 : 0),
				afterStart: Number(header[3]) - (afterCount > 0 ? 1 : 0),
				before: [], after: [],
			};
			let lastKind: string | undefined;
			while (index + 1 < lines.length && !lines[index + 1].startsWith('@@ ') && lines[index + 1] !== '') {
				const line = lines[++index];
				if (line === '\\ No newline at end of file') {
					if (lastKind === ' ' || lastKind === '-') {
						hunk.before[hunk.before.length - 1] = hunk.before.at(-1)!.slice(0, -1);
					}
					if (lastKind === ' ' || lastKind === '+') {
						hunk.after[hunk.after.length - 1] = hunk.after.at(-1)!.slice(0, -1);
					}
					lastKind = undefined;
					continue;
				}
				lastKind = line[0];
				if (lastKind !== ' ' && lastKind !== '+' && lastKind !== '-') {
					throw new Error('Invalid Codex turn diff line');
				}
				if (lastKind !== '+') {
					hunk.before.push(line.slice(1) + '\n');
				}
				if (lastKind !== '-') {
					hunk.after.push(line.slice(1) + '\n');
				}
			}
			if (hunk.before.length !== beforeCount || hunk.after.length !== afterCount) {
				throw new Error('Invalid Codex turn diff line counts');
			}
			hunks.push(hunk);
		}
		return { beforePath, afterPath, beforeHash: hashes[1], afterHash: hashes[2], hunks };
	});
}

/** Applies hunks in either direction, preserving unchanged text and line endings. */
function applyHunks(file: IFileDiff, content: string, reverse: boolean): string {
	const lines = contentLines(content);
	const result: string[] = [];
	let cursor = 0;
	let targetLineCount = 0;
	for (const hunk of file.hunks) {
		const source = reverse ? hunk.after : hunk.before;
		const target = reverse ? hunk.before : hunk.after;
		const sourceStart = reverse ? hunk.afterStart : hunk.beforeStart;
		const targetStart = reverse ? hunk.beforeStart : hunk.afterStart;
		if (sourceStart < cursor || sourceStart > lines.length
			|| lines.slice(sourceStart, sourceStart + source.length).join('') !== source.join('')
			|| targetLineCount + sourceStart - cursor !== targetStart) {
			throw new Error('Codex turn diff does not match the file');
		}
		result.push(lines.slice(cursor, sourceStart).join(''), target.join(''));
		targetLineCount += sourceStart - cursor + target.length;
		cursor = sourceStart + source.length;
	}
	result.push(lines.slice(cursor).join(''));
	return result.join('');
}

/** Reconstructs related native turns together, then persists one chronological delta per host checkpoint and path. */
export async function storeCodexTurnDiffs(captures: readonly ICodexTurnDiffCapture[], context: {
	readonly relatedDiffs: readonly string[];
	readonly cwd: URI;
	readonly nativeCwd: URI;
	readonly database: ISessionDatabase;
	readonly fileService: IFileService;
	readonly logService: ILogService;
}): Promise<void> {
	const parsed = captures.map(capture => ({
		initialFiles: capture.initialDiffs.flatMap(diff => parseTurnDiff(diff, context.cwd)),
		snapshots: capture.snapshots.map(snapshot => ({
			...snapshot,
			fileSequences: new Map([...snapshot.fileSequences].map(([path, sequence]) => [resolve(context.cwd.fsPath, relative(context.nativeCwd.fsPath, resolve(context.nativeCwd.fsPath, path))), sequence])),
			files: parseTurnDiff(snapshot.diff, context.cwd),
		})),
	}));
	const files = [...parsed.flatMap(capture => [...capture.initialFiles, ...capture.snapshots.flatMap(snapshot => snapshot.files)]),
	...context.relatedDiffs.flatMap(diff => parseTurnDiff(diff, context.cwd))];
	const paths = new Set(files.flatMap(file => [file.beforePath, file.afterPath].filter(path => path !== undefined)));
	const contents = new Map<string, string>();
	const key = (path: string, hash: string) => `${path}\0${hash}`;
	const warn = (path: string, error: unknown) => context.logService.warn(`[Codex] Failed to capture turn diff for ${path}`, error);
	await Promise.all([...paths].map(async path => {
		try {
			const content = (await context.fileService.readFile(URI.file(path))).value.toString();
			contents.set(key(path, blobHash(content)), content);
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				warn(path, error);
			}
		}
	}));
	// A child can replace the parent's after-content before it is stored. Its reverse
	// diff supplies that intermediate content, so both originals remain recoverable.
	const valid = new Set<IFileDiff>();
	let pending = files;
	while (pending.length) {
		const unresolved: IFileDiff[] = [];
		for (const file of pending) {
			const after = file.afterPath ? contents.get(key(file.afterPath, file.afterHash)) : '';
			const before = file.beforePath ? contents.get(key(file.beforePath, file.beforeHash)) : '';
			const source = after ?? before;
			if (source === undefined) {
				unresolved.push(file);
				continue;
			}
			try {
				const reverse = after !== undefined;
				const target = applyHunks(file, source, reverse);
				const targetPath = reverse ? file.beforePath : file.afterPath;
				const targetHash = reverse ? file.beforeHash : file.afterHash;
				if (targetPath ? blobHash(target) !== targetHash : target !== '') {
					throw new Error('Codex turn diff content hashes do not match');
				}
				if (targetPath) {
					contents.set(key(targetPath, targetHash), target);
				}
				valid.add(file);
			} catch (error) {
				warn(file.afterPath ?? file.beforePath!, error);
			}
		}
		if (unresolved.length === pending.length) {
			break;
		}
		pending = unresolved;
	}

	const unavailable = Symbol('unavailable');
	type Content = string | undefined | typeof unavailable;
	interface IEndpoint { readonly content: Content; readonly sequence: number }
	const read = (path: string, hash: string): Content => contents.get(key(path, hash)) ?? unavailable;
	const hosts = new Map<string, { start: number; files: Map<string, { before: IEndpoint; after: IEndpoint }> }>();
	for (const capture of parsed) {
		const original = new Map<string, Content>();
		for (const file of capture.initialFiles) {
			if (file.beforePath && !original.has(file.beforePath)) {
				original.set(file.beforePath, read(file.beforePath, file.beforeHash));
			}
			if (file.afterPath && !original.has(file.afterPath)) {
				original.set(file.afterPath, undefined);
			}
		}
		let previous = original;
		for (const snapshot of capture.snapshots) {
			const current = new Map(original);
			for (const file of snapshot.files) {
				if (file.beforePath !== file.afterPath && file.beforePath) {
					current.set(file.beforePath, valid.has(file) ? undefined : unavailable);
				}
				if (file.afterPath) {
					current.set(file.afterPath, valid.has(file) ? read(file.afterPath, file.afterHash) : unavailable);
				}
			}
			let host = hosts.get(snapshot.turnId);
			if (!host) {
				host = { start: snapshot.startSequence, files: new Map() };
				hosts.set(snapshot.turnId, host);
			}
			host.start = Math.min(host.start, snapshot.startSequence);
			for (const [path, after] of current) {
				const editSequence = snapshot.fileSequences.get(path);
				if (previous.get(path) === after && (!editSequence || editSequence.last < snapshot.startSequence)) {
					continue;
				}
				const before: IEndpoint = { content: previous.get(path), sequence: Math.max(snapshot.startSequence, editSequence?.first ?? snapshot.startSequence) };
				const last: IEndpoint = { content: after, sequence: editSequence?.last ?? snapshot.sequence };
				const existing = host.files.get(path);
				host.files.set(path, {
					before: existing && existing.before.sequence < before.sequence ? existing.before : before,
					after: existing && existing.after.sequence > last.sequence ? existing.after : last,
				});
			}
			previous = current;
		}
	}
	const previous = new Map<string, IEndpoint>();
	for (const [turnId, host] of [...hosts].sort((a, b) => a[1].start - b[1].start)) {
		for (const [path, endpoints] of host.files) {
			const prior = previous.get(path);
			const before = prior ? prior.content : endpoints.before.content;
			const last = prior && prior.sequence > endpoints.after.sequence ? prior : endpoints.after;
			const after = last.content;
			previous.set(path, last);
			if (before === unavailable || after === unavailable) {
				warn(path, new Error('Codex turn diff content is unavailable'));
				continue;
			}
			if (before === after) {
				continue;
			}
			const content: IFileEditContent = {
				beforeContent: before === undefined ? undefined : VSBuffer.fromString(before).buffer,
				afterContent: after === undefined ? undefined : VSBuffer.fromString(after).buffer,
			};
			await context.database.storeFileEdit({
				turnId, toolCallId: `codex-turn-diff:${turnId}`, filePath: path,
				kind: before === undefined ? FileEditKind.Create : after === undefined ? FileEditKind.Delete : FileEditKind.Edit,
				...content, addedLines: undefined, removedLines: undefined,
			});
		}
	}
}
