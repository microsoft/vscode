/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { ConfigurationChangedEvent, EditorAutoClosingEditStrategy, EditorAutoClosingStrategy, EditorAutoIndentStrategy, EditorAutoSurroundStrategy, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import { ICommand, IConfiguration } from 'vs/editor/common/editorCommon';
import { ITextModel, PositionAffinity, TextModelResolvedOptions } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { AutoClosingPairs, IAutoClosingPair } from 'vs/editor/common/modes/languageConfiguration';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { ICoordinatesConverter } from 'vs/editor/common/viewModel/viewModel';
export { CursorColumns } from './cursorColumns';

export interface IColumnSelectData {
	isReal: boolean;
	fromViewLineNumber: number;
	fromViewVisualColumn: number;
	toViewLineNumber: number;
	toViewVisualColumn: number;
}

export const enum RevealTarget {
	Primary = 0,
	TopMost = 1,
	BottomMost = 2
}

/**
 * This is an operation type that will be recorded for undo/redo purposes.
 * The goal is to introduce an undo stop when the controller switches between different operation types.
 */
export const enum EditOperationType {
	Other = 0,
	DeletingLeft = 2,
	DeletingRight = 3,
	TypingOther = 4,
	TypingFirstSpace = 5,
	TypingConsecutiveSpace = 6,
}

export interface CharacterMap {
	[char: string]: string;
}
export interface MultipleCharacterMap {
	[char: string]: string[];
}

const autoCloseAlways = () => true;
const autoCloseNever = () => false;
const autoCloseBeforeWhitespace = (chr: string) => (chr === ' ' || chr === '\t');

export class CursorConfiguration {
	_cursorMoveConfigurationBrand: void = undefined;

	public readonly readOnly: boolean;
	public readonly tabSize: number;
	public readonly indentSize: number;
	public readonly insertSpaces: boolean;
	public readonly stickyTabStops: boolean;
	public readonly pageSize: number;
	public readonly lineHeight: number;
	public readonly useTabStops: boolean;
	public readonly wordSeparators: string;
	public readonly emptySelectionClipboard: boolean;
	public readonly copyWithSyntaxHighlighting: boolean;
	public readonly multiCursorMergeOverlapping: boolean;
	public readonly multiCursorPaste: 'spread' | 'full';
	public readonly autoClosingBrackets: EditorAutoClosingStrategy;
	public readonly autoClosingQuotes: EditorAutoClosingStrategy;
	public readonly autoClosingDelete: EditorAutoClosingEditStrategy;
	public readonly autoClosingOvertype: EditorAutoClosingEditStrategy;
	public readonly autoSurround: EditorAutoSurroundStrategy;
	public readonly autoIndent: EditorAutoIndentStrategy;
	public readonly autoClosingPairs: AutoClosingPairs;
	public readonly surroundingPairs: CharacterMap;
	public readonly shouldAutoCloseBefore: { quote: (ch: string) => boolean, bracket: (ch: string) => boolean };

	private readonly _languageId: string;
	private _electricChars: { [key: string]: boolean; } | null;

	public static shouldRecreate(e: ConfigurationChangedEvent): boolean {
		return (
			e.hasChanged(EditorOption.layoutInfo)
			|| e.hasChanged(EditorOption.wordSeparators)
			|| e.hasChanged(EditorOption.emptySelectionClipboard)
			|| e.hasChanged(EditorOption.multiCursorMergeOverlapping)
			|| e.hasChanged(EditorOption.multiCursorPaste)
			|| e.hasChanged(EditorOption.autoClosingBrackets)
			|| e.hasChanged(EditorOption.autoClosingQuotes)
			|| e.hasChanged(EditorOption.autoClosingDelete)
			|| e.hasChanged(EditorOption.autoClosingOvertype)
			|| e.hasChanged(EditorOption.autoSurround)
			|| e.hasChanged(EditorOption.useTabStops)
			|| e.hasChanged(EditorOption.lineHeight)
			|| e.hasChanged(EditorOption.readOnly)
		);
	}

	constructor(
		languageId: string,
		modelOptions: TextModelResolvedOptions,
		configuration: IConfiguration
	) {
		this._languageId = languageId;

		const options = configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this.readOnly = options.get(EditorOption.readOnly);
		this.tabSize = modelOptions.tabSize;
		this.indentSize = modelOptions.indentSize;
		this.insertSpaces = modelOptions.insertSpaces;
		this.stickyTabStops = options.get(EditorOption.stickyTabStops);
		this.lineHeight = options.get(EditorOption.lineHeight);
		this.pageSize = Math.max(1, Math.floor(layoutInfo.height / this.lineHeight) - 2);
		this.useTabStops = options.get(EditorOption.useTabStops);
		this.wordSeparators = options.get(EditorOption.wordSeparators);
		this.emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);
		this.copyWithSyntaxHighlighting = options.get(EditorOption.copyWithSyntaxHighlighting);
		this.multiCursorMergeOverlapping = options.get(EditorOption.multiCursorMergeOverlapping);
		this.multiCursorPaste = options.get(EditorOption.multiCursorPaste);
		this.autoClosingBrackets = options.get(EditorOption.autoClosingBrackets);
		this.autoClosingQuotes = options.get(EditorOption.autoClosingQuotes);
		this.autoClosingDelete = options.get(EditorOption.autoClosingDelete);
		this.autoClosingOvertype = options.get(EditorOption.autoClosingOvertype);
		this.autoSurround = options.get(EditorOption.autoSurround);
		this.autoIndent = options.get(EditorOption.autoIndent);

		this.surroundingPairs = {};
		this._electricChars = null;

		this.shouldAutoCloseBefore = {
			quote: CursorConfiguration._getShouldAutoClose(languageId, this.autoClosingQuotes),
			bracket: CursorConfiguration._getShouldAutoClose(languageId, this.autoClosingBrackets)
		};

		this.autoClosingPairs = LanguageConfigurationRegistry.getAutoClosingPairs(languageId);

		let surroundingPairs = CursorConfiguration._getSurroundingPairs(languageId);
		if (surroundingPairs) {
			for (const pair of surroundingPairs) {
				this.surroundingPairs[pair.open] = pair.close;
			}
		}
	}

	public get electricChars() {
		if (!this._electricChars) {
			this._electricChars = {};
			let electricChars = CursorConfiguration._getElectricCharacters(this._languageId);
			if (electricChars) {
				for (const char of electricChars) {
					this._electricChars[char] = true;
				}
			}
		}
		return this._electricChars;
	}

	public normalizeIndentation(str: string): string {
		return TextModel.normalizeIndentation(str, this.indentSize, this.insertSpaces);
	}

	private static _getElectricCharacters(languageId: string): string[] | null {
		try {
			return LanguageConfigurationRegistry.getElectricCharacters(languageId);
		} catch (e) {
			onUnexpectedError(e);
			return null;
		}
	}

	private static _getShouldAutoClose(languageId: string, autoCloseConfig: EditorAutoClosingStrategy): (ch: string) => boolean {
		switch (autoCloseConfig) {
			case 'beforeWhitespace':
				return autoCloseBeforeWhitespace;
			case 'languageDefined':
				return CursorConfiguration._getLanguageDefinedShouldAutoClose(languageId);
			case 'always':
				return autoCloseAlways;
			case 'never':
				return autoCloseNever;
		}
	}

	private static _getLanguageDefinedShouldAutoClose(languageId: string): (ch: string) => boolean {
		try {
			const autoCloseBeforeSet = LanguageConfigurationRegistry.getAutoCloseBeforeSet(languageId);
			return c => autoCloseBeforeSet.indexOf(c) !== -1;
		} catch (e) {
			onUnexpectedError(e);
			return autoCloseNever;
		}
	}

	private static _getSurroundingPairs(languageId: string): IAutoClosingPair[] | null {
		try {
			return LanguageConfigurationRegistry.getSurroundingPairs(languageId);
		} catch (e) {
			onUnexpectedError(e);
			return null;
		}
	}
}

