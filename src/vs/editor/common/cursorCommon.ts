/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationChangedEvent, EditorAutoClosingEditStrategy, EditorAutoClosingStrategy, EditorAutoIndentStrategy, EditorAutoSurroundStrategy, EditorOption } from './config/editorOptions.js';
import { LineTokens } from './tokens/lineTokens.js';
import { Position } from './core/position.js';
import { Range } from './core/range.js';
import { ISelection, Selection } from './core/selection.js';
import { ICommand } from './editorCommon.js';
import { IEditorConfiguration } from './config/editorConfiguration.js';
import { PositionAffinity, TextModelResolvedOptions } from './model.js';
import { AutoClosingPairs } from './languages/languageConfiguration.js';
import { ILanguageConfigurationService } from './languages/languageConfigurationRegistry.js';
import { createScopedLineTokens } from './languages/supports.js';
import { IElectricAction } from './languages/supports/electricCharacter.js';
import { CursorColumns } from './core/cursorColumns.js';
import { normalizeIndentation } from './core/indentation.js';

export interface IColumnSelectData {
	isReal: boolean;
	fromViewLineNumber: number;
	fromViewVisualColumn: number;
	toViewLineNumber: number;
	toViewVisualColumn: number;
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
	public readonly typicalHalfwidthCharacterWidth: number;
	public readonly useTabStops: boolean;
	public readonly wordSeparators: string;
	public readonly emptySelectionClipboard: boolean;
	public readonly copyWithSyntaxHighlighting: boolean;
	public readonly multiCursorMergeOverlapping: boolean;
	public readonly multiCursorPaste: 'spread' | 'full';
	public readonly multiCursorLimit: number;
	public readonly autoClosingBrackets: EditorAutoClosingStrategy;
	public readonly autoClosingComments: EditorAutoClosingStrategy;
	public readonly autoClosingQuotes: EditorAutoClosingStrategy;
	public readonly autoClosingDelete: EditorAutoClosingEditStrategy;
	public readonly autoClosingOvertype: EditorAutoClosingEditStrategy;
	public readonly autoSurround: EditorAutoSurroundStrategy;
	public readonly autoIndent: EditorAutoIndentStrategy;
	public readonly autoClosingPairs: AutoClosingPairs;
	public readonly surroundingPairs: CharacterMap;
	public readonly blockCommentStartToken: string | null;
	public readonly shouldAutoCloseBefore: { quote: (ch: string) => boolean; bracket: (ch: string) => boolean; comment: (ch: string) => boolean };
	public readonly wordSegmenterLocales: string[];

	private readonly _languageId: string;
	private _electricChars: { [key: string]: boolean } | null;

	public static shouldRecreate(e: ConfigurationChangedEvent): boolean {
		return (
			e.hasChanged(EditorOption.layoutInfo)
			|| e.hasChanged(EditorOption.wordSeparators)
			|| e.hasChanged(EditorOption.emptySelectionClipboard)
			|| e.hasChanged(EditorOption.multiCursorMergeOverlapping)
			|| e.hasChanged(EditorOption.multiCursorPaste)
			|| e.hasChanged(EditorOption.multiCursorLimit)
			|| e.hasChanged(EditorOption.autoClosingBrackets)
			|| e.hasChanged(EditorOption.autoClosingComments)
			|| e.hasChanged(EditorOption.autoClosingQuotes)
			|| e.hasChanged(EditorOption.autoClosingDelete)
			|| e.hasChanged(EditorOption.autoClosingOvertype)
			|| e.hasChanged(EditorOption.autoSurround)
			|| e.hasChanged(EditorOption.useTabStops)
			|| e.hasChanged(EditorOption.fontInfo)
			|| e.hasChanged(EditorOption.readOnly)
			|| e.hasChanged(EditorOption.wordSegmenterLocales)
		);
	}

