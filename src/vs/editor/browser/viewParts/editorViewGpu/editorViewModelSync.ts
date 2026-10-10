/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LineInput, ModelDeltaInput } from './editorViewTypes.js';

/**
 * A batch of work to apply to the `@vscode/editor-view` mirror at present time.
 * Either a full rebuild, or a set of incremental operations.
 */
export interface IEditorViewSyncPlan {
	/** When `true`, ignore the incremental arrays and rebuild the whole model. */
	readonly fullReload: boolean;
	/**
	 * Structural line splices (inserts/deletes) to apply **in order** before the
	 * content refresh. Inserts carry empty placeholder lines so the mirror's line
	 * count matches the view model; the real content is filled by {@link contentLines}.
	 */
	readonly structural: readonly ModelDeltaInput[];
	/** View lines (1-based, final coordinates) whose text *and* tokens must be refreshed. */
	readonly contentLines: readonly number[];
	/** View lines (1-based, final coordinates) whose tokens (only) must be refreshed. */
	readonly tokenLines: readonly number[];
}

/**
 * Pure, renderer-free planner that turns VS Code view events into the minimal set
 * of `@vscode/editor-view` model deltas — the incremental counterpart to shipping
 * the whole document on every change.
 *
 * It mirrors the approach of the DOM `RenderedLinesCollection` (`viewLayer.ts`):
 * structure is tracked as events arrive (so line numbers stay consistent), but the
 * actual line **content is read lazily at present time**, in final view-model
 * coordinates. To make that possible it keeps the dirty-line sets in sync with the
 * structure by shifting them through every insert/delete.
 *
 * This class holds no reference to the renderer or the view model, so it is fully
 * unit-testable. The owner ({@link EditorViewGpu}) is responsible for renderer
 * readiness (calling {@link scheduleFullReload} until the renderer exists) and for
 * executing the {@link IEditorViewSyncPlan} returned by {@link takePlan}.
 */
export class EditorViewModelSync {

	/** Starts `true` so the first {@link takePlan} performs the initial load. */
	private _fullReload = true;
	/** View lines (1-based) needing a text+tokens refresh, in current mirror coordinates. */
	private readonly _contentDirty = new Set<number>();
	/** View lines (1-based) needing a tokens-only refresh, in current mirror coordinates. */
	private readonly _tokenDirty = new Set<number>();
	/** Structural splices recorded in emission order (inserts carry placeholders). */
	private _structural: ModelDeltaInput[] = [];

	/** Whether a full rebuild is currently queued for the next {@link takePlan}. */
	public get pendingFullReload(): boolean {
		return this._fullReload;
	}

	/**
	 * Whether {@link takePlan} would produce any work. O(1) and allocation-free, so
	 * callers can cheaply skip a redundant sync (e.g. measurement getters that may
	 * run several times per frame) without paying `takePlan`'s array churn.
	 */
	public get hasPendingChanges(): boolean {
		return this._fullReload || this._contentDirty.size > 0 || this._tokenDirty.size > 0 || this._structural.length > 0;
	}

	/** Queue a full `setLines` rebuild, discarding any pending incremental work. */
	public scheduleFullReload(): void {
		this._fullReload = true;
		this._contentDirty.clear();
		this._tokenDirty.clear();
		this._structural = [];
	}

	/** Content of `count` existing view lines changed (no line-count change). */
	public onLinesChanged(fromLineNumber: number, count: number): void {
		if (this._fullReload) {
			return;
		}
		const to = fromLineNumber + count - 1;
		for (let line = fromLineNumber; line <= to; line++) {
			this._contentDirty.add(line);
		}
	}

	/** `[fromLineNumber..toLineNumber]` view lines were inserted. */
	public onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		if (this._fullReload) {
			return;
		}
		const count = toLineNumber - fromLineNumber + 1;
		this._shiftDirtyLines(line => line >= fromLineNumber ? line + count : line);
		this._structural.push({ type: 'replaceLines', start: fromLineNumber - 1, deleteCount: 0, insert: EditorViewModelSync._emptyLines(count) });
		for (let line = fromLineNumber; line <= toLineNumber; line++) {
			this._contentDirty.add(line);
		}
	}

	/** `[fromLineNumber..toLineNumber]` view lines were deleted. */
	public onLinesDeleted(fromLineNumber: number, toLineNumber: number): void {
		if (this._fullReload) {
			return;
		}
		const count = toLineNumber - fromLineNumber + 1;
		this._shiftDirtyLines(line => (line >= fromLineNumber && line <= toLineNumber) ? null : (line > toLineNumber ? line - count : line));
		this._structural.push({ type: 'replaceLines', start: fromLineNumber - 1, deleteCount: count, insert: [] });
	}

	/** Tokens changed for the given (1-based, inclusive) view line ranges. */
	public onTokensChanged(ranges: readonly { readonly fromLineNumber: number; readonly toLineNumber: number }[], lineCount: number): void {
		if (this._fullReload) {
			return;
		}
		for (const range of ranges) {
			const from = Math.max(1, range.fromLineNumber);
			const to = Math.min(range.toLineNumber, lineCount);
			for (let line = from; line <= to; line++) {
				this._tokenDirty.add(line);
			}
		}
	}

	/**
	 * Consume the accumulated plan and reset to a clean (no-op) state. `tokenLines`
	 * excludes any line already in `contentLines` (a content refresh updates tokens
	 * too). Both are returned sorted ascending for deterministic application/testing.
	 */
	public takePlan(): IEditorViewSyncPlan {
		let plan: IEditorViewSyncPlan;
		if (this._fullReload) {
			plan = { fullReload: true, structural: [], contentLines: [], tokenLines: [] };
		} else {
			const contentLines = Array.from(this._contentDirty).sort((a, b) => a - b);
			const tokenLines = Array.from(this._tokenDirty).filter(line => !this._contentDirty.has(line)).sort((a, b) => a - b);
			plan = { fullReload: false, structural: this._structural, contentLines, tokenLines };
		}
		this._fullReload = false;
		this._contentDirty.clear();
		this._tokenDirty.clear();
		this._structural = [];
		return plan;
	}

	/**
	 * Remap the dirty-line sets through a structural edit so their numbers stay in
	 * the mirror's coordinate system. `shift` returns the new line number, or `null`
	 * to drop the entry (a deleted line).
	 */
	private _shiftDirtyLines(shift: (line: number) => number | null): void {
		for (const set of [this._contentDirty, this._tokenDirty]) {
			const remapped: number[] = [];
			for (const line of set) {
				const next = shift(line);
				if (next !== null) {
					remapped.push(next);
				}
			}
			set.clear();
			for (const line of remapped) {
				set.add(line);
			}
		}
	}

	private static _emptyLines(count: number): LineInput[] {
		const lines: LineInput[] = new Array(count);
		for (let i = 0; i < count; i++) {
			lines[i] = { text: '', tokens: [] };
		}
		return lines;
	}
}
