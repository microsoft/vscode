/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { IModeConfiguration, IOneCursorState, IViewModelHelper, OneCursor } from 'vs/editor/common/controller/oneCursor';
import { Selection } from 'vs/editor/common/core/selection';
import { IConfiguration, IModel, ISelection } from 'vs/editor/common/editorCommon';
import { IAutoClosingPair } from 'vs/editor/common/modes/languageConfiguration';
import { Position } from 'vs/editor/common/core/position';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';

export interface ICursorCollectionState {
	primary: IOneCursorState;
	secondary: IOneCursorState[];
}

export class CursorCollection {

	private model: IModel;
	private configuration: IConfiguration;
	private modeConfiguration: IModeConfiguration;

	private primaryCursor: OneCursor;
	private secondaryCursors: OneCursor[];

	// An index which identifies the last cursor that was added / moved (think Ctrl+drag)
	private lastAddedCursorIndex: number;

	private viewModelHelper: IViewModelHelper;

	constructor(model: IModel, configuration: IConfiguration, viewModelHelper: IViewModelHelper) {
		this.model = model;
		this.configuration = configuration;
		this.viewModelHelper = viewModelHelper;
		this.modeConfiguration = this.getModeConfiguration();

		this.primaryCursor = new OneCursor(this.model, this.configuration, this.modeConfiguration, this.viewModelHelper);
		this.secondaryCursors = [];
		this.lastAddedCursorIndex = 0;
	}

	public dispose(): void {
		this.primaryCursor.dispose();
		this.killSecondaryCursors();
	}

	public ensureValidState(): void {
		this.primaryCursor.ensureValidState();
		for (let i = 0, len = this.secondaryCursors.length; i < len; i++) {
			this.secondaryCursors[i].ensureValidState();
		}
	}

	public saveState(): ICursorCollectionState {
		return {
			primary: this.primaryCursor.saveState(),
			secondary: this.secondaryCursors.map(c => c.saveState())
		};
	}

	public restoreState(state: ICursorCollectionState): void {
		this.primaryCursor.restoreState(state.primary);
		this.killSecondaryCursors();
		for (var i = 0; i < state.secondary.length; i++) {
			this.addSecondaryCursor(null);
			this.secondaryCursors[i].restoreState(state.secondary[i]);
		}
	}


	public updateMode(): void {
		this.modeConfiguration = this.getModeConfiguration();
		this.getAll().forEach((cursor) => {
			cursor.updateModeConfiguration(this.modeConfiguration);
		});
	}

	public getAll(): OneCursor[] {
		var result: OneCursor[] = [];
		result.push(this.primaryCursor);
		result = result.concat(this.secondaryCursors);
		return result;
	}

	public getPosition(index: number): Position {
		if (index === 0) {
			return this.primaryCursor.modelState.position;
		} else {
			return this.secondaryCursors[index - 1].modelState.position;
		}
	}

	public getViewPosition(index: number): Position {
		if (index === 0) {
			return this.primaryCursor.viewState.position;
		} else {
			return this.secondaryCursors[index - 1].viewState.position;
		}
	}

	public getPositions(): Position[] {
		var result: Position[] = [];
		result.push(this.primaryCursor.modelState.position);
		for (var i = 0, len = this.secondaryCursors.length; i < len; i++) {
			result.push(this.secondaryCursors[i].modelState.position);
		}
		return result;
	}

	public getViewPositions(): Position[] {
		var result: Position[] = [];
		result.push(this.primaryCursor.viewState.position);
		for (var i = 0, len = this.secondaryCursors.length; i < len; i++) {
			result.push(this.secondaryCursors[i].viewState.position);
		}
		return result;
	}

	public getSelection(index: number): Selection {
		if (index === 0) {
			return this.primaryCursor.modelState.selection;
		} else {
			return this.secondaryCursors[index - 1].modelState.selection;
		}
	}

	public getSelections(): Selection[] {
		var result: Selection[] = [];
		result.push(this.primaryCursor.modelState.selection);
		for (var i = 0, len = this.secondaryCursors.length; i < len; i++) {
			result.push(this.secondaryCursors[i].modelState.selection);
		}
		return result;
	}

