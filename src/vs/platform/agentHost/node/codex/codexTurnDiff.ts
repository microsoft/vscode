/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { resolve } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationResult, toFileOperationResult, type IFileService } from '../../../files/common/files.js';
import type { ILogService } from '../../../log/common/log.js';

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

/** A path's contents around one observed change, where `undefined` means the file does not exist, and the host turn that owns it. */
export interface ICodexFileChange {
	readonly hostTurnId: string;
	readonly path: string;
	readonly before: string | undefined;
	readonly after: string | undefined;
}

/** An edit whose file changed again before its disk read, kept until a later diff of that path verifies it. */
interface IUnverifiedEdit {
	readonly turn: CodexTurnDiff;
	readonly file: IFileDiff;
	readonly hostTurnId: string;
}

/** State shared by the native turns writing to one chat. */
export class CodexChatDiffs {
	/** Latest contents per path across the chat's native turns. */
	readonly latest = new Map<string, string | undefined>();
	/** Edits awaiting verification, in arrival order. */
	unverified: IUnverifiedEdit[] = [];
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

/**
 * Follows one native Codex turn's cumulative `turn/diff/updated` notifications
 * and reports each update's changes with full file contents.
 */
export class CodexTurnDiff {
	/** Contents when this native turn first touched each path; Codex diffs against these. */
	private readonly _baseline = new Map<string, string | undefined>();
	/** Contents this native turn's previous update reported for every path it touched. */
	private readonly _current = new Map<string, string | undefined>();

	constructor(
		readonly turnId: string,
		private readonly _chat: CodexChatDiffs,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
	) { }

	/** Returns the changes since this native turn's previous update, after earlier edits this update verifies. */
	async update(diff: string, cwd: URI, hostTurnId: string): Promise<ICodexFileChange[]> {
		let files: IFileDiff[];
		try {
			files = parseTurnDiff(diff, cwd);
		} catch (error) {
			this._logService.warn('[Codex] Failed to parse turn diff', error);
			return [];
		}
		const sections = await Promise.all(files.map(async file => ({ file, contents: await this._resolve(file) })));
		const changes = this._verifyEarlierEdits(sections);

		const next = new Map<string, string | undefined>();
		// Codex omits a path once it matches the baseline again.
		const listed = new Set(files.flatMap(file => [file.beforePath, file.afterPath]));
		for (const path of this._current.keys()) {
			if (!listed.has(path)) {
				next.set(path, this._baseline.get(path));
			}
		}
		// A moved-away or deleted source that another section recreates keeps that section's contents.
		const recreated = new Set(sections.flatMap(({ file, contents }) => contents && file.afterPath ? [file.afterPath] : []));
		for (const { file, contents } of sections) {
			if (!contents) {
				continue;
			}
			if (file.beforePath && !this._baseline.has(file.beforePath)) {
				this._baseline.set(file.beforePath, contents.before);
			}
			if (file.afterPath && !this._baseline.has(file.afterPath)) {
				this._baseline.set(file.afterPath, undefined);
			}
			if (file.beforePath && file.beforePath !== file.afterPath && !recreated.has(file.beforePath)) {
				next.set(file.beforePath, undefined);
			}
			if (file.afterPath) {
				next.set(file.afterPath, contents.after);
			}
		}

		// A path changing now orders after every earlier edit of it, and this turn moved past edits of paths it no longer lists.
		this._chat.unverified = this._chat.unverified.filter(edit => {
			const path = edit.file.afterPath!;
			if (next.has(path) || (edit.turn === this && !listed.has(path))) {
				this._logService.warn(`[Codex] Dropped an unverifiable turn diff edit of ${path}`);
				return false;
			}
			return true;
		});
		for (const [path, after] of next) {
			const touched = this._current.has(path);
			const unchanged = (touched ? this._current.get(path) : this._baseline.get(path)) === after;
			// After another turn wrote the path, an unchanged view is a stale re-report or a rewrite; disk tells them apart.
			if (unchanged && (!touched || this._chat.latest.get(path) === after || !await this._isOnDisk(path, after))) {
				continue;
			}
			this._advance(path, after, hostTurnId, changes);
		}
		for (const { file, contents } of sections) {
			if (contents) {
				continue;
			}
			if (file.afterPath !== undefined && file.beforePath === file.afterPath) {
				// Every later update re-lists the section until it verifies; one entry is enough.
				if (!this._chat.unverified.some(edit => edit.turn === this && edit.hostTurnId === hostTurnId && edit.file.afterPath === file.afterPath
					&& edit.file.beforeHash === file.beforeHash && edit.file.afterHash === file.afterHash)) {
					this._chat.unverified.push({ turn: this, file, hostTurnId });
				}
			} else {
				this._logService.warn(`[Codex] Failed to capture turn diff for ${file.afterPath ?? file.beforePath}`);
			}
		}
		return changes;
	}

