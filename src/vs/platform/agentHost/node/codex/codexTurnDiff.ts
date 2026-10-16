/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { resolve } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import type { IFileService } from '../../../files/common/files.js';
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
	readonly added: number;
	readonly removed: number;
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
		let added = 0;
		let removed = 0;
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
				added += lastKind === '+' ? 1 : 0;
				removed += lastKind === '-' ? 1 : 0;
			}
			if (hunk.before.length !== beforeCount || hunk.after.length !== afterCount) {
				throw new Error('Invalid Codex turn diff line counts');
			}
			hunks.push(hunk);
		}
		return { beforePath, afterPath, beforeHash: hashes[1], afterHash: hashes[2], hunks, added, removed };
	});
}

/** Reverses a patch against its exact after content, retaining all unchanged lines and line endings. */
function beforeContent(file: IFileDiff, after: string): string {
	const lines = contentLines(after);
	const before: string[] = [];
	let cursor = 0;
	let beforeLineCount = 0;
	for (const hunk of file.hunks) {
		if (hunk.afterStart < cursor || hunk.afterStart > lines.length
			|| lines.slice(hunk.afterStart, hunk.afterStart + hunk.after.length).join('') !== hunk.after.join('')
			|| beforeLineCount + hunk.afterStart - cursor !== hunk.beforeStart) {
			throw new Error('Codex turn diff does not match the file');
		}
		before.push(lines.slice(cursor, hunk.afterStart).join(''), hunk.before.join(''));
		beforeLineCount += hunk.afterStart - cursor + hunk.before.length;
		cursor = hunk.afterStart + hunk.after.length;
	}
	before.push(lines.slice(cursor).join(''));
	return before.join('');
}

/** Saves one cumulative snapshot per path and turn, independently of chat tool-call presentation. */
export async function storeCodexTurnDiff(notification: TurnDiffUpdatedNotification, context: {
	readonly turnId: string;
	readonly cwd: URI;
	readonly database: ISessionDatabase;
	readonly fileService: IFileService;
	readonly logService: ILogService;
}): Promise<void> {
	const toolCallId = `codex-turn-diff:${notification.threadId}:${notification.turnId}`;
	for (const file of parseTurnDiff(notification.diff, context.cwd)) {
		try {
			const after = file.afterPath ? (await context.fileService.readFile(URI.file(file.afterPath))).value.toString() : '';
			const before = beforeContent(file, after);
			// A user or another tool may have changed the file after the notification.
			// Never turn that content into a historical snapshot or an undo target.
			if ((file.afterPath && blobHash(after) !== file.afterHash) || (file.beforePath && blobHash(before) !== file.beforeHash)
				|| (!file.beforePath && before !== '')) {
				throw new Error('Codex turn diff content hashes do not match');
			}
			const store = (filePath: string, kind: FileEditKind, content: IFileEditContent, addedLines: number, removedLines: number) =>
				context.database.storeFileEdit({ turnId: context.turnId, toolCallId, filePath, kind, ...content, addedLines, removedLines });
			if (file.beforePath && file.afterPath && file.beforePath === file.afterPath) {
				await store(file.afterPath, FileEditKind.Edit, { beforeContent: VSBuffer.fromString(before).buffer, afterContent: VSBuffer.fromString(after).buffer }, file.added, file.removed);
			} else {
				// Record moves by physical path so overwrites and recreated sources compose with other changes in the turn.
				if (file.beforePath) {
					await store(file.beforePath, FileEditKind.Delete, { beforeContent: VSBuffer.fromString(before).buffer }, 0, contentLines(before).length);
				}
				if (file.afterPath) {
					await store(file.afterPath, FileEditKind.Create, { afterContent: VSBuffer.fromString(after).buffer }, contentLines(after).length, 0);
				}
			}
		} catch (error) {
			context.logService.warn(`[Codex] Failed to capture turn diff for ${file.afterPath ?? file.beforePath}`, error);
		}
	}
}