	public getViewSelections(): Selection[] {
		var result: Selection[] = [];
		result.push(this.primaryCursor.viewState.selection);
		for (var i = 0, len = this.secondaryCursors.length; i < len; i++) {
			result.push(this.secondaryCursors[i].viewState.selection);
		}
		return result;
	}

	public setSelections(selections: ISelection[], viewSelections?: ISelection[]): void {
		this.primaryCursor.setSelection(selections[0], viewSelections ? viewSelections[0] : null);
		this._setSecondarySelections(selections.slice(1), viewSelections ? viewSelections.slice(1) : null);
	}

	public killSecondaryCursors(): boolean {
		return (this._setSecondarySelections([], []) > 0);
	}

	public normalize(): void {
		this._mergeCursorsIfNecessary();
	}

	public addSecondaryCursor(selection: ISelection): void {
		var newCursor = new OneCursor(this.model, this.configuration, this.modeConfiguration, this.viewModelHelper);
		if (selection) {
			newCursor.setSelection(selection);
		}
		this.secondaryCursors.push(newCursor);
		this.lastAddedCursorIndex = this.secondaryCursors.length;
	}

	public duplicateCursors(): void {
		var newCursors: OneCursor[] = [];

		newCursors.push(this.primaryCursor.duplicate());
		for (var i = 0, len = this.secondaryCursors.length; i < len; i++) {
			newCursors.push(this.secondaryCursors[i].duplicate());
		}

		this.secondaryCursors = this.secondaryCursors.concat(newCursors);
		this.lastAddedCursorIndex = this.secondaryCursors.length;
	}

	public getLastAddedCursor(): OneCursor {
		if (this.secondaryCursors.length === 0 || this.lastAddedCursorIndex === 0) {
			return this.primaryCursor;
		}
		return this.secondaryCursors[this.lastAddedCursorIndex - 1];
	}

	/**
	 * Creates or disposes secondary cursors as necessary to match the number of `secondarySelections`.
	 * Return value:
	 * 		- a positive number indicates the number of secondary cursors added
	 * 		- a negative number indicates the number of secondary cursors removed
	 * 		- 0 indicates that no changes have been done to the secondary cursors list
	 */
	private _setSecondarySelections(secondarySelections: ISelection[], viewSelections: ISelection[]): number {
		var secondaryCursorsLength = this.secondaryCursors.length;
		var secondarySelectionsLength = secondarySelections.length;
		var returnValue = secondarySelectionsLength - secondaryCursorsLength;

		if (secondaryCursorsLength < secondarySelectionsLength) {
			var createCnt = secondarySelectionsLength - secondaryCursorsLength;
			for (var i = 0; i < createCnt; i++) {
				this.addSecondaryCursor(null);
			}
		} else if (secondaryCursorsLength > secondarySelectionsLength) {
			var removeCnt = secondaryCursorsLength - secondarySelectionsLength;
			for (var i = 0; i < removeCnt; i++) {
				this._removeSecondaryCursor(this.secondaryCursors.length - 1);
			}
		}

		for (var i = 0; i < secondarySelectionsLength; i++) {
			if (secondarySelections[i]) {
				this.secondaryCursors[i].setSelection(secondarySelections[i], viewSelections ? viewSelections[i] : null);
			}
		}

		return returnValue;
	}

	private _removeSecondaryCursor(removeIndex: number): void {
		if (this.lastAddedCursorIndex >= removeIndex + 1) {
			this.lastAddedCursorIndex--;
		}
		this.secondaryCursors[removeIndex].dispose();
		this.secondaryCursors.splice(removeIndex, 1);
	}