/**
 * Represents a simple model (either the model or the view model).
 */
export interface ICursorSimpleModel {
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
	getLineMinColumn(lineNumber: number): number;
	getLineMaxColumn(lineNumber: number): number;
	getLineFirstNonWhitespaceColumn(lineNumber: number): number;
	getLineLastNonWhitespaceColumn(lineNumber: number): number;
	normalizePosition(position: Position, affinity: PositionAffinity): Position;

	/**
	 * Gets the column at which indentation stops at a given line.
	 * @internal
	 */
	getLineIndentColumn(lineNumber: number): number;
}

/**
 * Represents the cursor state on either the model or on the view model.
 */
export class SingleCursorState {
	_singleCursorStateBrand: void = undefined;

	// --- selection can start as a range (think double click and drag)
	public readonly selectionStart: Range;
	public readonly selectionStartLeftoverVisibleColumns: number;
	public readonly position: Position;
	public readonly leftoverVisibleColumns: number;
	public readonly selection: Selection;

	constructor(
		selectionStart: Range,
		selectionStartLeftoverVisibleColumns: number,
		position: Position,
		leftoverVisibleColumns: number,
	) {
		this.selectionStart = selectionStart;
		this.selectionStartLeftoverVisibleColumns = selectionStartLeftoverVisibleColumns;
		this.position = position;
		this.leftoverVisibleColumns = leftoverVisibleColumns;
		this.selection = SingleCursorState._computeSelection(this.selectionStart, this.position);
	}

	public equals(other: SingleCursorState) {
		return (
			this.selectionStartLeftoverVisibleColumns === other.selectionStartLeftoverVisibleColumns
			&& this.leftoverVisibleColumns === other.leftoverVisibleColumns
			&& this.position.equals(other.position)
			&& this.selectionStart.equalsRange(other.selectionStart)
		);
	}

	public hasSelection(): boolean {
		return (!this.selection.isEmpty() || !this.selectionStart.isEmpty());
	}

