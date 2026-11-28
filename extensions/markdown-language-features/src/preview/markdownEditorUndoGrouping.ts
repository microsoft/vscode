/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DocumentTextEdit, TrackedOffset } from '@vscode/web-editors';
import type { MarkdownEditorVersion, UndoEditHint, UndoEditHintMessage } from './markdownEditorProtocol';

/**
 * Maximum single-edit character length treated as contiguous typing/deletion
 * (accommodating a few fast keystrokes coalesced while a write is in flight).
 * Larger edits (such as pastes or bulk deletions) always get their own undo step.
 */
const MAX_COALESCED_EDIT_LENGTH = 32;

type EditKind =
	| 'other'
	| 'typingOther'
	| 'typingFirstSpace'
	| 'typingConsecutiveSpace'
	| 'deleting'
	| 'deletingLeft'
	| 'deletingRight';

export interface UndoStopMetadata {
	readonly undoStopBefore: boolean;
	readonly undoStopAfter: boolean;
}

export interface PlannedUndoStep {
	readonly edits: readonly DocumentTextEdit[];
	readonly metadata: UndoStopMetadata;
	/** Commits this step's state transition after `applyEdit` succeeds. */
	commit(): void;
}

export type TrackEditorOffset = (version: MarkdownEditorVersion, offset: number, assoc?: 'before' | 'after') => TrackedOffset | undefined;

interface PendingState {
	readonly kind: EditKind;
	readonly offset: number | undefined;
}

interface TrackedIsolatedRange {
	readonly start: TrackedOffset;
	readonly length: number;
}

/**
 * Decides `undoStopBefore` / `undoStopAfter` for consecutive single-document edits
 * coming from the Markdown custom text editor, matching VS Code's regular text editor
 * word- and edit-kind-based undo grouping.
 */
export class MarkdownEditorUndoGrouper {

	#lastKind: EditKind = 'other';
	#lastOffset: number | undefined;
	#pendingDeleteDirection: 'deleteBackward' | 'deleteForward' | undefined;
	#pendingIsolatedFallback = false;
	#isolatedRanges: TrackedIsolatedRange[] = [];
	#breakOffsets: TrackedOffset[] = [];
	#generation = 0;

	/**
	 * Resets the active typing/deletion undo group so the next edit starts a fresh undo step.
	 * Preserves tracked hints for edits that have not been written yet unless `clearPendingHints` is set.
	 */
	public reset(clearPendingHints = false): void {
		this.#lastKind = 'other';
		this.#lastOffset = undefined;
		this.#pendingDeleteDirection = undefined;
		this.#generation++;
		if (clearPendingHints) {
			this.#pendingIsolatedFallback = false;
			for (const range of this.#isolatedRanges) {
				range.start.dispose();
			}
			this.#isolatedRanges = [];
			for (const offset of this.#breakOffsets) {
				offset.dispose();
			}
			this.#breakOffsets = [];
		}
	}

	public dispose(): void {
		this.reset(true);
	}

	/**
	 * Accepts an explicit boundary or edit-kind hint from the webview editor
	 * (navigation, pointer click, paste, or deletion direction).
	 */
	public acceptHint(
		hintOrMessage: UndoEditHint | UndoEditHintMessage,
		track?: TrackEditorOffset,
		hasUnwritten = false,
	): void {
		const message: UndoEditHintMessage = typeof hintOrMessage === 'string'
			? { kind: hintOrMessage }
			: hintOrMessage;

		if (message.kind === 'break') {
			if (!hasUnwritten) {
				this.reset();
				return;
			}
			if (track && message.version !== undefined && message.offset !== undefined) {
				const tracked = track(message.version, message.offset, 'before');
				if (tracked) {
					this.#breakOffsets.push(tracked);
					return;
				}
			}
			this.reset();
			return;
		}

		if (message.kind === 'isolated') {
			if (track && message.version !== undefined && message.offset !== undefined && message.length !== undefined && message.length > 0) {
				const tracked = track(message.version, message.offset, 'before');
				if (tracked) {
					this.#isolatedRanges.push({ start: tracked, length: message.length });
					return;
				}
			}
			this.#pendingIsolatedFallback = true;
			return;
		}

		this.#pendingDeleteDirection = message.kind;
	}

