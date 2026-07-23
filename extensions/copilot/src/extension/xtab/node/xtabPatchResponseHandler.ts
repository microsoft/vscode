/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { DuplicateAdditionsMode } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { ResponseProcessor } from '../../../platform/inlineEdits/common/responseProcessor';
import { NoNextEditReason, StreamedEdit } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { ILogger } from '../../../platform/log/common/logService';
import { ErrorUtils } from '../../../util/common/errors';
import { equals as arraysEqual } from '../../../util/vs/base/common/arrays';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { LineReplacement } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { DefaultLinesDiffComputer } from '../../../util/vs/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer';
import { LineRange } from '../../../util/vs/editor/common/core/ranges/lineRange';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { AbstractText } from '../../../util/vs/editor/common/core/text/abstractText';
import { FetchStreamError } from '../common/fetchStreamError';
import { toUniquePath } from '../common/promptCraftingUtils';
import { ResponseTags } from '../common/tags';
import { CurrentDocument } from '../common/xtabCurrentDocument';

class Patch {
	public removedLines: string[] = [];
	public addedLines: string[] = [];

	/**
	 * True for the early cursor-line replacement produced by {@link Patch.progressiveRevealParts}.
	 * Such a patch is a 1-for-1 additive edit whose single added line IS the change we want to
	 * surface, so the duplicate-additions policy is skipped for it (see {@link shouldApplyDuplicatePolicy}).
	 */
	public isProgressiveRevealEarlyEdit = false;

	private constructor(
		/**
		 * Expected to be file path relative to workspace root.
		 */
		public readonly filePath: string,
		public readonly lineNumZeroBased: number,
		/**
		 * Zero-based index of the model-emitted patch this object represents. Patches
		 * derived from the same model header (e.g. the early + continuation patches of a
		 * progressive ghost-text reveal) share the same `patchIndex`.
		 */
		public readonly patchIndex: number,
	) { }

	public static ofLine(line: string, patchIndex: number): Patch | null {
		const match = line.match(/^(.+):(\d+)$/);
		if (!match) {
			return null;
		}
		const [, filename, lineNumber] = match;
		return new Patch(filename, parseInt(lineNumber, 10), patchIndex);
	}

	/**
	 * Builds the two patches of a progressive ghost-text reveal from the first model patch:
	 *   - `early`: the cursor-line replacement (`removedLines[0]` -> `addedLines[0]`), yielded
	 *     immediately so the additive cursor-line edit shows ASAP. It is a 1-for-1 replacement,
	 *     so it shifts no line anchors below it.
	 *   - `continuation`: the remaining removed/added lines, anchored on the next line. It carries
	 *     `removedLines.slice(1)` (empty for the common single-removed-line case, making it a pure
	 *     insertion) and collects the remaining added lines as they stream in.
	 *
	 * Both share the source patch's `patchIndex`. The union of the two is byte-identical to
	 * applying the original patch.
	 */
	public static progressiveRevealParts(source: Patch): { early: Patch; continuation: Patch } {
		const early = new Patch(source.filePath, source.lineNumZeroBased, source.patchIndex);
		early.removedLines = [source.removedLines[0]];
		early.addedLines = [...source.addedLines];
		early.isProgressiveRevealEarlyEdit = true;

		const continuation = new Patch(source.filePath, source.lineNumZeroBased + 1, source.patchIndex);
		continuation.removedLines = source.removedLines.slice(1);
		return { early, continuation };
	}

