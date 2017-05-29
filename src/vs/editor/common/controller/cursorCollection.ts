/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { OneCursor } from 'vs/editor/common/controller/oneCursor';
import { Selection, ISelection } from 'vs/editor/common/core/selection';
import { Position } from 'vs/editor/common/core/position';
import { CursorState, CursorContext } from 'vs/editor/common/controller/cursorCommon';

export class CursorCollection {

	private context: CursorContext;

	private primaryCursor: OneCursor;
	private secondaryCursors: OneCursor[];

	// An index which identifies the last cursor that was added / moved (think Ctrl+drag)
	private lastAddedCursorIndex: number;

	constructor(context: CursorContext) {
		this.context = context;
		this.primaryCursor = new OneCursor(context);
		this.secondaryCursors = [];
		this.lastAddedCursorIndex = 0;
	}

	public dispose(): void {
		this.primaryCursor.dispose(this.context);
		this.killSecondaryCursors();
	}

	public updateContext(context: CursorContext): void {
		this.context = context;
	}

	public ensureValidState(): void {
		this.primaryCursor.ensureValidState(this.context);
		for (let i = 0, len = this.secondaryCursors.length; i < len; i++) {
			this.secondaryCursors[i].ensureValidState(this.context);
		}
	}

	public readSelectionFromMarkers(): Selection[] {
		let result: Selection[] = [];
		result[0] = this.primaryCursor.readSelectionFromMarkers(this.context);
		for (let i = 0, len = this.secondaryCursors.length; i < len; i++) {
			result[i + 1] = this.secondaryCursors[i].readSelectionFromMarkers(this.context);
		}
		return result;
	}

	public getAll(): CursorState[] {
		let result: CursorState[] = [];
		result[0] = this.primaryCursor.asCursorState();
		for (let i = 0, len = this.secondaryCursors.length; i < len; i++) {
			result[i + 1] = this.secondaryCursors[i].asCursorState();
		}
		return result;
	}

	public getViewPositions(): Position[] {
		let result: Position[] = [];
		result[0] = this.primaryCursor.viewState.position;
		for (let i = 0, len = this.secondaryCursors.length; i < len; i++) {
			result[i + 1] = this.secondaryCursors[i].viewState.position;
		}
		return result;
	}

	public getSelections(): Selection[] {
		let result: Selection[] = [];
		result[0] = this.primaryCursor.modelState.selection;
		for (let i = 0, len = this.secondaryCursors.length; i < len; i++) {
			result[i + 1] = this.secondaryCursors[i].modelState.selection;
		}
		return result;
	}

	public getViewSelections(): Selection[] {
		let result: Selection[] = [];
		result[0] = this.primaryCursor.viewState.selection;
		for (let i = 0, len = this.secondaryCursors.length; i < len; i++) {
			result[i + 1] = this.secondaryCursors[i].viewState.selection;
		}
		return result;
	}

	public setSelections(selections: ISelection[]): void {
		this.setStates(CursorState.fromModelSelections(selections));
	}

	public getPrimaryCursor(): CursorState {
		return this.primaryCursor.asCursorState();
	}

	public setStates(states: CursorState[]): void {
		if (states === null) {
			return;
		}
		this.primaryCursor.setState(this.context, states[0].modelState, states[0].viewState);
		this._setSecondaryStates(states.slice(1));
	}

	/**
	 * Creates or disposes secondary cursors as necessary to match the number of `secondarySelections`.
	 */
	private _setSecondaryStates(secondaryStates: CursorState[]): void {
		const secondaryCursorsLength = this.secondaryCursors.length;
		const secondaryStatesLength = secondaryStates.length;

		if (secondaryCursorsLength < secondaryStatesLength) {
			let createCnt = secondaryStatesLength - secondaryCursorsLength;
			for (let i = 0; i < createCnt; i++) {
				this._addSecondaryCursor();
			}
		} else if (secondaryCursorsLength > secondaryStatesLength) {
			let removeCnt = secondaryCursorsLength - secondaryStatesLength;
			for (let i = 0; i < removeCnt; i++) {
				this._removeSecondaryCursor(this.secondaryCursors.length - 1);
			}
		}

		for (let i = 0; i < secondaryStatesLength; i++) {
			this.secondaryCursors[i].setState(this.context, secondaryStates[i].modelState, secondaryStates[i].viewState);
		}
	}

	public killSecondaryCursors(): void {
		this._setSecondaryStates([]);
	}

	private _addSecondaryCursor(): void {
		this.secondaryCursors.push(new OneCursor(this.context));
		this.lastAddedCursorIndex = this.secondaryCursors.length;
	}

	public getLastAddedCursorIndex(): number {
		if (this.secondaryCursors.length === 0 || this.lastAddedCursorIndex === 0) {
			return 0;
		}
		return this.lastAddedCursorIndex;
	}