	/**
	 * Plans one or more sequential `applyEdit` steps for `edits` along with their
	 * `undoStopBefore` / `undoStopAfter` metadata. Batched typing that crosses a
	 * word/space undo boundary, a tracked paste range, or a tracked navigation break
	 * is split at those boundaries so undo granularity does not depend on IPC batching.
	 *
	 * Call `step.commit()` after the atomic write succeeds.
	 */
	public planEdits(edits: readonly DocumentTextEdit[], deletedText: string): readonly PlannedUndoStep[] {
		const deleteHint = this.#pendingDeleteDirection;
		const isolatedFallback = this.#pendingIsolatedFallback;
		const generation = this.#generation;

		const consumedIsolated = new Set<TrackedIsolatedRange>();
		const consumedBreaks = new Set<TrackedOffset>();

		const consumeHints = (): void => {
			if (isolatedFallback) {
				this.#pendingIsolatedFallback = false;
			}
			if (deleteHint) {
				this.#pendingDeleteDirection = undefined;
			}
			if (consumedIsolated.size > 0) {
				for (const item of consumedIsolated) {
					item.start.dispose();
				}
				this.#isolatedRanges = this.#isolatedRanges.filter(item => !consumedIsolated.has(item));
				consumedIsolated.clear();
			}
			if (consumedBreaks.size > 0) {
				for (const item of consumedBreaks) {
					item.dispose();
				}
				this.#breakOffsets = this.#breakOffsets.filter(item => !consumedBreaks.has(item));
				consumedBreaks.clear();
			}
		};

		const makeStep = (
			stepEdits: readonly DocumentTextEdit[],
			metadata: UndoStopMetadata,
			nextState: PendingState,
		): PlannedUndoStep => ({
			edits: stepEdits,
			metadata,
			commit: () => {
				consumeHints();
				// Ignore state advances from edits that were in flight before a reset arrived.
				if (this.#generation === generation) {
					this.#lastKind = nextState.kind;
					this.#lastOffset = nextState.offset;
				}
			},
		});

		const isolated = (): readonly PlannedUndoStep[] => [
			makeStep(edits, { undoStopBefore: true, undoStopAfter: true }, { kind: 'other', offset: undefined }),
		];

		if (isolatedFallback || edits.length !== 1) {
			return isolated();
		}

		const edit = edits[0];
		if (
			edit.newText.includes('\n')
			|| edit.newText.includes('\r')
			|| deletedText.includes('\n')
			|| deletedText.includes('\r')
		) {
			return isolated();
		}

		// Pure insertion (typing, possibly composed with tracked pastes or navigation breaks)
		if (edit.length === 0 && edit.newText.length > 0) {
			return this.#planInsertion(edit.offset, edit.newText, consumedIsolated, consumedBreaks, makeStep);
		}

		// Pure deletion (backspace / forward delete)
		if (edit.length > 0 && edit.newText.length === 0) {
			if (edit.length > MAX_COALESCED_EDIT_LENGTH) {
				return isolated();
			}
			const { metadata, nextState } = this.#planDeletion(edit.offset, edit.length, deleteHint);
			return [makeStep(edits, metadata, nextState)];
		}

		// Replacement or no-op
		return isolated();
	}

