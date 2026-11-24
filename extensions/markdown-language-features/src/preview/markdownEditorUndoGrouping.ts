/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DocumentTextEdit } from '@vscode/web-editors';
import type { UndoEditHint } from './markdownEditorProtocol';

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

interface PendingState {
	readonly kind: EditKind;
	readonly offset: number | undefined;
}

/**
 * Decides `undoStopBefore` / `undoStopAfter` for consecutive single-document edits
 * coming from the Markdown custom text editor, matching VS Code's regular text editor
 * word- and edit-kind-based undo grouping.
 */
export class MarkdownEditorUndoGrouper {

	#lastKind: EditKind = 'other';
	#lastOffset: number | undefined;
	#pendingHint: Exclude<UndoEditHint, 'break'> | undefined;
	#generation = 0;

	public reset(): void {
		this.#lastKind = 'other';
		this.#lastOffset = undefined;
		this.#pendingHint = undefined;
		this.#generation++;
	}

	/**
	 * Accepts an explicit boundary or edit-kind hint from the webview editor
	 * (navigation, pointer click, paste, or deletion direction).
	 */
	public acceptHint(hint: UndoEditHint): void {
		if (hint === 'break') {
			this.reset();
			return;
		}
		this.#pendingHint = hint;
	}

	/**
	 * Plans one or more sequential `applyEdit` steps for `edits` along with their
	 * `undoStopBefore` / `undoStopAfter` metadata. Batched typing that crosses a
	 * word/space undo boundary (e.g. `"o "` after `"hell"`) is split at those
	 * boundaries so undo granularity does not depend on IPC batching.
	 *
	 * Call `step.commit()` after each step's `applyEdit` succeeds.
	 */
	public planEdits(edits: readonly DocumentTextEdit[], deletedText: string): readonly PlannedUndoStep[] {
		const hint = this.#pendingHint;
		this.#pendingHint = undefined;
		const generation = this.#generation;

		const makeStep = (
			stepEdits: readonly DocumentTextEdit[],
			metadata: UndoStopMetadata,
			nextState: PendingState,
		): PlannedUndoStep => ({
			edits: stepEdits,
			metadata,
			commit: () => {
				// Ignore commits from edits that were in flight before a reset/break arrived.
				if (this.#generation === generation) {
					this.#lastKind = nextState.kind;
					this.#lastOffset = nextState.offset;
				}
			},
		});

		const isolated = (): readonly PlannedUndoStep[] => [
			makeStep(edits, { undoStopBefore: true, undoStopAfter: true }, { kind: 'other', offset: undefined }),
		];

		if (hint === 'isolated' || edits.length !== 1) {
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

		// Pure insertion (typing)
		if (edit.length === 0 && edit.newText.length > 0) {
			if (edit.newText.length > MAX_COALESCED_EDIT_LENGTH) {
				return isolated();
			}
			return this.#planTyping(edit.offset, edit.newText, makeStep);
		}

		// Pure deletion (backspace / forward delete)
		if (edit.length > 0 && edit.newText.length === 0) {
			if (edit.length > MAX_COALESCED_EDIT_LENGTH) {
				return isolated();
			}
			const { metadata, nextState } = this.#planDeletion(edit.offset, edit.length, hint);
			return [makeStep(edits, metadata, nextState)];
		}

		// Replacement or no-op
		return isolated();
	}

	#planTyping(
		offset: number,
		text: string,
		makeStep: (edits: readonly DocumentTextEdit[], metadata: UndoStopMetadata, nextState: PendingState) => PlannedUndoStep,
	): readonly PlannedUndoStep[] {
		const tokens = text.match(/ +|[^ ]+/g) ?? [text];
		const groups: { offset: number; text: string; undoStopBefore: boolean; nextState: PendingState }[] = [];

		let kind = this.#lastKind;
		let prevOffset = this.#lastOffset;
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

		return groups.map(group => makeStep(
			[{ offset: group.offset, length: 0, newText: group.text }],
			{ undoStopBefore: group.undoStopBefore, undoStopAfter: false },
			group.nextState,
		));
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
