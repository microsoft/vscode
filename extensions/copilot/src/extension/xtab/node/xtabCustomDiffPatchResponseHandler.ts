/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { DuplicateAdditionsMode } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { NoNextEditReason, StreamedEdit } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { ILogger } from '../../../platform/log/common/logService';
import { ErrorUtils } from '../../../util/common/errors';
import { equals as arraysEqual } from '../../../util/vs/base/common/arrays';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { LineReplacement } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { LineRange } from '../../../util/vs/editor/common/core/ranges/lineRange';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { AbstractText } from '../../../util/vs/editor/common/core/text/abstractText';
import { FetchStreamError } from '../common/fetchStreamError';
import { toUniquePath } from '../common/promptCraftingUtils';
import { ResponseTags } from '../common/tags';
import { CurrentDocument } from '../common/xtabCurrentDocument';

export { DuplicateAdditionsMode };


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
 * Telemetry-safe summary of a single duplicate-addition detection.
 *
 * Deliberately excludes raw line content (`newAdditions` / `removedLines`)
 * to keep `OnDuplicateRemovedCallback` from accidentally surfacing user
 * source code through telemetry pipelines. Use the internal
 * {@link DuplicateAdditionRemoval} returned by
 * {@link tryRemoveDuplicateAdditions} when you legitimately need the
 * content (e.g. to apply the trim).
 */
export interface DuplicateAdditionRemovalSummary {
	readonly kind: 'suffix' | 'prefix' | 'middle';
	readonly removedLineCount: number;
	readonly remainingAdditionCount: number;
}

/**
 * Callback invoked once per duplicate-addition detection. Receives only
 * redacted, telemetry-safe metadata (counts and shape). The callback fires
 * for every action mode (Log / DropPatch / DropAllRemaining / TrimDuplicate),
 * including `Log` where the patch is not actually modified.
 */
export type OnDuplicateRemovedCallback = (info: {
	readonly summary: DuplicateAdditionRemovalSummary;
	readonly mode: Exclude<DuplicateAdditionsMode, DuplicateAdditionsMode.Off>;
	readonly filePath: string;
	readonly lineNumZeroBased: number;
}) => void;

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
 *      common case: trailing `}` re-emitted). Picks the longest matching `k`.
 *      No additional ambiguity guard is applied: the prior heuristic
 *      preserved single-token suffixes when they consumed the entire
 *      addition (e.g. `addedLines = ['}']` with `following = ['}']`), but
 *      that's the headline-bug case — applying the patch would insert a
 *      stray closing token into already-balanced code. The trade-off is a
 *      rare false positive when the file is mid-typing and unbalanced; the
 *      common case (file is balanced, model is duplicating) is the one we
 *      optimize for.
 *   2. **Prefix** — first addition matches first following line, and the line
 *      is "meaningful" (>1 non-whitespace char) to avoid dropping legitimate
 *      single-token lines (e.g. an inner-scope `}` followed by an outer `}`).
 *   3. **Middle** — a consecutive pair of additions starting at offset > 0
 *      (and not at the end) matches the first two following lines. Both
 *      following lines must be meaningful, again to avoid trivial matches.
 *      The match is then **greedily extended**: only the verified-equal
 *      lines are dropped; any addition lines beyond the equal range are
 *      preserved (the model may have appended new content after the
 *      streaming-style regenerated context).
 *
 * Returns a `DuplicateAdditionRemoval` describing what was dropped, or
 * `undefined` if no duplication was detected.
 */