	#planInsertion(
		offset: number,
		text: string,
		consumedIsolated: Set<TrackedIsolatedRange>,
		consumedBreaks: Set<TrackedOffset>,
		makeStep: (edits: readonly DocumentTextEdit[], metadata: UndoStopMetadata, nextState: PendingState) => PlannedUndoStep,
	): readonly PlannedUndoStep[] {
		const endOffset = offset + text.length;

		// Collect tracked isolated (paste) slices overlapping [offset, endOffset]
		const isolatedSlices: { start: number; end: number }[] = [];
		for (const item of this.#isolatedRanges) {
			const s = item.start.offset;
			const e = s + item.length;
			if (e > offset && s < endOffset) {
				consumedIsolated.add(item);
				const clampedStart = Math.max(s, offset) - offset;
				const clampedEnd = Math.min(e, endOffset) - offset;
				if (clampedEnd > clampedStart) {
					isolatedSlices.push({ start: clampedStart, end: clampedEnd });
				}
			}
		}

		// Collect tracked navigation breaks within [offset, endOffset]
		const breakPositions = new Set<number>();
		for (const item of this.#breakOffsets) {
			if (item.offset >= offset && item.offset <= endOffset) {
				consumedBreaks.add(item);
				breakPositions.add(item.offset - offset);
			}
		}

		// Fast path: no tracked isolated ranges and no tracked breaks
		if (isolatedSlices.length === 0 && breakPositions.size === 0) {
			if (text.length > MAX_COALESCED_EDIT_LENGTH) {
				return [makeStep([{ offset, length: 0, newText: text }], { undoStopBefore: true, undoStopAfter: true }, { kind: 'other', offset: undefined })];
			}
			return this.#planTyping(offset, text, this.#lastKind, this.#lastOffset, makeStep).steps;
		}

		// Merge overlapping/adjacent isolated slices in ascending order
		isolatedSlices.sort((a, b) => a.start - b.start || a.end - b.end);
		const mergedIsolated: { start: number; end: number }[] = [];
		for (const slice of isolatedSlices) {
			const prev = mergedIsolated[mergedIsolated.length - 1];
			if (prev && slice.start <= prev.end) {
				prev.end = Math.max(prev.end, slice.end);
			} else {
				mergedIsolated.push({ ...slice });
			}
		}

		// Build ordered segments of [0, text.length]: typing slices (split at breakPositions) and isolated slices
		const steps: PlannedUndoStep[] = [];
		let kind: EditKind = breakPositions.has(0) ? 'other' : this.#lastKind;
		let prevOffset: number | undefined = breakPositions.has(0) ? undefined : this.#lastOffset;

		const emitTypingSlice = (relStart: number, relEnd: number): void => {
			if (relEnd <= relStart) {
				return;
			}
			// Split further at any break points strictly inside (relStart, relEnd)
			const cuts: number[] = [relStart];
			for (const b of Array.from(breakPositions).sort((a, b) => a - b)) {
				if (b > relStart && b < relEnd) {
					cuts.push(b);
				}
			}
			cuts.push(relEnd);

			for (let i = 0; i < cuts.length - 1; i++) {
				const segStart = cuts[i];
				const segEnd = cuts[i + 1];
				if (i > 0) {
					kind = 'other';
					prevOffset = undefined;
				}
				const segText = text.slice(segStart, segEnd);
				const segOffset = offset + segStart;
				if (segText.length > MAX_COALESCED_EDIT_LENGTH) {
					steps.push(makeStep(
						[{ offset: segOffset, length: 0, newText: segText }],
						{ undoStopBefore: true, undoStopAfter: true },
						{ kind: 'other', offset: undefined },
					));
					kind = 'other';
					prevOffset = undefined;
				} else {
					const planned = this.#planTyping(segOffset, segText, kind, prevOffset, makeStep);
					steps.push(...planned.steps);
					kind = planned.endState.kind;
					prevOffset = planned.endState.offset;
				}
			}
		};

		let cursor = 0;
		for (const iso of mergedIsolated) {
			emitTypingSlice(cursor, iso.start);
			const isoText = text.slice(iso.start, iso.end);
			steps.push(makeStep(
				[{ offset: offset + iso.start, length: 0, newText: isoText }],
				{ undoStopBefore: true, undoStopAfter: true },
				{ kind: 'other', offset: undefined },
			));
			kind = 'other';
			prevOffset = undefined;
			cursor = iso.end;
		}
		emitTypingSlice(cursor, text.length);

		// If a break landed right at the end of the insertion, close the final undo step
		if (breakPositions.has(text.length) && steps.length > 0) {
			const last = steps[steps.length - 1];
			steps[steps.length - 1] = makeStep(
				last.edits,
				{ undoStopBefore: last.metadata.undoStopBefore, undoStopAfter: true },
				{ kind: 'other', offset: undefined },
			);
		}

		return steps;
	}

	#planTyping(
		offset: number,
		text: string,
		initialKind: EditKind,
		initialPrevOffset: number | undefined,
		makeStep: (edits: readonly DocumentTextEdit[], metadata: UndoStopMetadata, nextState: PendingState) => PlannedUndoStep,
	): { readonly steps: readonly PlannedUndoStep[]; readonly endState: PendingState } {
		const tokens = text.match(/ +|[^ ]+/g) ?? [text];
		const groups: { offset: number; text: string; undoStopBefore: boolean; nextState: PendingState }[] = [];

		let kind = initialKind;
		let prevOffset = initialPrevOffset;
		let currentOffset = offset;

		for (const token of tokens) {
			const isContiguous = prevOffset === currentOffset;
			const nextOffset = currentOffset + token.length;
			let nextKind: 'typingOther' | 'typingFirstSpace' | 'typingConsecutiveSpace';

			if (token[0] === ' ') {
				const prevIsSpace = kind === 'typingFirstSpace' || kind === 'typingConsecutiveSpace';
				nextKind = (isContiguous && prevIsSpace) || token.length > 1
					? 'typingConsecutiveSpace'
					: 'typingFirstSpace';
			} else {
				nextKind = 'typingOther';
			}

			const undoStopBefore = !isContiguous || shouldPushUndoStopBetweenTyping(kind, nextKind);
			const nextState: PendingState = { kind: nextKind, offset: nextOffset };

			if (groups.length > 0 && !undoStopBefore) {
				const current = groups[groups.length - 1];
				current.text += token;
				current.nextState = nextState;
			} else {
				groups.push({ offset: currentOffset, text: token, undoStopBefore, nextState });
			}

			kind = nextKind;
			prevOffset = nextOffset;
			currentOffset = nextOffset;
		}

		return {
			steps: groups.map(group => makeStep(
				[{ offset: group.offset, length: 0, newText: group.text }],
				{ undoStopBefore: group.undoStopBefore, undoStopAfter: false },
				group.nextState,
			)),
			endState: { kind, offset: prevOffset },
		};
	}

	#planDeletion(
		offset: number,
		length: number,
		hint: 'deleteBackward' | 'deleteForward' | undefined,
	): { metadata: UndoStopMetadata; nextState: PendingState } {
		if (hint === 'deleteBackward') {
			const canCoalesce = (this.#lastKind === 'deletingLeft' || this.#lastKind === 'deleting')
				&& offset + length === this.#lastOffset;
			return {
				metadata: { undoStopBefore: !canCoalesce, undoStopAfter: false },
				nextState: { kind: 'deletingLeft', offset },
			};
		}

		if (hint === 'deleteForward') {
			const canCoalesce = (this.#lastKind === 'deletingRight' || this.#lastKind === 'deleting')
				&& offset === this.#lastOffset;
			return {
				metadata: { undoStopBefore: !canCoalesce, undoStopAfter: false },
				nextState: { kind: 'deletingRight', offset },
			};
		}

		// Fallback when no direction hint was supplied (e.g. direct programmatic test)
		if ((this.#lastKind === 'deleting' || this.#lastKind === 'deletingLeft') && offset + length === this.#lastOffset) {
			return {
				metadata: { undoStopBefore: false, undoStopAfter: false },
				nextState: { kind: 'deletingLeft', offset },
			};
		}

		if ((this.#lastKind === 'deleting' || this.#lastKind === 'deletingRight') && offset === this.#lastOffset) {
			return {
				metadata: { undoStopBefore: false, undoStopAfter: false },
				nextState: { kind: 'deletingRight', offset },
			};
		}

		return {
			metadata: { undoStopBefore: true, undoStopAfter: false },
			nextState: { kind: 'deleting', offset },
		};
	}
}

/**
 * Mirrors `shouldPushStackElementBetween` in `src/vs/editor/common/cursor/cursorTypeEditOperations.ts`:
 * - Typing a first space after a word starts a new undo step (`"hello"` | `" world"`).
 * - Typing non-space characters immediately after a single space stays in that step (`" world"`).
 * - Consecutive spaces stay together, then break before the next word (`"  "` | `"world"`).
 */
function shouldPushUndoStopBetweenTyping(prev: EditKind, curr: 'typingOther' | 'typingFirstSpace' | 'typingConsecutiveSpace'): boolean {
	if (prev === 'typingFirstSpace') {
		return false;
	}
	const prevNorm = prev === 'typingConsecutiveSpace' ? 'space' : prev;
	const currNorm = (curr === 'typingFirstSpace' || curr === 'typingConsecutiveSpace') ? 'space' : curr;
	return prevNorm !== currNorm;
}