	private _mergeCursorsIfNecessary(): void {
		if (this.secondaryCursors.length === 0) {
			return;
		}
		var cursors = this.getAll();
		var sortedCursors: {
			index: number;
			selection: Selection;
			viewSelection: Selection;
		}[] = [];
		for (var i = 0; i < cursors.length; i++) {
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

		for (var sortedCursorIndex = 0; sortedCursorIndex < sortedCursors.length - 1; sortedCursorIndex++) {
			var current = sortedCursors[sortedCursorIndex];
			var next = sortedCursors[sortedCursorIndex + 1];

			var currentViewSelection = current.viewSelection;
			var nextViewSelection = next.viewSelection;

			if (nextViewSelection.getStartPosition().isBeforeOrEqual(currentViewSelection.getEndPosition())) {
				var winnerSortedCursorIndex = current.index < next.index ? sortedCursorIndex : sortedCursorIndex + 1;
				var looserSortedCursorIndex = current.index < next.index ? sortedCursorIndex + 1 : sortedCursorIndex;

				var looserIndex = sortedCursors[looserSortedCursorIndex].index;
				var winnerIndex = sortedCursors[winnerSortedCursorIndex].index;

				var looserSelection = sortedCursors[looserSortedCursorIndex].selection;
				var winnerSelection = sortedCursors[winnerSortedCursorIndex].selection;

				if (!looserSelection.equalsSelection(winnerSelection)) {
					var resultingRange = looserSelection.plusRange(winnerSelection);
					var looserSelectionIsLTR = (looserSelection.selectionStartLineNumber === looserSelection.startLineNumber && looserSelection.selectionStartColumn === looserSelection.startColumn);
					var winnerSelectionIsLTR = (winnerSelection.selectionStartLineNumber === winnerSelection.startLineNumber && winnerSelection.selectionStartColumn === winnerSelection.startColumn);

					// Give more importance to the last added cursor (think Ctrl-dragging + hitting another cursor)
					var resultingSelectionIsLTR: boolean;
					if (looserIndex === this.lastAddedCursorIndex) {
						resultingSelectionIsLTR = looserSelectionIsLTR;
						this.lastAddedCursorIndex = winnerIndex;
					} else {
						// Winner takes it all
						resultingSelectionIsLTR = winnerSelectionIsLTR;
					}

					var resultingSelection: Selection;
					if (resultingSelectionIsLTR) {
						resultingSelection = new Selection(resultingRange.startLineNumber, resultingRange.startColumn, resultingRange.endLineNumber, resultingRange.endColumn);
					} else {
						resultingSelection = new Selection(resultingRange.endLineNumber, resultingRange.endColumn, resultingRange.startLineNumber, resultingRange.startColumn);
					}

					sortedCursors[winnerSortedCursorIndex].selection = resultingSelection;
					cursors[winnerIndex].setSelection(resultingSelection);
				}

				for (var j = 0; j < sortedCursors.length; j++) {
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

	private getModeConfiguration(): IModeConfiguration {
		let i: number;

		let result: IModeConfiguration = {
			electricChars: {},
			autoClosingPairsOpen: {},
			autoClosingPairsClose: {},
			surroundingPairs: {}
		};


		let electricChars: string[] = null;
		try {
			electricChars = LanguageConfigurationRegistry.getElectricCharacters(this.model.getLanguageIdentifier().id);
		} catch (e) {
			onUnexpectedError(e);
			electricChars = null;
		}
		if (electricChars) {
			for (i = 0; i < electricChars.length; i++) {
				result.electricChars[electricChars[i]] = true;
			}
		}

		let autoClosingPairs: IAutoClosingPair[];
		try {
			autoClosingPairs = LanguageConfigurationRegistry.getAutoClosingPairs(this.model.getLanguageIdentifier().id);
		} catch (e) {
			onUnexpectedError(e);
			autoClosingPairs = null;
		}
		if (autoClosingPairs) {
			for (i = 0; i < autoClosingPairs.length; i++) {
				result.autoClosingPairsOpen[autoClosingPairs[i].open] = autoClosingPairs[i].close;
				result.autoClosingPairsClose[autoClosingPairs[i].close] = autoClosingPairs[i].open;
			}
		}

		let surroundingPairs: IAutoClosingPair[];
		try {
			surroundingPairs = LanguageConfigurationRegistry.getSurroundingPairs(this.model.getLanguageIdentifier().id);
		} catch (e) {
			onUnexpectedError(e);
			surroundingPairs = null;
		}
		if (surroundingPairs) {
			for (i = 0; i < surroundingPairs.length; i++) {
				result.surroundingPairs[surroundingPairs[i].open] = surroundingPairs[i].close;
			}
		}

		return result;
	}
}