	private _removeSecondaryCursor(removeIndex: number): void {
		if (this.lastAddedCursorIndex >= removeIndex + 1) {
			this.lastAddedCursorIndex--;
		}
		this.secondaryCursors[removeIndex].dispose(this.context);
		this.secondaryCursors.splice(removeIndex, 1);
	}

	private _getAll(): OneCursor[] {
		let result: OneCursor[] = [];
		result[0] = this.primaryCursor;
		for (let i = 0, len = this.secondaryCursors.length; i < len; i++) {
			result[i + 1] = this.secondaryCursors[i];
		}
		return result;
	}

	public normalize(): void {
		if (this.secondaryCursors.length === 0) {
			return;
		}
		let cursors = this._getAll();

		interface SortedCursor {
			index: number;
			selection: Selection;
			viewSelection: Selection;
		}
		let sortedCursors: SortedCursor[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			sortedCursors.push({
				index: i,
				selection: cursors[i].modelState.selection,
				viewSelection: cursors[i].viewState.selection
			});
		}
		sortedCursors.sort((a, b) => {
			if (a.viewSelection.startLineNumber === b.viewSelection.startLineNumber) {
				return a.viewSelection.startColumn - b.viewSelection.startColumn;
			}
			return a.viewSelection.startLineNumber - b.viewSelection.startLineNumber;
		});

		for (let sortedCursorIndex = 0; sortedCursorIndex < sortedCursors.length - 1; sortedCursorIndex++) {
			const current = sortedCursors[sortedCursorIndex];
			const next = sortedCursors[sortedCursorIndex + 1];

			const currentViewSelection = current.viewSelection;
			const nextViewSelection = next.viewSelection;

			let shouldMergeCursors: boolean;
			if (nextViewSelection.isEmpty() || currentViewSelection.isEmpty()) {
				// Merge touching cursors if one of them is collapsed
				shouldMergeCursors = nextViewSelection.getStartPosition().isBeforeOrEqual(currentViewSelection.getEndPosition());
			} else {
				// Merge only overlapping cursors (i.e. allow touching ranges)
				shouldMergeCursors = nextViewSelection.getStartPosition().isBefore(currentViewSelection.getEndPosition());
			}

			if (shouldMergeCursors) {
				const winnerSortedCursorIndex = current.index < next.index ? sortedCursorIndex : sortedCursorIndex + 1;
				const looserSortedCursorIndex = current.index < next.index ? sortedCursorIndex + 1 : sortedCursorIndex;

				const looserIndex = sortedCursors[looserSortedCursorIndex].index;
				const winnerIndex = sortedCursors[winnerSortedCursorIndex].index;

				const looserSelection = sortedCursors[looserSortedCursorIndex].selection;
				const winnerSelection = sortedCursors[winnerSortedCursorIndex].selection;

				if (!looserSelection.equalsSelection(winnerSelection)) {
					const resultingRange = looserSelection.plusRange(winnerSelection);
					const looserSelectionIsLTR = (looserSelection.selectionStartLineNumber === looserSelection.startLineNumber && looserSelection.selectionStartColumn === looserSelection.startColumn);
					const winnerSelectionIsLTR = (winnerSelection.selectionStartLineNumber === winnerSelection.startLineNumber && winnerSelection.selectionStartColumn === winnerSelection.startColumn);

					// Give more importance to the last added cursor (think Ctrl-dragging + hitting another cursor)
					let resultingSelectionIsLTR: boolean;
					if (looserIndex === this.lastAddedCursorIndex) {
						resultingSelectionIsLTR = looserSelectionIsLTR;
						this.lastAddedCursorIndex = winnerIndex;
					} else {
						// Winner takes it all
						resultingSelectionIsLTR = winnerSelectionIsLTR;
					}

					let resultingSelection: Selection;
					if (resultingSelectionIsLTR) {
						resultingSelection = new Selection(resultingRange.startLineNumber, resultingRange.startColumn, resultingRange.endLineNumber, resultingRange.endColumn);
					} else {
						resultingSelection = new Selection(resultingRange.endLineNumber, resultingRange.endColumn, resultingRange.startLineNumber, resultingRange.startColumn);
					}

					sortedCursors[winnerSortedCursorIndex].selection = resultingSelection;
					const resultingState = CursorState.fromModelSelection(resultingSelection);
					cursors[winnerIndex].setState(this.context, resultingState.modelState, resultingState.viewState);
				}

				for (let j = 0; j < sortedCursors.length; j++) {
					if (sortedCursors[j].index > looserIndex) {
						sortedCursors[j].index--;
					}
				}

				cursors.splice(looserIndex, 1);
				sortedCursors.splice(looserSortedCursorIndex, 1);
				this._removeSecondaryCursor(looserIndex - 1);

				sortedCursorIndex--;
			}
		}
	}
}
