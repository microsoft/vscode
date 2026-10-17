/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import type { IArcTextReplacement } from '../../../base/common/editArcTracker.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { IDiffComputeService } from '../common/diffComputeService.js';

/**
 * One recorded edit's change to a file, as reverted by {@link AgentHostFileEditRevert}.
 * `undefined` content means the file did not exist.
 */
export interface IFileEditRevertStep {
	/** Content before the edit. */
	readonly start: Uint8Array | undefined;
	/** Content after the edit. */
	readonly end: Uint8Array | undefined;
}

export const enum FileEditRevertOutcome {
	/** The file is rewritten or recreated. */
	Reverted = 'reverted',
	/** The file already has the content it had before the reverted edits, so nothing is written. */
	AlreadyReverted = 'alreadyReverted',
}

export const enum FileEditRevertConflictReason {
	/** Changes made after the reverted edits overlap them, or the file can't be merged as text. */
	Overlap = 'overlap',
	/** The file changed on disk while the revert was being computed. */
	ChangedDuringRevert = 'changedDuringRevert',
	/** Reverting would delete a file, which cannot be conditional on its content. */
	ConditionalDeleteUnavailable = 'conditionalDeleteUnavailable',
}

/** Thrown when a revert leaves the file untouched because of a conflict. */
export class FileEditRevertConflictError extends Error {
	constructor(readonly reason: FileEditRevertConflictReason) {
		super(`File edit revert conflict: ${reason}`);
	}
}

interface IFileSnapshot {
	readonly bytes: Uint8Array | undefined;
	readonly mtime?: number;
}

/**
 * A revert computed by {@link AgentHostFileEditRevert.prepare}. Nothing is
 * written until {@link apply}, so callers can first make sure the revert can
 * be recorded: a recreated file can't be deleted again safely.
 */
export interface IFileEditRevert {
	readonly outcome: FileEditRevertOutcome;
	/**
	 * Writes the reverted content, provided the file still has the content it
	 * had when the revert was computed. Otherwise throws a conflict and leaves
	 * the file untouched. Does nothing when the file is already reverted.
	 */
	apply(): Promise<void>;
	/**
	 * Puts back the content the file had before {@link apply}, unless something
	 * changed the file since. Does nothing unless {@link apply} may have changed
	 * the file, including when it failed after writing. Returns false when the
	 * file couldn't be put back. A file that {@link apply} recreated can't be
	 * deleted again.
	 */
	undo(): Promise<boolean>;
}

const ALREADY_REVERTED: IFileEditRevert = { outcome: FileEditRevertOutcome.AlreadyReverted, apply: async () => { }, undo: async () => true };

/**
 * An etag that matches no file. `IFileService` lets a write through once the
 * file's modification time advanced as long as its size matches the etag, so
 * a same-length change would be overwritten. With this etag, any newer
 * modification fails the write unless the file already has the new content.
 */
const UNMATCHED_ETAG = 'agent-host-file-edit-revert';

/**
 * Reverts recorded edits to a single file while keeping every other change
 * to it, such as edits the user made between or after them.
 *
 * Steps are ordered from oldest to newest and reverted newest first. Steps
 * that change nothing are skipped. When the file still has the newest step's
 * end content and each step starts where the previous one ended, it is
 * restored byte for byte to the oldest step's start content. Otherwise each
 * step is undone with a line-based three-way merge, and the file is left
 * untouched on any overlap.
 */