export function tryRemoveDuplicateAdditions(
	replacement: LineReplacement,
	currentText: AbstractText,
): DuplicateAdditionRemoval | undefined {
	const addedLines = replacement.newLines;
	if (addedLines.length === 0) {
		return undefined;
	}

	// All line numbers here are 1-based (matching `LineRange` and
	// `AbstractText.getLineAt`). `endLineNumberExclusive` is the first line
	// after the deletion — i.e. the first "following" line.
	const followingStartLine1Based = replacement.lineRange.endLineNumberExclusive;
	const fileLineCount = currentText.lineRange.endLineNumberExclusive - 1;
	const followingEndLine1BasedExclusive = Math.min(
		fileLineCount + 1,
		followingStartLine1Based + addedLines.length,
	);
	const following: string[] = [];
	for (let l = followingStartLine1Based; l < followingEndLine1BasedExclusive; l++) {
		following.push(currentText.getLineAt(l));
	}
	if (following.length === 0) {
		return undefined;
	}

	// 1. Suffix: longest k where last k additions match first k following lines.
	for (let k = Math.min(addedLines.length, following.length); k >= 1; k--) {
		const tail = addedLines.slice(-k);
		if (!arraysEqual(tail, following.slice(0, k))) {
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
	//    matches such as duplicate blank lines. After finding the seed pair,
	//    greedily extend `k` while addedLines and `following` continue to
	//    match — only the verified-equal range is dropped.
	if (addedLines.length >= 3 && following.length >= 2 &&
		isMeaningfulLine(following[0]) && isMeaningfulLine(following[1])) {
		const a = following[0];
		const b = following[1];
		for (let start = 1; start < addedLines.length - 1; start++) {
			if (addedLines[start] !== a || addedLines[start + 1] !== b) {
				continue;
			}
			let k = 2;
			while (
				start + k < addedLines.length &&
				k < following.length &&
				addedLines[start + k] === following[k]
			) {
				k++;
			}
			return {
				kind: 'middle',
				newAdditions: [
					...addedLines.slice(0, start),
					...addedLines.slice(start + k),
				],
				removedLines: addedLines.slice(start, start + k),
			};
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
		duplicateAdditionsMode: DuplicateAdditionsMode = DuplicateAdditionsMode.Off,
		onDuplicateRemoved?: OnDuplicateRemovedCallback,
	): AsyncGenerator<StreamedEdit, NoNextEditReason, void> {
		const tracer = parentTracer.createSubLogger(['XtabCustomDiffPatchResponseHandler', 'handleResponse']);
		const activeDocRelativePath = toUniquePath(activeDocumentId, workspaceRoot?.path);

		try {
			let dropAllRemaining = false;
			for await (const edit of XtabCustomDiffPatchResponseHandler.extractEdits(linesStream)) {
				if (dropAllRemaining) {
					continue;
				}

				const isActiveDoc = edit.filePath === activeDocRelativePath;
				const targetDocument = isActiveDoc
					? activeDocumentId
					: XtabCustomDiffPatchResponseHandler.resolveTargetDocument(edit.filePath, workspaceRoot);
				if (!targetDocument) {
					tracer.error(`Could not resolve target document for edit: ${edit.toString()}`);
					continue;
				}

				let lineReplacement = XtabCustomDiffPatchResponseHandler.resolveEdit(edit);

				// Only attempt dedup for the active document — other files'
				// content is not directly available here.
				if (duplicateAdditionsMode !== DuplicateAdditionsMode.Off && isActiveDoc) {
					const removal = tryRemoveDuplicateAdditions(lineReplacement, currentDocument.content);
					if (removal !== undefined) {
						// Log only metadata (kind / counts / location) — do
						// NOT include raw line content. The tracer output
						// may end up in user-visible diagnostics.
						tracer.trace(`Detected duplicate addition(s) (kind=${removal.kind}, count=${removal.removedLines.length}, mode=${duplicateAdditionsMode}) for edit at ${edit.filePath}:${edit.lineNumZeroBased}`);
						onDuplicateRemoved?.({
							summary: {
								kind: removal.kind,
								removedLineCount: removal.removedLines.length,
								remainingAdditionCount: removal.newAdditions.length,
							},
							mode: duplicateAdditionsMode,
							filePath: edit.filePath,
							lineNumZeroBased: edit.lineNumZeroBased,
						});

						switch (duplicateAdditionsMode) {
							case DuplicateAdditionsMode.Log:
								// Yield the patch unchanged.
								break;
							case DuplicateAdditionsMode.DropPatch:
								continue;
							case DuplicateAdditionsMode.DropAllRemaining:
								// Drop this patch and skip every subsequent
								// patch in the stream. We still consume the
								// stream to completion so the underlying
								// fetch is allowed to finalize cleanly.
								dropAllRemaining = true;
								continue;
							case DuplicateAdditionsMode.TrimDuplicate: {
								const newAdditions = removal.newAdditions;
								if (newAdditions.length === 0 && lineReplacement.lineRange.length === 0) {
									// Trim left a no-op patch — drop it.
									continue;
								}
								lineReplacement = new LineReplacement(lineReplacement.lineRange, newAdditions);
								break;
							}
						}
					}
				}

				yield {
					edit: lineReplacement,
					isFromCursorJump: false,
					targetDocument,
					window,
				} satisfies StreamedEdit;
			}
		} catch (e: unknown) {
			if (e instanceof FetchStreamError) {
				return e.reason;
			}
			const err = ErrorUtils.fromUnknown(e);
			return new NoNextEditReason.Unexpected(err);
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