	constructor(
		languageId: string,
		modelOptions: TextModelResolvedOptions,
		configuration: IEditorConfiguration,
		public readonly languageConfigurationService: ILanguageConfigurationService
	) {
		this._languageId = languageId;

		const options = configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		const fontInfo = options.get(EditorOption.fontInfo);

		this.readOnly = options.get(EditorOption.readOnly);
		this.tabSize = modelOptions.tabSize;
		this.indentSize = modelOptions.indentSize;
		this.insertSpaces = modelOptions.insertSpaces;
		this.stickyTabStops = options.get(EditorOption.stickyTabStops);
		this.lineHeight = fontInfo.lineHeight;
		this.typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
		this.pageSize = Math.max(1, Math.floor(layoutInfo.height / this.lineHeight) - 2);
		this.useTabStops = options.get(EditorOption.useTabStops);
		this.wordSeparators = options.get(EditorOption.wordSeparators);
		this.emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);
		this.copyWithSyntaxHighlighting = options.get(EditorOption.copyWithSyntaxHighlighting);
		this.multiCursorMergeOverlapping = options.get(EditorOption.multiCursorMergeOverlapping);
		this.multiCursorPaste = options.get(EditorOption.multiCursorPaste);
		this.multiCursorLimit = options.get(EditorOption.multiCursorLimit);
		this.autoClosingBrackets = options.get(EditorOption.autoClosingBrackets);
		this.autoClosingComments = options.get(EditorOption.autoClosingComments);
		this.autoClosingQuotes = options.get(EditorOption.autoClosingQuotes);
		this.autoClosingDelete = options.get(EditorOption.autoClosingDelete);
		this.autoClosingOvertype = options.get(EditorOption.autoClosingOvertype);
		this.autoSurround = options.get(EditorOption.autoSurround);
		this.autoIndent = options.get(EditorOption.autoIndent);
		this.wordSegmenterLocales = options.get(EditorOption.wordSegmenterLocales);

		this.surroundingPairs = {};
		this._electricChars = null;

		this.shouldAutoCloseBefore = {
			quote: this._getShouldAutoClose(languageId, this.autoClosingQuotes, true),
			comment: this._getShouldAutoClose(languageId, this.autoClosingComments, false),
			bracket: this._getShouldAutoClose(languageId, this.autoClosingBrackets, false),
		};

		this.autoClosingPairs = this.languageConfigurationService.getLanguageConfiguration(languageId).getAutoClosingPairs();

		const surroundingPairs = this.languageConfigurationService.getLanguageConfiguration(languageId).getSurroundingPairs();
		if (surroundingPairs) {
			for (const pair of surroundingPairs) {
				this.surroundingPairs[pair.open] = pair.close;
			}
		}