export class AgentHostFileEditRevert {

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IDiffComputeService private readonly _diffComputeService: IDiffComputeService,
	) { }

	async prepare(resource: URI, recordedSteps: readonly IFileEditRevertStep[], token: CancellationToken): Promise<IFileEditRevert> {
		// A step that changes nothing, such as a turn whose changes were already
		// discarded, can't be merged when it created and deleted the file.
		const steps = recordedSteps.filter(step => !bytesEqual(step.start, step.end));
		if (steps.length === 0) {
			return ALREADY_REVERTED;
		}

		const current = await this._read(resource);
		throwIfCancelled(token);

		const oldestStart = steps[0].start;
		if (matchesRecorded(current.bytes, oldestStart)) {
			return ALREADY_REVERTED;
		}
		const target = areStepsContiguous(steps) && matchesRecorded(current.bytes, steps[steps.length - 1].end)
			? oldestStart
			: await this._mergeRevert(current.bytes, steps, token);
		throwIfCancelled(token);
		if (target === undefined) {
			throw new FileEditRevertConflictError(FileEditRevertConflictReason.ConditionalDeleteUnavailable);
		}

		let mayHaveChanged = false;
		return {
			outcome: FileEditRevertOutcome.Reverted,
			apply: async () => {
				mayHaveChanged = true;
				try {
					await this._replace(resource, current.bytes, target);
				} catch (error) {
					// Conflicts are detected before anything is written.
					if (error instanceof FileEditRevertConflictError) {
						mayHaveChanged = false;
					}
					throw error;
				}
			},
			undo: async () => {
				if (!mayHaveChanged) {
					return true;
				}
				try {
					await this._replace(resource, target, current.bytes);
					return true;
				} catch (error) {
					if (error instanceof FileEditRevertConflictError) {
						return false;
					}
					throw error;
				}
			},
		};
	}

	private async _mergeRevert(currentBytes: Uint8Array | undefined, steps: readonly IFileEditRevertStep[], token: CancellationToken): Promise<Uint8Array> {
		if (currentBytes === undefined) {
			throw new FileEditRevertConflictError(FileEditRevertConflictReason.Overlap);
		}
		let hasBom = hasUtf8Bom(currentBytes);
		let content = decodeText(currentBytes);
		for (let i = steps.length - 1; i >= 0; i--) {
			throwIfCancelled(token);
			const { start, end } = steps[i];
			if (start === undefined || end === undefined) {
				// A created or deleted file can't be partially reverted.
				throw new FileEditRevertConflictError(FileEditRevertConflictReason.Overlap);
			}
			// The decoded text has no BOM, so revert a BOM the step added or
			// removed separately, unless the file's BOM changed since.
			if (hasBom === hasUtf8Bom(end)) {
				hasBom = hasUtf8Bom(start);
			}
			const base = decodeText(end);
			const [revert, drift] = await Promise.all([
				this._diffComputeService.computeDetailedDiff(base, decodeText(start)),
				this._diffComputeService.computeDetailedDiff(base, content),
			]);
			throwIfCancelled(token);
			if (revert.hitTimeout || drift.hitTimeout) {
				throw new FileEditRevertConflictError(FileEditRevertConflictReason.Overlap);
			}
			const rebased = rebaseLineReplacements(base, revert.replacements, drift.replacements);
			if (!rebased) {
				throw new FileEditRevertConflictError(FileEditRevertConflictReason.Overlap);
			}
			content = applyTextReplacements(content, rebased);
		}
		const encoded = new TextEncoder().encode(content);
		return hasBom ? concatBytes(UTF8_BOM, encoded) : encoded;
	}

	private async _read(resource: URI): Promise<IFileSnapshot> {
		try {
			const content = await this._fileService.readFile(resource);
			return { bytes: content.value.buffer, mtime: content.mtime };
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return { bytes: undefined };
			}
			throw error;
		}
	}

	/**
	 * Replaces the file's content, `undefined` meaning no file, provided it
	 * still has `expected`. Does nothing when it already has `target`, such as
	 * after a write that failed once the content was written. Otherwise throws
	 * a conflict and leaves it untouched.
	 */
	private async _replace(resource: URI, expected: Uint8Array | undefined, target: Uint8Array | undefined): Promise<void> {
		// Re-read just before writing so a change made while the merge was
		// computed is reported instead of overwritten.
		const latest = await this._read(resource);
		if (bytesEqual(latest.bytes, target)) {
			return;
		}
		if (!bytesEqual(latest.bytes, expected)) {
			throw new FileEditRevertConflictError(FileEditRevertConflictReason.ChangedDuringRevert);
		}
		if (target === undefined) {
			throw new FileEditRevertConflictError(FileEditRevertConflictReason.ConditionalDeleteUnavailable);
		}

		try {
			if (latest.bytes === undefined) {
				await this._fileService.createFile(resource, VSBuffer.wrap(target), { overwrite: false });
			} else {
				await this._fileService.writeFile(resource, VSBuffer.wrap(target), { mtime: latest.mtime, etag: UNMATCHED_ETAG });
			}
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_MODIFIED_SINCE) {
				throw new FileEditRevertConflictError(FileEditRevertConflictReason.ChangedDuringRevert);
			}
			throw error;
		}
	}
}

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}

