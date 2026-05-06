/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { NoNextEditReason, StreamedEdit } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { ILogger } from '../../../platform/log/common/logService';
import { ErrorUtils } from '../../../util/common/errors';
import { equals as arraysEqual } from '../../../util/vs/base/common/arrays';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { LineReplacement } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { LineRange } from '../../../util/vs/editor/common/core/ranges/lineRange';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { FetchStreamError } from '../common/fetchStreamError';
import { toUniquePath } from '../common/promptCraftingUtils';
import { ResponseTags } from '../common/tags';
import { CurrentDocument } from '../common/xtabCurrentDocument';


class Patch {
	public removedLines: string[] = [];
	public addedLines: string[] = [];

	private constructor(
		/**
		 * Expected to be file path relative to workspace root.
		 */
		public readonly filePath: string,
		public readonly lineNumZeroBased: number,
	) { }

	public static ofLine(line: string): Patch | null {
		const match = line.match(/^(.+):(\d+)$/);
		if (!match) {
			return null;
		}
		const [, filename, lineNumber] = match;
		return new Patch(filename, parseInt(lineNumber, 10));
	}

	addLine(line: string) {
		const contentLine = line.slice(1);
		if (line.startsWith('-')) {
			this.removedLines.push(contentLine);
			return true;
		} else if (line.startsWith('+')) {
			this.addedLines.push(contentLine);
			return true;
		} else {
			return false;
		}
	}

	public toString(): string {
		return [
			`${this.filePath}:${this.lineNumZeroBased}`,
			...this.removedLines.map(l => `-${l}`),
			...this.addedLines.map(l => `+${l}`),
		].join('\n');
	}
}

/**
 * Information about a single duplicate-addition removal.
 *
 * `kind` identifies which heuristic shape fired:
 *   - `'suffix'`: trailing additions matched the lines after the deletion.
 *   - `'prefix'`: leading addition matched the first line after the deletion.
 *   - `'middle'`: a pair of additions inside the patch matched the start of
 *     the following lines (streaming model partially copied the continuation).
 *
 * `removedLines` are the actual addition lines that were dropped (in order),
 * preserved for diagnostics/logging.
 */
export interface DuplicateAdditionRemoval {
	readonly kind: 'suffix' | 'prefix' | 'middle';
	readonly newAdditions: string[];
	readonly removedLines: readonly string[];
}

/**
 * A heuristic line is "meaningful" enough to base a duplicate detection on
 * if it has more than one non-whitespace character. This guards against
 * matching common single-token lines (`}`, `;`, `)`) and blank lines, which
 * frequently appear both in legitimate additions and in surrounding context.
 */
function isMeaningfulLine(line: string): boolean {
	return line.trim().length > 1;
}

/**
 * Checks whether the patch's added lines duplicate the file content immediately
 * following the deleted range, and if so, trims the duplicated lines.
 *
 * The diff-patch model can occasionally regress and emit additions that copy
 * the existing continuation code. When that happens, applying the patch
 * produces visibly duplicated lines in the file (e.g. an extra closing brace
 * after a code block).
 *
 * Three duplication shapes are detected, mirroring the heuristic used in the
 * offline analysis tooling. Only one shape is applied per patch — the checks
 * run in priority order and the first match wins. This avoids cascading
 * removals where one shape's trimming exposes a spurious match for another.
 *
 * Priority order:
 *   1. **Suffix** — last `k` additions match first `k` following lines (most
 *      common case: trailing `}` re-emitted). Picks the longest matching `k`
 *      that survives an extra ambiguity guard: when the match would consume
 *      the entire addition AND every matched line is non-meaningful (e.g. a
 *      single `}`), the heuristic falls through, since that case is
 *      ambiguous between a legitimate inner-scope close and a duplicate.
 *   2. **Prefix** — first addition matches first following line, and the line
 *      is "meaningful" (>1 non-whitespace char) to avoid dropping legitimate
 *      single-token lines (e.g. an inner-scope `}` followed by an outer `}`).
 *   3. **Middle** — a consecutive pair of additions starting at offset > 0
 *      (and not at the end) matches the first two following lines. Both
 *      following lines must be meaningful, again to avoid trivial matches.
 *
 * Returns a `DuplicateAdditionRemoval` describing what was dropped, or
 * `undefined` if no duplication was detected.
 */
export function tryRemoveDuplicateAdditions(
	patch: { readonly addedLines: readonly string[]; readonly removedLines: readonly string[]; readonly lineNumZeroBased: number },
	fileLines: readonly string[],
): DuplicateAdditionRemoval | undefined {
	const { addedLines, removedLines, lineNumZeroBased } = patch;
	if (addedLines.length === 0) {
		return undefined;
	}

	const followingStart = lineNumZeroBased + removedLines.length;
	const following = fileLines.slice(followingStart, followingStart + addedLines.length);
	if (following.length === 0) {
		return undefined;
	}

	// 1. Suffix: longest k where last k additions match first k following lines.
	for (let k = Math.min(addedLines.length, following.length); k >= 1; k--) {
		const tail = addedLines.slice(-k);
		if (!arraysEqual(tail, following.slice(0, k))) {
			continue;
		}
		// Skip when the suffix would consume the entire addition AND every
		// matched line is non-meaningful: that case is genuinely ambiguous
		// (e.g. a single `}` that may be a legitimate inner-scope close).
		// Keep iterating to a smaller k that may still match meaningfully.
		if (k === addedLines.length && tail.every(l => !isMeaningfulLine(l))) {
			continue;
		}
		return {
			kind: 'suffix',
			newAdditions: addedLines.slice(0, addedLines.length - k),
			removedLines: tail,
		};
	}

	// 2. Prefix: first addition matches first following line and is meaningful.
	if (addedLines[0] === following[0] && isMeaningfulLine(addedLines[0])) {
		return {
			kind: 'prefix',
			newAdditions: addedLines.slice(1),
			removedLines: addedLines.slice(0, 1),
		};
	}

	// 3. Middle (e.g. streamEdits): consecutive pair of additions at offset > 0
	//    (and not extending to the end — that case is suffix) matches the first
	//    two following lines. Require both to be meaningful to avoid trivial
	//    matches such as duplicate blank lines.
	if (addedLines.length >= 3 && following.length >= 2 &&
		isMeaningfulLine(following[0]) && isMeaningfulLine(following[1])) {
		const a = following[0];
		const b = following[1];
		for (let start = 1; start < addedLines.length - 1; start++) {
			if (addedLines[start] === a && addedLines[start + 1] === b) {
				return {
					kind: 'middle',
					newAdditions: addedLines.slice(0, start),
					removedLines: addedLines.slice(start),
				};
			}
		}
	}

	return undefined;
}