	addLine(line: string): boolean {
		const contentLine = line.slice(1);
		if (line.startsWith('-')) {
			this.removedLines.push(contentLine);
			return true;
		}
		if (line.startsWith('+')) {
			this.addedLines.push(contentLine);
			return true;
		}
		return false;
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


/**
 * The outcome of evaluating the duplicate-additions policy for a single patch.
 * Controls what the stream loop does next:
 *   - `emit`       — yield the (possibly trimmed) replacement and continue
 *   - `skip`       — drop this patch and continue to the next
 *   - `skipAndStop` — drop this patch and all remaining patches in the stream
 */
type EditDecision =
	| { kind: 'emit'; lineReplacement: LineReplacement }
	| { kind: 'skip' }
	| { kind: 'skipAndStop' };

/**
 * Runs duplicate-addition detection on `lineReplacement` and applies the
 * configured `mode` policy, returning an `EditDecision` for the caller to act on.
 *
 * Logs only telemetry-safe metadata (no raw line content) via `tracer` and
 * fires `onDuplicateRemoved` for every detected duplicate regardless of mode.
 */
function applyDuplicatePolicy(
	edit: Patch,
	lineReplacement: LineReplacement,
	content: AbstractText,
	mode: Exclude<DuplicateAdditionsMode, DuplicateAdditionsMode.Off>,
	tracer: ILogger,
): EditDecision {
	const removal = tryRemoveDuplicateAdditions(lineReplacement, content);
	if (removal === undefined) {
		return { kind: 'emit', lineReplacement };
	}

	// Log only metadata (kind / counts / location) — do NOT include raw line
	// content. The tracer output may end up in user-visible diagnostics.
	tracer.trace(`Detected duplicate addition(s) (kind=${removal.kind}, count=${removal.removedLines.length}, mode=${mode}) for edit at ${edit.filePath}:${edit.lineNumZeroBased}`);

	switch (mode) {
		case DuplicateAdditionsMode.DropPatch:
			return { kind: 'skip' };
		case DuplicateAdditionsMode.DropAllRemaining:
			// Drop this patch and skip every subsequent patch in the stream.
			// We still consume the stream to completion so the underlying
			// fetch is allowed to finalize cleanly.
			return { kind: 'skipAndStop' };
		case DuplicateAdditionsMode.TrimDuplicate: {
			const newLines = removal.newAdditions;
			if (newLines.length === 0 && lineReplacement.lineRange.length === 0) {
				// Trim left a no-op patch — drop it.
				return { kind: 'skip' };
			}
			return { kind: 'emit', lineReplacement: new LineReplacement(lineReplacement.lineRange, newLines) };
		}
	}
}

/**
 * Whether a duplicate-additions mode preserves a patch's removed range. `Off` (no dedup) and
 * `TrimDuplicate` (trims only duplicate additions, keeping the removal) do; `DropPatch` and
 * `DropAllRemaining` may drop a whole patch.
 */
function duplicateModePreservesRemovedRange(mode: DuplicateAdditionsMode): boolean {
	return mode === DuplicateAdditionsMode.Off || mode === DuplicateAdditionsMode.TrimDuplicate;
}

/**
 * Whether the first patch may reveal a *multi*-removed-line cursor edit early. This extends the
 * single-line reveal, so it requires the base progressive-reveal flag (which also acts as the
 * kill switch) and the multi-line flag. It is further limited to duplicate-additions modes that
 * preserve the removed range: a multi-line reveal's continuation carries removed lines, and a
 * mode that could drop that continuation *after* the early cursor-line edit was already emitted
 * would leave stale lines below the cursor.
 */
function allowsMultiLineProgressiveReveal(enableProgressiveGhostText: boolean, enableProgressiveGhostTextMultiLine: boolean, duplicateAdditionsMode: DuplicateAdditionsMode): boolean {
	return enableProgressiveGhostText && enableProgressiveGhostTextMultiLine && duplicateModePreservesRemovedRange(duplicateAdditionsMode);
}

/**
 * Whether the duplicate-additions policy should run for a resolved edit. It only applies to the
 * active document (other files' content is not available here) and never to a progressive
 * reveal's early edit: that edit is a 1-for-1 additive cursor-line replacement with no re-emitted
 * context to trim, and dedup could wrongly trim its added line to empty — turning it into a
 * cursor-line deletion — when it coincides with the line just below the cursor (a cascade edit).
 */
function shouldApplyDuplicatePolicy(edit: Patch, isActiveDoc: boolean, duplicateAdditionsMode: DuplicateAdditionsMode): duplicateAdditionsMode is Exclude<DuplicateAdditionsMode, DuplicateAdditionsMode.Off> {
	return duplicateAdditionsMode !== DuplicateAdditionsMode.Off && isActiveDoc && !edit.isProgressiveRevealEarlyEdit;
}

/**
 * Detects the "delete an empty cursor line and shift the next line up" shape, which must not be
 * treated as an additive cursor-line edit. When `removedLines[0]` is blank and the first added
 * line equals or is a prefix of the next removed line (the original line just below the cursor),
 * the model is absorbing the empty line rather than additively editing it.
 */
function isEmptyCursorLineShiftUp(patch: Patch): boolean {
	if (patch.removedLines.length < 2 || patch.removedLines[0].trim() !== '') {
		return false;
	}
	const firstAddedLine = patch.addedLines[0];
	const nextRemovedLine = patch.removedLines[1];
	return firstAddedLine === nextRemovedLine || nextRemovedLine.startsWith(firstAddedLine);
}

export namespace XtabPatchResponseHandler {

	/**
	 * Upper bound on how long the per-patch diff may run before we give up and
	 * fall back to the original (unsplit) replacement. The inputs are a single
	 * patch's removed/added lines, so this is only a safety valve against
	 * pathological inputs.
	 */
	const SPLIT_DIFF_MAX_COMPUTATION_TIME_MS = 100;

	/**
	 * Splits a coarse patch replacement into the minimal set of sub-replacements
	 * by running a line diff between the removed and added lines.
	 *
	 * The diff-patch model emits a patch as a contiguous block of `-`/`+` lines,
	 * which `resolveEdit` turns into a single `LineReplacement` spanning every
	 * removed line. When only a subset of those lines actually changed (the model
	 * re-emitted surrounding context), a line-level diff recovers the minimal
	 * hunks, yielding several small replacements with the untouched lines left as
	 * context — a nicer suggestion shape.
	 *
	 * @param replacement The resolved (possibly dedup-trimmed) replacement; its
	 * `newLines` are the added lines and its `lineRange` anchors the result in
	 * the document.
	 * @param removedLines The original line content removed by the patch. Its
	 * length is expected to match `replacement.lineRange.length`.
	 *
	 * Returns the original replacement unchanged when there is nothing to gain:
	 * a pure insertion or deletion (one side empty), a diff that times out, or a
	 * diff that collapses to a single hunk.
	 */
	export function splitReplacement(replacement: LineReplacement, removedLines: readonly string[]): LineReplacement[] {
		const addedLines = replacement.newLines;
		if (removedLines.length === 0 || addedLines.length === 0) {
			return [replacement];
		}

		const diff = new DefaultLinesDiffComputer().computeDiff([...removedLines], [...addedLines], {
			ignoreTrimWhitespace: false,
			maxComputationTimeMs: SPLIT_DIFF_MAX_COMPUTATION_TIME_MS,
			computeMoves: false,
		});
		if (diff.hitTimeout || diff.changes.length <= 1) {
			return [replacement];
		}

		// `change.original`/`change.modified` are 1-based line ranges over
		// `removedLines`/`addedLines`. Anchor the original side at the
		// replacement's first removed line (`removedLines[0]` lives on
		// `lineRange.startLineNumber`) and slice the new content from `addedLines`.
		const baseLine = replacement.lineRange.startLineNumber;
		return diff.changes.map(change => new LineReplacement(
			new LineRange(
				baseLine + change.original.startLineNumber - 1,
				baseLine + change.original.endLineNumberExclusive - 1,
			),
			addedLines.slice(change.modified.startLineNumber - 1, change.modified.endLineNumberExclusive - 1),
		));
	}

	export async function* handleResponse(
		linesStream: AsyncIterable<string>,
		currentDocument: CurrentDocument,
		activeDocumentId: DocumentId,
		workspaceRoot: URI | undefined,
		window: OffsetRange | undefined,
		parentTracer: ILogger,
		duplicateAdditionsMode: DuplicateAdditionsMode = DuplicateAdditionsMode.Off,
		enableProgressiveGhostText: boolean = false,
		splitPatchOnDiff: boolean = false,
		enableProgressiveGhostTextMultiLine: boolean = false,
	): AsyncGenerator<StreamedEdit, NoNextEditReason, void> {
		const tracer = parentTracer.createSubLogger(['XtabCustomDiffPatchResponseHandler', 'handleResponse']);
		const activeDocRelativePath = toUniquePath(activeDocumentId, workspaceRoot?.path);

		try {
			let dropAllRemaining = false;
			const cursorLine = enableProgressiveGhostText ? currentDocument.cursorLineOffset : undefined;
			const progressiveDocPath = enableProgressiveGhostText ? activeDocRelativePath : undefined;
			const allowMultiLineRemoval = allowsMultiLineProgressiveReveal(enableProgressiveGhostText, enableProgressiveGhostTextMultiLine, duplicateAdditionsMode);
			for await (const edit of extractEdits(linesStream, cursorLine, progressiveDocPath, allowMultiLineRemoval)) {
				if (dropAllRemaining) {
					continue;
				}

				const isActiveDoc = edit.filePath === activeDocRelativePath;
				const targetDocument = isActiveDoc
					? activeDocumentId
					: resolveTargetDocument(edit.filePath, workspaceRoot);
				if (!targetDocument) {
					tracer.error(`Could not resolve target document for edit: ${edit.toString()}`);
					continue;
				}

				let lineReplacement = resolveEdit(edit);

				if (shouldApplyDuplicatePolicy(edit, isActiveDoc, duplicateAdditionsMode)) {
					const decision = applyDuplicatePolicy(edit, lineReplacement, currentDocument.content, duplicateAdditionsMode, tracer);
					switch (decision.kind) {
						case 'skip':
							continue;
						case 'skipAndStop':
							dropAllRemaining = true;
							continue;
						case 'emit':
							lineReplacement = decision.lineReplacement;
							break;
					}
				}

				const replacements = splitPatchOnDiff
					? splitReplacement(lineReplacement, edit.removedLines)
					: [lineReplacement];
				for (const replacement of replacements) {
					yield {
						edit: replacement,
						isFromCursorJump: false,
						targetDocument,
						window,
						patchIndex: edit.patchIndex,
					} satisfies StreamedEdit;
				}
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

	function resolveEdit(patch: Patch): LineReplacement {
		return new LineReplacement(new LineRange(patch.lineNumZeroBased + 1, patch.lineNumZeroBased + 1 + patch.removedLines.length), patch.addedLines);
	}

	function resolveTargetDocument(filePath: string, workspaceRoot: URI | undefined): DocumentId | undefined {
		if (isAbsolute(filePath)) {
			return DocumentId.create(URI.file(filePath).toString());
		}
		if (workspaceRoot) {
			return DocumentId.create(URI.joinPath(workspaceRoot, filePath).toString());
		}
		// Relative path with no workspace root — cannot resolve to a valid URI
		return undefined;
	}

	/**
	 * Checks whether the first patch qualifies for ghost-text progressive reveal: it targets the
	 * cursor line in the active document, has at least one added line, and additively edits the
	 * cursor line (the removed line is a subsequence of the first added line).
	 *
	 * By default only single-removed-line patches qualify. When `allowMultiLineRemoval` is set,
	 * patches that remove more than one line also qualify — the cursor-line change is revealed
	 * first and the remaining removed/added lines stream as a continuation — except for the
	 * empty-line shift-up shape (see {@link isEmptyCursorLineShiftUp}).
	 */
	export function isGhostTextPatch(patch: Patch, cursorLineZeroBased: number, activeDocRelativePath: string, allowMultiLineRemoval: boolean): boolean {
		if (patch.lineNumZeroBased !== cursorLineZeroBased || patch.filePath !== activeDocRelativePath) {
			return false; // not the cursor line in the active document
		}
		const removedLinesQualify = allowMultiLineRemoval ? patch.removedLines.length >= 1 : patch.removedLines.length === 1;
		if (!removedLinesQualify || patch.addedLines.length < 1) {
			return false;
		}
		if (!ResponseProcessor.isAdditiveEdit(patch.removedLines[0], patch.addedLines[0])) {
			return false; // the cursor-line edit is not additive
		}
		return !isEmptyCursorLineShiftUp(patch);
	}

	/**
	 * @param cursorLineZeroBased When provided (along with activeDocRelativePath),
	 * enables ghost-text progressive reveal for the first patch: if the first patch
	 * is a ghost-text (a removed line at the cursor that is additively edited),
	 * the cursor-line replacement is yielded immediately and any further removed/added
	 * lines are collected into a separate continuation patch.
	 * @param allowMultiLineRemoval When set, progressive reveal also fires for first patches
	 * that remove more than one line (see {@link isGhostTextPatch}); the continuation then
	 * carries the remaining removed lines instead of being a pure insertion.
	 */
	export async function* extractEdits(linesStream: AsyncIterable<string>, cursorLineZeroBased?: number, activeDocRelativePath?: string, allowMultiLineRemoval: boolean = false): AsyncGenerator<Patch> {
		let currentPatch: Patch | null = null;
		let isFirstPatch = true;

		// Tracks whether we've already attempted progressive reveal (succeeds or fails only once).
		let progressiveRevealDone = false;

		// Monotonic 0-based index assigned to each real model patch header. Derived
		// patches (ghost-text early + continuation) inherit their source's index.
		let nextPatchIndex = 0;
		// Parses a header line into a patch, allocating it the next patch index.
		// Returns null for lines that aren't valid headers, which don't consume an index.
		const parseNextPatchHeader = (line: string): Patch | null => {
			const patch = Patch.ofLine(line, nextPatchIndex);
			if (patch !== null) {
				nextPatchIndex++;
			}
			return patch;
		};

		for await (const line of linesStream) {
			if (line.trim() === ResponseTags.NO_EDIT) {
				break;
			}
			if (currentPatch === null) {
				currentPatch = parseNextPatchHeader(line);
				continue;
			}
			if (currentPatch.addLine(line)) {
				// For the first patch, check if we can do progressive reveal:
				// once we have the `-` line and first `+` line, check ghost-text.
				if (isFirstPatch && !progressiveRevealDone
					&& cursorLineZeroBased !== undefined
					&& activeDocRelativePath !== undefined
					&& currentPatch.addedLines.length === 1
					&& currentPatch.removedLines.length >= 1
				) {
					if (isGhostTextPatch(currentPatch, cursorLineZeroBased, activeDocRelativePath, allowMultiLineRemoval)) {
						// Reveal the additive cursor-line edit immediately, then continue
						// streaming the rest of the patch as a continuation.
						const { early, continuation } = Patch.progressiveRevealParts(currentPatch);
						yield early;
						currentPatch = continuation;
					}
					progressiveRevealDone = true;
				}
				continue;
			}
			// line does not belong to current patch, yield current and start new
			if (currentPatch.removedLines.length > 0 || currentPatch.addedLines.length > 0) {
				yield currentPatch;
			}
			currentPatch = parseNextPatchHeader(line);
			isFirstPatch = false;
		}
		if (currentPatch && (currentPatch.removedLines.length > 0 || currentPatch.addedLines.length > 0)) {
			yield currentPatch;
		}
	}
}