const UTF8_BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);

function hasUtf8Bom(bytes: Uint8Array): boolean {
	return bytes.length >= 3 && bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2];
}

/** Decodes UTF-8 text without its BOM. Content that isn't valid UTF-8 can't be merged and is a conflict. */
function decodeText(bytes: Uint8Array): string {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		throw new FileEditRevertConflictError(FileEditRevertConflictReason.Overlap);
	}
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
	const result = new Uint8Array(a.length + b.length);
	result.set(a, 0);
	result.set(b, a.length);
	return result;
}

function bytesEqual(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
	if (a === undefined || b === undefined) {
		return a === b;
	}
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}

/**
 * Compares recorded contents, where empty content matches a missing file: the
 * edit tracker records a file deleted by a tool as an edit to empty content.
 */
function contentMatches(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
	if (a === undefined || b === undefined) {
		return (a ?? b ?? new Uint8Array()).length === 0;
	}
	return bytesEqual(a, b);
}

/**
 * Compares the file on disk with recorded content. A missing file matches
 * recorded empty content, as in {@link contentMatches}, but a recorded missing
 * file, such as before a turn created it, only matches a missing file.
 */
function matchesRecorded(current: Uint8Array | undefined, recorded: Uint8Array | undefined): boolean {
	return recorded === undefined ? current === undefined : contentMatches(current, recorded);
}

function areStepsContiguous(steps: readonly IFileEditRevertStep[]): boolean {
	for (let i = 1; i < steps.length; i++) {
		if (!contentMatches(steps[i].start, steps[i - 1].end)) {
			return false;
		}
	}
	return true;
}

/** Applies replacements, sorted and disjoint in `text` coordinates, to `text`. */
export function applyTextReplacements(text: string, replacements: readonly IArcTextReplacement[]): string {
	let result = '';
	let offset = 0;
	for (const replacement of replacements) {
		result += text.substring(offset, replacement.start) + replacement.text;
		offset = replacement.endExclusive;
	}
	return result + text.substring(offset);
}

/**
 * Moves `revert` from `base` onto `base` with `drift` applied, so both changes
 * are kept. Both inputs are sorted, disjoint replacements on `base`, and are
 * first widened to whole lines so conflicts are detected per line.
 *
 * Returns `undefined` when the two touch the same lines, except for identical
 * changes, which `drift` already contains.
 */
export function rebaseLineReplacements(base: string, revert: readonly IArcTextReplacement[], drift: readonly IArcTextReplacement[]): IArcTextReplacement[] | undefined {
	const lineStarts = getLineStarts(base);
	const ours = widenToLines(base, lineStarts, revert);
	const theirs = widenToLines(base, lineStarts, drift);

	const result: IArcTextReplacement[] = [];
	let delta = 0;
	let j = 0;
	const consume = () => {
		delta += theirs[j].text.length - (theirs[j].endExclusive - theirs[j].start);
		j++;
	};
	for (const replacement of ours) {
		while (j < theirs.length && isBefore(theirs[j], replacement)) {
			if (joinsLines(theirs[j], replacement)) {
				return undefined;
			}
			consume();
		}
		if (j < theirs.length && isSameReplacement(theirs[j], replacement)) {
			consume();
			continue;
		}
		if (j < theirs.length && (overlaps(theirs[j], replacement) || joinsLines(replacement, theirs[j]))) {
			return undefined;
		}
		result.push({ start: replacement.start + delta, endExclusive: replacement.endExclusive + delta, text: replacement.text });
	}
	return result;
}

function isEmptyReplacement(replacement: IArcTextReplacement): boolean {
	return replacement.start === replacement.endExclusive;
}

