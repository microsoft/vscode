/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FoldingControlInput, LineInput } from './editorViewTypes.js';

/** Folding controls to send for the lines from `start`. */
export interface IFoldingControlsRun {
	readonly start: number;
	readonly controls: (FoldingControlInput | null)[];
}

/** Indentation guides to send for the lines from `start`. */
export interface IIndentGuidesRun {
	readonly start: number;
	readonly counts: number[];
	readonly activeLevels: number[];
}

/**
 * The folding control and indentation guides of each line as the renderer
 * has them, in step with its line list, so a frame sends only those that
 * changed. A line the renderer inserts has neither yet; a line sent again
 * (`replaceLines`) brings its folding control and loses its guides.
 */
export class EditorViewLineState {
	/** `null` for no control, `undefined` while the renderer may not have it. */
	private _foldingControls: (FoldingControlInput | null | undefined)[] = [];
	private _guideCounts: (number | undefined)[] = [];
	private _activeGuides: (number | undefined)[] = [];

	/** The renderer dropped every line. */
	public reset(): void {
		this._foldingControls = [];
		this._guideCounts = [];
		this._activeGuides = [];
	}

	/** The renderer replaced `deleteCount` lines at 0-based `start` with `insertCount` new ones. */
	public spliceLines(start: number, deleteCount: number, insertCount: number): void {
		spliceUnknown(this._foldingControls, start, deleteCount, insertCount);
		spliceUnknown(this._guideCounts, start, deleteCount, insertCount);
		spliceUnknown(this._activeGuides, start, deleteCount, insertCount);
	}

	/** The renderer replaced `deleteCount` lines at 0-based `start` with `lines`. */
	public replaceLines(start: number, deleteCount: number, lines: readonly LineInput[]): void {
		this._foldingControls.splice(start, deleteCount, ...lines.map(line => line.foldingControl ?? null));
		this._guideCounts.splice(start, deleteCount, ...lines.map(() => 0));
		this._activeGuides.splice(start, deleteCount, ...lines.map(() => 0));
	}

	/**
	 * The runs of `controls`, those of the lines from `start`, that the
	 * renderer does not have, in order; it has them once they are sent.
	 */
	public foldingControlsToSend(start: number, controls: readonly (FoldingControlInput | null)[]): IFoldingControlsRun[] {
		const sent = this._foldingControls;
		return changedRuns(controls.length, i => sent[start + i] !== controls[i]).map(([runStart, runEnd]) => {
			for (let i = runStart; i < runEnd; i++) {
				sent[start + i] = controls[i];
			}
			return { start: start + runStart, controls: controls.slice(runStart, runEnd) };
		});
	}

	/** Like {@link foldingControlsToSend}, for the guides of the lines from `start`. */
	public indentGuidesToSend(start: number, counts: readonly number[], activeLevels: readonly number[]): IIndentGuidesRun[] {
		const [sentCounts, sentActive] = [this._guideCounts, this._activeGuides];
		return changedRuns(counts.length, i => sentCounts[start + i] !== counts[i] || sentActive[start + i] !== activeLevels[i]).map(([runStart, runEnd]) => {
			for (let i = runStart; i < runEnd; i++) {
				sentCounts[start + i] = counts[i];
				sentActive[start + i] = activeLevels[i];
			}
			return { start: start + runStart, counts: counts.slice(runStart, runEnd), activeLevels: activeLevels.slice(runStart, runEnd) };
		});
	}
}

/** Replace `deleteCount` entries at `start` with `insertCount` unknown ones, without spreading a large insert. */
function spliceUnknown<T>(values: (T | undefined)[], start: number, deleteCount: number, insertCount: number): void {
	const tail = values.splice(start + deleteCount);
	values.length = Math.min(values.length, start);
	for (let i = 0; i < insertCount; i++) {
		values.push(undefined);
	}
	for (const value of tail) {
		values.push(value);
	}
}

/** The runs `[start, end)` of the indices below `length` that `changed` picks. */
function changedRuns(length: number, changed: (index: number) => boolean): [number, number][] {
	const runs: [number, number][] = [];
	let runStart = -1;
	for (let i = 0; i < length; i++) {
		if (changed(i)) {
			if (runStart < 0) {
				runStart = i;
			}
		} else if (runStart >= 0) {
			runs.push([runStart, i]);
			runStart = -1;
		}
	}
	if (runStart >= 0) {
		runs.push([runStart, length]);
	}
	return runs;
}