		const commentsConfiguration = this.languageConfigurationService.getLanguageConfiguration(languageId).comments;
		this.blockCommentStartToken = commentsConfiguration?.blockCommentStartToken ?? null;
	}

	public get electricChars() {
		if (!this._electricChars) {
			this._electricChars = {};
			const electricChars = this.languageConfigurationService.getLanguageConfiguration(this._languageId).electricCharacter?.getElectricCharacters();
			if (electricChars) {
				for (const char of electricChars) {
					this._electricChars[char] = true;
				}
			}
		}
		return this._electricChars;
	}

	/**
	 * Should return opening bracket type to match indentation with
	 */
	public onElectricCharacter(character: string, context: LineTokens, column: number): IElectricAction | null {
		const scopedLineTokens = createScopedLineTokens(context, column - 1);
		const electricCharacterSupport = this.languageConfigurationService.getLanguageConfiguration(scopedLineTokens.languageId).electricCharacter;
		if (!electricCharacterSupport) {
			return null;
		}
		return electricCharacterSupport.onElectricCharacter(character, scopedLineTokens, column - scopedLineTokens.firstCharOffset);
	}

	public normalizeIndentation(str: string): string {
		return normalizeIndentation(str, this.indentSize, this.insertSpaces);
	}

	private _getShouldAutoClose(languageId: string, autoCloseConfig: EditorAutoClosingStrategy, forQuotes: boolean): (ch: string) => boolean {
		switch (autoCloseConfig) {
			case 'beforeWhitespace':
				return autoCloseBeforeWhitespace;
			case 'languageDefined':
				return this._getLanguageDefinedShouldAutoClose(languageId, forQuotes);
			case 'always':
				return autoCloseAlways;
			case 'never':
				return autoCloseNever;
		}
	}

	private _getLanguageDefinedShouldAutoClose(languageId: string, forQuotes: boolean): (ch: string) => boolean {
		const autoCloseBeforeSet = this.languageConfigurationService.getLanguageConfiguration(languageId).getAutoCloseBeforeSet(forQuotes);
		return c => autoCloseBeforeSet.indexOf(c) !== -1;
	}

	/**
	 * Returns a visible column from a column.
	 * @see {@link CursorColumns}
	 */
	public visibleColumnFromColumn(model: ICursorSimpleModel, position: Position): number {
		return CursorColumns.visibleColumnFromColumn(model.getLineContent(position.lineNumber), position.column, this.tabSize);
	}

	/**
	 * Returns a visible column from a column.
	 * @see {@link CursorColumns}
	 */
	public columnFromVisibleColumn(model: ICursorSimpleModel, lineNumber: number, visibleColumn: number): number {
		const result = CursorColumns.columnFromVisibleColumn(model.getLineContent(lineNumber), visibleColumn, this.tabSize);

		const minColumn = model.getLineMinColumn(lineNumber);
		if (result < minColumn) {
			return minColumn;
		}

		const maxColumn = model.getLineMaxColumn(lineNumber);
		if (result > maxColumn) {
			return maxColumn;
		}

		return result;
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
		const selection = Selection.liftSelection(modelSelection);
		const modelState = new SingleCursorState(
			Range.fromPositions(selection.getSelectionStart()),
			SelectionStartKind.Simple, 0,
			selection.getPosition(), 0
		);
		return CursorState.fromModelState(modelState);
	}

	public static fromModelSelections(modelSelections: readonly ISelection[]): PartialModelCursorState[] {
		const states: PartialModelCursorState[] = [];
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

export const enum SelectionStartKind {
	Simple,
	Word,
	Line
}

/**
 * Represents the cursor state on either the model or on the view model.
 */
export class SingleCursorState {
	_singleCursorStateBrand: void = undefined;

	public readonly selection: Selection;

	constructor(
		public readonly selectionStart: Range,
		public readonly selectionStartKind: SelectionStartKind,
		public readonly selectionStartLeftoverVisibleColumns: number,
		public readonly position: Position,
		public readonly leftoverVisibleColumns: number,
	) {
		this.selection = SingleCursorState._computeSelection(this.selectionStart, this.position);
	}

	public equals(other: SingleCursorState) {
		return (
			this.selectionStartLeftoverVisibleColumns === other.selectionStartLeftoverVisibleColumns
			&& this.leftoverVisibleColumns === other.leftoverVisibleColumns
			&& this.selectionStartKind === other.selectionStartKind
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
				this.selectionStartKind,
				this.selectionStartLeftoverVisibleColumns,
				new Position(lineNumber, column),
				leftoverVisibleColumns
			);
		} else {
			// move everything
			return new SingleCursorState(
				new Range(lineNumber, column, lineNumber, column),
				SelectionStartKind.Simple,
				leftoverVisibleColumns,
				new Position(lineNumber, column),
				leftoverVisibleColumns
			);
		}
	}

	private static _computeSelection(selectionStart: Range, position: Position): Selection {
		if (selectionStart.isEmpty() || !position.isBeforeOrEqual(selectionStart.getStartPosition())) {
			return Selection.fromPositions(selectionStart.getStartPosition(), position);
		} else {
			return Selection.fromPositions(selectionStart.getEndPosition(), position);
		}
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
