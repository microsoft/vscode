/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DocumentTextEdit } from '@vscode/web-editors';

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
	#pending: PendingState | undefined;

	public reset(): void {
		this.#lastKind = 'other';
		this.#lastOffset = undefined;
		this.#pending = undefined;
	}

	/**
	 * Computes undo stop metadata for `edits` without committing the state transition
	 * until {@link commitEdit} is called.
	 */
	public prepareEdit(edits: readonly DocumentTextEdit[], deletedText: string): UndoStopMetadata {
		if (edits.length !== 1) {
			this.#pending = { kind: 'other', offset: undefined };
			return { undoStopBefore: true, undoStopAfter: true };
		}

		const edit = edits[0];
		if (
			edit.newText.includes('\n')
			|| edit.newText.includes('\r')
			|| deletedText.includes('\n')
			|| deletedText.includes('\r')
		) {
			this.#pending = { kind: 'other', offset: undefined };
			return { undoStopBefore: true, undoStopAfter: true };
		}

		// Pure insertion (typing)
		if (edit.length === 0 && edit.newText.length > 0) {
			if (edit.newText.length > MAX_COALESCED_EDIT_LENGTH) {
				this.#pending = { kind: 'other', offset: undefined };
				return { undoStopBefore: true, undoStopAfter: true };
			}
			return this.#prepareTyping(edit.offset, edit.newText);
		}

		// Pure deletion (backspace / forward delete)
		if (edit.length > 0 && edit.newText.length === 0) {
			if (edit.length > MAX_COALESCED_EDIT_LENGTH) {
				this.#pending = { kind: 'other', offset: undefined };
				return { undoStopBefore: true, undoStopAfter: true };
			}
			return this.#prepareDeletion(edit.offset, edit.length);
		}

		// Replacement or no-op
		this.#pending = { kind: 'other', offset: undefined };
		return { undoStopBefore: true, undoStopAfter: true };
	}

	/** Commits the state transition from the last {@link prepareEdit} call after `applyEdit` succeeds. */
	public commitEdit(): void {
		if (this.#pending) {
			this.#lastKind = this.#pending.kind;
			this.#lastOffset = this.#pending.offset;
			this.#pending = undefined;
		}
	}

	#prepareTyping(offset: number, text: string): UndoStopMetadata {
		const isContiguous = this.#lastOffset === offset;
		const nextOffset = offset + text.length;

		if (/^ +$/.test(text)) {
			const prevIsSpace = this.#lastKind === 'typingFirstSpace' || this.#lastKind === 'typingConsecutiveSpace';
			const nextKind: EditKind = (isContiguous && prevIsSpace) || text.length > 1
				? 'typingConsecutiveSpace'
				: 'typingFirstSpace';
			const undoStopBefore = !isContiguous || shouldPushUndoStopBetweenTyping(this.#lastKind, nextKind);
			this.#pending = { kind: nextKind, offset: nextOffset };
			return { undoStopBefore, undoStopAfter: false };
		}

		if (!text.includes(' ')) {
			const undoStopBefore = !isContiguous || shouldPushUndoStopBetweenTyping(this.#lastKind, 'typingOther');
			this.#pending = { kind: 'typingOther', offset: nextOffset };
			return { undoStopBefore, undoStopAfter: false };
		}

		// Coalesced typing that spans a space boundary (e.g. " w" or "o ")
		const startsWithSpace = text.startsWith(' ');
		const endsWithSpace = text.endsWith(' ');
		const nextKind: EditKind = endsWithSpace
			? (text.endsWith('  ') ? 'typingConsecutiveSpace' : 'typingFirstSpace')
			: 'typingOther';
		const undoStopBefore = !isContiguous
			|| startsWithSpace
			|| shouldPushUndoStopBetweenTyping(this.#lastKind, 'typingOther');
		this.#pending = { kind: nextKind, offset: nextOffset };
		return { undoStopBefore, undoStopAfter: false };
	}

	#prepareDeletion(offset: number, length: number): UndoStopMetadata {
		// Contiguous backspace (deleting immediately before the previous deletion offset)
		if ((this.#lastKind === 'deleting' || this.#lastKind === 'deletingLeft') && offset + length === this.#lastOffset) {
			this.#pending = { kind: 'deletingLeft', offset };
			return { undoStopBefore: false, undoStopAfter: false };
		}

		// Contiguous forward-delete (deleting at the same offset)
		if ((this.#lastKind === 'deleting' || this.#lastKind === 'deletingRight') && offset === this.#lastOffset) {
			this.#pending = { kind: 'deletingRight', offset };
			return { undoStopBefore: false, undoStopAfter: false };
		}

		// First deletion in a sequence; direction will be disambiguated by the next deletion
		this.#pending = { kind: 'deleting', offset };
		return { undoStopBefore: true, undoStopAfter: false };
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