export class XtabCustomDiffPatchResponseHandler {

	public static async *handleResponse(
		linesStream: AsyncIterable<string>,
		currentDocument: CurrentDocument,
		activeDocumentId: DocumentId,
		workspaceRoot: URI | undefined,
		window: OffsetRange | undefined,
		parentTracer: ILogger,
		removeDuplicates: boolean = false,
	): AsyncGenerator<StreamedEdit, NoNextEditReason, void> {
		const tracer = parentTracer.createSubLogger(['XtabCustomDiffPatchResponseHandler', 'handleResponse']);
		const activeDocRelativePath = toUniquePath(activeDocumentId, workspaceRoot?.path);

		// Tracking for the final return value: if every received patch is
		// dropped by the dedup filter, surface that as `FilteredOut` rather
		// than `NoSuggestions` so callers can distinguish the two cases.
		let yieldedEditCount = 0;
		let droppedByDedupCount = 0;

		try {
			for await (const edit of XtabCustomDiffPatchResponseHandler.extractEdits(linesStream)) {
				const isActiveDoc = edit.filePath === activeDocRelativePath;
				const targetDocument = isActiveDoc
					? activeDocumentId
					: XtabCustomDiffPatchResponseHandler.resolveTargetDocument(edit.filePath, workspaceRoot);
				if (!targetDocument) {
					tracer.error(`Could not resolve target document for edit: ${edit.toString()}`);
					continue;
				}

				// Only attempt dedup for the active document — other files'
				// content is not directly available here.
				if (removeDuplicates && isActiveDoc) {
					const removal = tryRemoveDuplicateAdditions(edit, currentDocument.lines);
					if (removal !== undefined) {
						tracer.trace(`Removed ${removal.removedLines.length} duplicate addition(s) (kind=${removal.kind}) for edit at ${edit.filePath}:${edit.lineNumZeroBased}: ${JSON.stringify(removal.removedLines)}`);
						edit.addedLines = removal.newAdditions;
						if (edit.addedLines.length === 0 && edit.removedLines.length === 0) {
							// No-op patch after dedup — drop it.
							droppedByDedupCount++;
							continue;
						}
					}
				}

				yield {
					edit: XtabCustomDiffPatchResponseHandler.resolveEdit(edit),
					isFromCursorJump: false,
					targetDocument,
					window,
				} satisfies StreamedEdit;
				yieldedEditCount++;
			}
		} catch (e: unknown) {
			if (e instanceof FetchStreamError) {
				return e.reason;
			}
			const err = ErrorUtils.fromUnknown(e);
			return new NoNextEditReason.Unexpected(err);
		}

		// If every received patch was dropped by the dedup filter, signal
		// FilteredOut so that telemetry and downstream handling can
		// distinguish "model produced only duplicate suggestions" from
		// "model produced no suggestions at all".
		if (yieldedEditCount === 0 && droppedByDedupCount > 0) {
			return new NoNextEditReason.FilteredOut(`diffPatch:duplicateAdditions:${droppedByDedupCount}`);
		}

		return new NoNextEditReason.NoSuggestions(currentDocument.content, window, undefined);
	}

	private static resolveEdit(patch: Patch): LineReplacement {
		return new LineReplacement(new LineRange(patch.lineNumZeroBased + 1, patch.lineNumZeroBased + 1 + patch.removedLines.length), patch.addedLines);
	}

	private static resolveTargetDocument(filePath: string, workspaceRoot: URI | undefined): DocumentId | undefined {
		if (isAbsolute(filePath)) {
			return DocumentId.create(URI.file(filePath).toString());
		}
		if (workspaceRoot) {
			return DocumentId.create(URI.joinPath(workspaceRoot, filePath).toString());
		}
		// Relative path with no workspace root — cannot resolve to a valid URI
		return undefined;
	}

	public static async *extractEdits(linesStream: AsyncIterable<string>): AsyncGenerator<Patch> {
		let currentPatch: Patch | null = null;
		for await (const line of linesStream) {
			// if no current patch, try to parse a new one
			if (line.trim() === ResponseTags.NO_EDIT) {
				break;
			}
			if (currentPatch === null) {
				currentPatch = Patch.ofLine(line);
				continue;
			}
			// try to add line to current patch
			if (currentPatch.addLine(line)) {
				continue;
			} else { // line does not belong to current patch, yield current and start new
				if (currentPatch) {
					yield currentPatch;
				}
				currentPatch = Patch.ofLine(line);
			}
		}
		if (currentPatch) {
			yield currentPatch;
		}
	}
}