	/**
	 * Releases this native turn's unverified edits once the diffs that arrived before its completion
	 * have been processed: a diff that can still verify them follows the overwriting write immediately.
	 */
	complete(): void {
		this._chat.unverified = this._chat.unverified.filter(edit => {
			if (edit.turn === this) {
				this._logService.warn(`[Codex] Dropped an unverifiable turn diff edit of ${edit.file.afterPath}`);
				return false;
			}
			return true;
		});
	}

	/** Records `after` as this turn's contents of `path`, starting from where the last writer in the chat left it. */
	private _advance(path: string, after: string | undefined, hostTurnId: string, changes: ICodexFileChange[]): void {
		const before = this._current.has(path) ? this._chat.latest.get(path) : this._baseline.get(path);
		this._current.set(path, after);
		this._chat.latest.set(path, after);
		if (before !== after) {
			changes.push({ hostTurnId, path, before, after });
		}
	}

	/**
	 * Verifies the chat's unverified edits against the contents this update proved, following
	 * hash chains through one another, and records the verified ones in arrival order.
	 */
	private _verifyEarlierEdits(sections: readonly { readonly file: IFileDiff; readonly contents: { readonly before: string | undefined; readonly after: string | undefined } | undefined }[]): ICodexFileChange[] {
		const known = new Map<string, string>();
		const learn = (path: string | undefined, hash: string, content: string | undefined) => {
			if (path !== undefined && content !== undefined) {
				known.set(`${path}\0${hash}`, content);
			}
		};
		for (const { file, contents } of sections) {
			learn(file.beforePath, file.beforeHash, contents?.before);
			learn(file.afterPath, file.afterHash, contents?.after);
		}
		const verified = new Map<IUnverifiedEdit, { readonly before: string; readonly after: string }>();
		for (let progress = known.size > 0; progress;) {
			progress = false;
			for (const edit of this._chat.unverified) {
				const path = edit.file.afterPath!;
				const after = known.get(`${path}\0${edit.file.afterHash}`);
				const before = known.get(`${path}\0${edit.file.beforeHash}`);
				if (verified.has(edit) || (after === undefined && before === undefined)) {
					continue;
				}
				try {
					const contents = after !== undefined
						? { before: applyHunks(edit.file, after, true), after }
						: { before: before!, after: applyHunks(edit.file, before!, false) };
					if (blobHash(contents.before) === edit.file.beforeHash && blobHash(contents.after) === edit.file.afterHash) {
						verified.set(edit, contents);
						learn(path, edit.file.beforeHash, contents.before);
						learn(path, edit.file.afterHash, contents.after);
						progress = true;
					}
				} catch {
					// The hunks do not fit these contents; another chain may still verify the edit.
				}
			}
		}
		const changes: ICodexFileChange[] = [];
		for (const edit of this._chat.unverified) {
			const contents = verified.get(edit);
			if (contents) {
				const path = edit.file.afterPath!;
				if (!edit.turn._baseline.has(path)) {
					edit.turn._baseline.set(path, contents.before);
				}
				edit.turn._advance(path, contents.after, edit.hostTurnId, changes);
			}
		}
		this._chat.unverified = this._chat.unverified.filter(edit => !verified.has(edit));
		return changes;
	}

	/** Whether the file holds `content`, where `undefined` means it does not exist. */
	private async _isOnDisk(path: string, content: string | undefined): Promise<boolean> {
		try {
			return (await this._fileService.readFile(URI.file(path))).value.toString() === content;
		} catch (error) {
			return content === undefined && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND;
		}
	}

	/** Full contents of one diff section, verified against both blob hashes. */
	private async _resolve(file: IFileDiff): Promise<{ readonly before: string | undefined; readonly after: string | undefined } | undefined> {
		try {
			let before = file.beforePath === undefined ? '' : this._baseline.get(file.beforePath);
			let after: string;
			if (before === undefined) {
				// Hunks omit unchanged text, so the first update of an existing file needs its contents from disk.
				after = file.afterPath === undefined ? '' : (await this._fileService.readFile(URI.file(file.afterPath))).value.toString();
				before = applyHunks(file, after, true);
			} else {
				after = applyHunks(file, before, false);
			}
			if ((file.beforePath === undefined ? before !== '' : blobHash(before) !== file.beforeHash)
				|| (file.afterPath === undefined ? after !== '' : blobHash(after) !== file.afterHash)) {
				throw new Error('Codex turn diff does not match the file contents');
			}
			return { before: file.beforePath === undefined ? undefined : before, after: file.afterPath === undefined ? undefined : after };
		} catch (error) {
			this._logService.trace(`[Codex] Could not verify turn diff for ${file.afterPath ?? file.beforePath}`, error);
			return undefined;
		}
	}
}