	public move(inSelectionMode: boolean, lineNumber: number, column: number, leftoverVisibleColumns: number): SingleCursorState {
		if (inSelectionMode) {
			// move just position
			return new SingleCursorState(
				this.selectionStart,
				this.selectionStartLeftoverVisibleColumns,
				new Position(lineNumber, column),
				leftoverVisibleColumns
			);
		} else {
			// move everything
			return new SingleCursorState(
				new Range(lineNumber, column, lineNumber, column),
				leftoverVisibleColumns,
				new Position(lineNumber, column),
				leftoverVisibleColumns
			);
		}
	}

	private static _computeSelection(selectionStart: Range, position: Position): Selection {
		let startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number;
		if (selectionStart.isEmpty()) {
			startLineNumber = selectionStart.startLineNumber;
			startColumn = selectionStart.startColumn;
			endLineNumber = position.lineNumber;
			endColumn = position.column;
		} else {
			if (position.isBeforeOrEqual(selectionStart.getStartPosition())) {
				startLineNumber = selectionStart.endLineNumber;
				startColumn = selectionStart.endColumn;
				endLineNumber = position.lineNumber;
				endColumn = position.column;
			} else {
				startLineNumber = selectionStart.startLineNumber;
				startColumn = selectionStart.startColumn;
				endLineNumber = position.lineNumber;
				endColumn = position.column;
			}
		}
		return new Selection(
			startLineNumber,
			startColumn,
			endLineNumber,
			endColumn
		);
	}
}

export class CursorContext {
	_cursorContextBrand: void = undefined;

	public readonly model: ITextModel;
	public readonly viewModel: ICursorSimpleModel;
	public readonly coordinatesConverter: ICoordinatesConverter;
	public readonly cursorConfig: CursorConfiguration;

	constructor(model: ITextModel, viewModel: ICursorSimpleModel, coordinatesConverter: ICoordinatesConverter, cursorConfig: CursorConfiguration) {
		this.model = model;
		this.viewModel = viewModel;
		this.coordinatesConverter = coordinatesConverter;
		this.cursorConfig = cursorConfig;
	}
}

export class PartialModelCursorState {
	readonly modelState: SingleCursorState;
	readonly viewState: null;

	constructor(modelState: SingleCursorState) {
		this.modelState = modelState;
		this.viewState = null;
	}
}

export class PartialViewCursorState {
	readonly modelState: null;
	readonly viewState: SingleCursorState;

	constructor(viewState: SingleCursorState) {
		this.modelState = null;
		this.viewState = viewState;
	}
}

export type PartialCursorState = CursorState | PartialModelCursorState | PartialViewCursorState;

export class CursorState {
	_cursorStateBrand: void = undefined;

	public static fromModelState(modelState: SingleCursorState): PartialModelCursorState {
		return new PartialModelCursorState(modelState);
	}

	public static fromViewState(viewState: SingleCursorState): PartialViewCursorState {
		return new PartialViewCursorState(viewState);
	}

	public static fromModelSelection(modelSelection: ISelection): PartialModelCursorState {
		const selectionStartLineNumber = modelSelection.selectionStartLineNumber;
		const selectionStartColumn = modelSelection.selectionStartColumn;
		const positionLineNumber = modelSelection.positionLineNumber;
		const positionColumn = modelSelection.positionColumn;
		const modelState = new SingleCursorState(
			new Range(selectionStartLineNumber, selectionStartColumn, selectionStartLineNumber, selectionStartColumn), 0,
			new Position(positionLineNumber, positionColumn), 0
		);
		return CursorState.fromModelState(modelState);
	}

	public static fromModelSelections(modelSelections: readonly ISelection[]): PartialModelCursorState[] {
		let states: PartialModelCursorState[] = [];
		for (let i = 0, len = modelSelections.length; i < len; i++) {
			states[i] = this.fromModelSelection(modelSelections[i]);
		}
		return states;
	}

	readonly modelState: SingleCursorState;
	readonly viewState: SingleCursorState;

	constructor(modelState: SingleCursorState, viewState: SingleCursorState) {
		this.modelState = modelState;
		this.viewState = viewState;
	}

	public equals(other: CursorState): boolean {
		return (this.viewState.equals(other.viewState) && this.modelState.equals(other.modelState));
	}
}

export class EditOperationResult {
	_editOperationResultBrand: void = undefined;

	readonly type: EditOperationType;
	readonly commands: Array<ICommand | null>;
	readonly shouldPushStackElementBefore: boolean;
	readonly shouldPushStackElementAfter: boolean;

	constructor(
		type: EditOperationType,
		commands: Array<ICommand | null>,
		opts: {
			shouldPushStackElementBefore: boolean;
			shouldPushStackElementAfter: boolean;
		}
	) {
		this.type = type;
		this.commands = commands;
		this.shouldPushStackElementBefore = opts.shouldPushStackElementBefore;
		this.shouldPushStackElementAfter = opts.shouldPushStackElementAfter;
	}
}

export function isQuote(ch: string): boolean {
	return (ch === '\'' || ch === '"' || ch === '`');
}