/**
 * Whether `insertion` starts where `replacement` ends and the replacement's
 * text doesn't end with a line break, so the inserted text would join the
 * replacement's last line, e.g. after reverting an added trailing newline.
 */
function joinsLines(replacement: IArcTextReplacement, insertion: IArcTextReplacement): boolean {
	return isEmptyReplacement(insertion)
		&& !isEmptyReplacement(replacement)
		&& replacement.endExclusive === insertion.start
		&& replacement.text.length > 0
		&& !endsWithLineBreak(replacement.text);
}

/** Whether `other` lies entirely before `replacement`, so it only shifts its position. */
function isBefore(other: IArcTextReplacement, replacement: IArcTextReplacement): boolean {
	if (other.endExclusive !== replacement.start) {
		return other.endExclusive < replacement.start;
	}
	// Two insertions at the same offset have no defined order.
	return !(isEmptyReplacement(other) && isEmptyReplacement(replacement));
}

/** Precondition: `other` is not {@link isBefore} `replacement`. */
function overlaps(other: IArcTextReplacement, replacement: IArcTextReplacement): boolean {
	return other.start < replacement.endExclusive
		|| (other.start === replacement.start && isEmptyReplacement(other) && isEmptyReplacement(replacement));
}

function isSameReplacement(a: IArcTextReplacement, b: IArcTextReplacement): boolean {
	return a.start === b.start && a.endExclusive === b.endExclusive && a.text === b.text;
}

function getLineStarts(text: string): number[] {
	const lineStarts = [0];
	for (let i = 0; i < text.length; i++) {
		const charCode = text.charCodeAt(i);
		if (charCode === 13 /* \r */) {
			if (text.charCodeAt(i + 1) === 10 /* \n */) {
				i++;
			}
			lineStarts.push(i + 1);
		} else if (charCode === 10 /* \n */) {
			lineStarts.push(i + 1);
		}
	}
	return lineStarts;
}

/** Index of the last line start at or before `offset`. */
function findLineIndex(lineStarts: readonly number[], offset: number): number {
	let low = 0;
	let high = lineStarts.length - 1;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (lineStarts[mid] <= offset) {
			low = mid;
		} else {
			high = mid - 1;
		}
	}
	return low;
}

function endsWithLineBreak(text: string): boolean {
	return text.endsWith('\n') || text.endsWith('\r');
}

/**
 * Widens each replacement to whole lines of `base`, merging replacements that
 * end up on the same lines. Inserting complete lines at a line start stays an
 * insertion, so it doesn't claim the following line.
 */
function widenToLines(base: string, lineStarts: readonly number[], replacements: readonly IArcTextReplacement[]): IArcTextReplacement[] {
	const lineEndAfter = (offset: number): number => {
		const index = findLineIndex(lineStarts, offset);
		return index + 1 < lineStarts.length ? lineStarts[index + 1] : base.length;
	};

	const groups: { start: number; endExclusive: number; members: IArcTextReplacement[] }[] = [];
	for (const replacement of replacements) {
		const start = lineStarts[findLineIndex(lineStarts, replacement.start)];
		let endExclusive: number;
		if (isEmptyReplacement(replacement) && replacement.start === start && (endsWithLineBreak(replacement.text) || start === base.length)) {
			endExclusive = start;
		} else if (!isEmptyReplacement(replacement) && lineStarts[findLineIndex(lineStarts, replacement.endExclusive)] === replacement.endExclusive) {
			endExclusive = replacement.endExclusive;
		} else {
			endExclusive = lineEndAfter(replacement.endExclusive);
		}

		const previous = groups.at(-1);
		if (previous && start < previous.endExclusive) {
			previous.endExclusive = Math.max(previous.endExclusive, endExclusive);
			previous.members.push(replacement);
		} else {
			groups.push({ start, endExclusive, members: [replacement] });
		}
	}

	return groups.map(group => {
		let text = '';
		let offset = group.start;
		for (const member of group.members) {
			text += base.substring(offset, member.start) + member.text;
			offset = member.endExclusive;
		}
		text += base.substring(offset, group.endExclusive);
		return { start: group.start, endExclusive: group.endExclusive, text };
	});
}
