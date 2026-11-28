/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Replaces `deleteCount` mirrored lines at zero-based `start` with `insertCount`
 * lines whose content has not been sent.
 */
export interface IEditorViewLineSplice {
	readonly start: number;
	readonly deleteCount: number;
	readonly insertCount: number;
}

/**
 * A batch of work to apply to the `@vscode/editor-view` mirror at present time.
 * Either a full rebuild, or a set of incremental operations.
 */
export interface IEditorViewSyncPlan {
	/** When `true`, ignore the incremental arrays: no line of the mirror has been sent. */
	readonly fullReload: boolean;
	/**
	 * Structural line splices (inserts/deletes) to apply **in order**, so the
	 * mirror's line count matches the view model.
	 */
	readonly structural: readonly IEditorViewLineSplice[];
	/** View lines (1-based, final coordinates) whose sent text or tokens are out of date. */
	readonly staleLines: readonly number[];
}

/**
 * Pure, renderer-free planner that turns VS Code view events into the minimal set
 * of changes to the `@vscode/editor-view` mirror — the incremental counterpart to
 * shipping the whole document on every change.
 *
 * The mirror always has the view model's line count, but holds a line's content
 * only once the renderer needs it: like the DOM `RenderedLinesCollection`
 * (`viewLayer.ts`), structure is tracked as events arrive (so line numbers stay
 * consistent) and content is read lazily, in final view-model coordinates, and
 * only for lines the renderer paints, measures or shows in the minimap. The plan
 * therefore carries splices by count and the lines whose sent content went
 * stale, shifting them through every insert/delete.
 *
 * This class holds no reference to the renderer or the view model, so it is fully
 * unit-testable. The owner ({@link EditorViewGpu}) is responsible for renderer
 * readiness (calling {@link scheduleFullReload} until the renderer exists), for
 * executing the {@link IEditorViewSyncPlan} returned by {@link takePlan}, and for
 * sending lines before the renderer reads them.
 */
export class EditorViewModelSync {

	/** Starts `true` so the first {@link takePlan} performs the initial load. */
	private _fullReload = true;
	/** View lines (1-based) whose sent content is out of date, in current mirror coordinates. */
	private readonly _stale = new Set<number>();
	/** Structural splices recorded in emission order. */
	private _structural: IEditorViewLineSplice[] = [];

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
		return this._fullReload || this._stale.size > 0 || this._structural.length > 0;
	}

	/** Queue a full rebuild, discarding any pending incremental work. */
	public scheduleFullReload(): void {
		this._fullReload = true;
		this._stale.clear();
		this._structural = [];
	}

	/** Content of `count` existing view lines changed (no line-count change). */
	public onLinesChanged(fromLineNumber: number, count: number): void {
		if (this._fullReload) {
			return;
		}
		const to = fromLineNumber + count - 1;
		for (let line = fromLineNumber; line <= to; line++) {
			this._stale.add(line);
		}
	}

	/** `[fromLineNumber..toLineNumber]` view lines were inserted. */
	public onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		if (this._fullReload) {
			return;
		}
		const count = toLineNumber - fromLineNumber + 1;
		this._shiftStaleLines(line => line >= fromLineNumber ? line + count : line);
		this._structural.push({ start: fromLineNumber - 1, deleteCount: 0, insertCount: count });
	}

	/** `[fromLineNumber..toLineNumber]` view lines were deleted. */
	public onLinesDeleted(fromLineNumber: number, toLineNumber: number): void {
		if (this._fullReload) {
			return;
		}
		const count = toLineNumber - fromLineNumber + 1;
		this._shiftStaleLines(line => (line >= fromLineNumber && line <= toLineNumber) ? null : (line > toLineNumber ? line - count : line));
		this._structural.push({ start: fromLineNumber - 1, deleteCount: count, insertCount: 0 });
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
				this._stale.add(line);
			}
		}
	}

	/**
	 * Consume the accumulated plan and reset to a clean (no-op) state.
	 * `staleLines` is sorted ascending for deterministic application/testing.
	 */
	public takePlan(): IEditorViewSyncPlan {
		const plan: IEditorViewSyncPlan = this._fullReload
			? { fullReload: true, structural: [], staleLines: [] }
			: { fullReload: false, structural: this._structural, staleLines: Array.from(this._stale).sort((a, b) => a - b) };
		this._fullReload = false;
		this._stale.clear();
		this._structural = [];
		return plan;
	}

	/**
	 * Remap the stale lines through a structural edit so their numbers stay in
	 * the mirror's coordinate system. `shift` returns the new line number, or
	 * `null` to drop the entry (a deleted line).
	 */
	private _shiftStaleLines(shift: (line: number) => number | null): void {
		const remapped: number[] = [];
		for (const line of this._stale) {
			const next = shift(line);
			if (next !== null) {
				remapped.push(next);
			}
		}
		this._stale.clear();
		for (const line of remapped) {
			this._stale.add(line);
		}
	}
}
