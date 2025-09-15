/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPosition } from './core/position.js';
import { IRange, Range } from './core/range.js';
import { Selection } from './core/selection.js';
import { IModelDecoration, InjectedTextOptions } from './model.js';
import { IModelContentChange } from './model/mirrorTextModel.js';
import { TextModelEditSource } from './textModelEditSource.js';

/**
 * An event describing that the current language associated with a model has changed.
 */
export interface IModelLanguageChangedEvent {
	/**
	 * Previous language
	 */
	readonly oldLanguage: string;
	/**
	 * New language
	 */
	readonly newLanguage: string;

	/**
	 * Source of the call that caused the event.
	 */
	readonly source: string;
}

/**
 * An event describing that the language configuration associated with a model has changed.
 */
export interface IModelLanguageConfigurationChangedEvent {
}

/**
 * An event describing a change in the text of a model.
 */
export interface IModelContentChangedEvent {
	/**
	 * The changes are ordered from the end of the document to the beginning, so they should be safe to apply in sequence.
	 */
	readonly changes: IModelContentChange[];
	/**
	 * The (new) end-of-line character.
	 */
	readonly eol: string;
	/**
	 * The new version id the model has transitioned to.
	 */
	readonly versionId: number;
	/**
	 * Flag that indicates that this event was generated while undoing.
	 */
	readonly isUndoing: boolean;
	/**
	 * Flag that indicates that this event was generated while redoing.
	 */
	readonly isRedoing: boolean;
	/**
	 * Flag that indicates that all decorations were lost with this edit.
	 * The model has been reset to a new value.
	 */
	readonly isFlush: boolean;

	/**
	 * Flag that indicates that this event describes an eol change.
	 */
	readonly isEolChange: boolean;

	/**
	 * Detailed reason information for the change
	 * @internal
	 */
	readonly detailedReasons: TextModelEditSource[];

	/**
	 * The sum of these lengths equals changes.length.
	 * The length of this array must equal the length of detailedReasons.
	*/
	readonly detailedReasonsChangeLengths: number[];
}

export interface ISerializedModelContentChangedEvent {
	/**
	 * The changes are ordered from the end of the document to the beginning, so they should be safe to apply in sequence.
	 */
	readonly changes: IModelContentChange[];
	/**
	 * The (new) end-of-line character.
	 */
	readonly eol: string;
	/**
	 * The new version id the model has transitioned to.
	 */
	readonly versionId: number;
	/**
	 * Flag that indicates that this event was generated while undoing.
	 */
	readonly isUndoing: boolean;
	/**
	 * Flag that indicates that this event was generated while redoing.
	 */
	readonly isRedoing: boolean;
	/**
	 * Flag that indicates that all decorations were lost with this edit.
	 * The model has been reset to a new value.
	 */
	readonly isFlush: boolean;

	/**
	 * Flag that indicates that this event describes an eol change.
	 */
	readonly isEolChange: boolean;

	/**
	 * Detailed reason information for the change
	 * @internal
	 */
	readonly detailedReason: Record<string, unknown> | undefined;
}

/**
 * An event describing that model decorations have changed.
 */
export interface IModelDecorationsChangedEvent {
	readonly affectsMinimap: boolean;
	readonly affectsOverviewRuler: boolean;
	readonly affectsGlyphMargin: boolean;
	readonly affectsLineNumber: boolean;
}

/**
 * An event describing that some ranges of lines have been tokenized (their tokens have changed).
 * @internal
 */
export interface IModelTokensChangedEvent {
	readonly semanticTokensApplied: boolean;
	readonly ranges: {
		/**
		 * The start of the range (inclusive)
		 */
		readonly fromLineNumber: number;
		/**
		 * The end of the range (inclusive)
		 */
		readonly toLineNumber: number;
	}[];
}

export interface IModelOptionsChangedEvent {
	readonly tabSize: boolean;
	readonly indentSize: boolean;
	readonly insertSpaces: boolean;
	readonly trimAutoWhitespace: boolean;
}

/**
 * @internal
 */
export const enum RawContentChangedType {
	Flush = 1,
	LineChanged = 2,
	LinesDeleted = 3,
	LinesInserted = 4,
	EOLChanged = 5
}

/**
 * An event describing that a model has been reset to a new value.
 * @internal
 */
export class ModelRawFlush {
	public readonly changeType = RawContentChangedType.Flush;
}

/**
 * Represents text injected on a line
 * @internal
 */
export class LineInjectedText {
	public static applyInjectedText(lineText: string, injectedTexts: LineInjectedText[] | null): string {
		if (!injectedTexts || injectedTexts.length === 0) {
			return lineText;
		}
		let result = '';
		let lastOriginalOffset = 0;
		for (const injectedText of injectedTexts) {
			result += lineText.substring(lastOriginalOffset, injectedText.column - 1);
			lastOriginalOffset = injectedText.column - 1;
			result += injectedText.options.content;
		}
		result += lineText.substring(lastOriginalOffset);
		return result;
	}

	public static fromDecorations(decorations: IModelDecoration[]): LineInjectedText[] {
		const result: LineInjectedText[] = [];
		for (const decoration of decorations) {
			if (decoration.options.before && decoration.options.before.content.length > 0) {
				result.push(new LineInjectedText(
					decoration.ownerId,
					decoration.range.startLineNumber,
					decoration.range.startColumn,
					decoration.options.before,
					0,
				));
			}
			if (decoration.options.after && decoration.options.after.content.length > 0) {
				result.push(new LineInjectedText(
					decoration.ownerId,
					decoration.range.endLineNumber,
					decoration.range.endColumn,
					decoration.options.after,
					1,
				));
			}
		}
		result.sort((a, b) => {
			if (a.lineNumber === b.lineNumber) {
				if (a.column === b.column) {
					return a.order - b.order;
				}
				return a.column - b.column;
			}
			return a.lineNumber - b.lineNumber;
		});
		return result;
	}

	constructor(
		public readonly ownerId: number,
		public readonly lineNumber: number,
		public readonly column: number,
		public readonly options: InjectedTextOptions,
		public readonly order: number
	) { }

	public withText(text: string): LineInjectedText {
		return new LineInjectedText(this.ownerId, this.lineNumber, this.column, { ...this.options, content: text }, this.order);
	}
}

/**
 * An event describing that a line has changed in a model.
 * @internal
 */
export class ModelRawLineChanged {
	public readonly changeType = RawContentChangedType.LineChanged;
	/**
	 * The line number that has changed (before the change was applied).
	 */
	public readonly lineNumber: number;
	/**
	 * The new line number the old one is mapped to (after the change was applied).
	 */
	public readonly newLineNumber: number;

	constructor(lineNumber: number, newLineNumber: number) {
		this.lineNumber = lineNumber;
		this.newLineNumber = newLineNumber;
	}
}


/**
 * An event describing that a line height has changed in the model.
 * @internal
 */
export class ModelLineHeightChanged {
	/**
	 * Editor owner ID
	 */
	public readonly ownerId: number;
	/**
	 * The decoration ID that has changed.
	 */
	public readonly decorationId: string;
	/**
	 * The line that has changed.
	 */
	public readonly lineNumber: number;
	/**
	 * The line height on the line.
	 */
	public readonly lineHeight: number | null;

	constructor(ownerId: number, decorationId: string, lineNumber: number, lineHeight: number | null) {
		this.ownerId = ownerId;
		this.decorationId = decorationId;
		this.lineNumber = lineNumber;
		this.lineHeight = lineHeight;
	}
}

/**
 * An event describing that a line height has changed in the model.
 * @internal
 */
export class ModelFontChanged {
	/**
	 * Editor owner ID
	 */
	public readonly ownerId: number;
	/**
	 * The line that has changed.
	 */
	public readonly lineNumber: number;

	constructor(ownerId: number, lineNumber: number) {
		this.ownerId = ownerId;
		this.lineNumber = lineNumber;
	}
}

/**
 * An event describing that line(s) have been deleted in a model.
 * @internal
 */
export class ModelRawLinesDeleted {
	public readonly changeType = RawContentChangedType.LinesDeleted;
	/**
	 * At what line the deletion began (inclusive).
	 */
	public readonly fromLineNumber: number;
	/**
	 * The count of deleted lines.
	 */
	public readonly count: number;

	/**
	 * At what line the deletion stopped (inclusive).
	 */
	public get toLineNumber(): number {
		return this.fromLineNumber + this.count - 1;
	}

	constructor(fromLineNumber: number, count: number) {
		this.fromLineNumber = fromLineNumber;
		this.count = count;
	}
}

/**
 * An event describing that line(s) have been inserted in a model.
 * @internal
 */
export class ModelRawLinesInserted {
	public readonly changeType = RawContentChangedType.LinesInserted;
	/**
	 * Before what line did the insertion begin
	 */
	public readonly fromLineNumber: number;
	/**
	 * The new from line number of the inserted lines (after the change was applied).
	 */
	public readonly newFromLineNumber: number;
	/**
	 * The count of inserted lines.
	 */
	public readonly count: number;

	/**
	 * `toLineNumber` - `fromLineNumber` + 1 denotes the number of lines that were inserted
	 */
	public get toLineNumber(): number {
		return this.fromLineNumber + this.count - 1;
	}

	constructor(oldFromLineNumber: number, newFromLineNumber: number, count: number) {
		this.fromLineNumber = oldFromLineNumber;
		this.newFromLineNumber = newFromLineNumber;
		this.count = count;
	}
}

/**
 * An event describing that a model has had its EOL changed.
 * @internal
 */
export class ModelRawEOLChanged {
	public readonly changeType = RawContentChangedType.EOLChanged;
}

/**
 * @internal
 */
export type ModelRawChange = ModelRawFlush | ModelRawLineChanged | ModelRawLinesDeleted | ModelRawLinesInserted | ModelRawEOLChanged;

/**
 * An event describing a change in the text of a model.
 * @internal
 */
export class ModelRawContentChangedEvent {

	public readonly changes: ModelRawChange[];
	/**
	 * The new version id the model has transitioned to.
	 */
	public readonly versionId: number;
	/**
	 * Flag that indicates that this event was generated while undoing.
	 */
	public readonly isUndoing: boolean;
	/**
	 * Flag that indicates that this event was generated while redoing.
	 */
	public readonly isRedoing: boolean;

	public resultingSelection: Selection[] | null;

	constructor(changes: ModelRawChange[], versionId: number, isUndoing: boolean, isRedoing: boolean, resultingSelection: Selection[] | null) {
		this.changes = changes;
		this.versionId = versionId;
		this.isUndoing = isUndoing;
		this.isRedoing = isRedoing;
		this.resultingSelection = resultingSelection;
	}

	public containsEvent(type: RawContentChangedType): boolean {
		for (let i = 0, len = this.changes.length; i < len; i++) {
			const change = this.changes[i];
			if (change.changeType === type) {
				return true;
			}
		}
		return false;
	}

	public static merge(a: ModelRawContentChangedEvent, b: ModelRawContentChangedEvent): ModelRawContentChangedEvent {
		const changes = ([] as ModelRawChange[]).concat(a.changes).concat(b.changes);
		const versionId = b.versionId;
		const isUndoing = (a.isUndoing || b.isUndoing);
		const isRedoing = (a.isRedoing || b.isRedoing);
		const selections = [...(a.resultingSelection ?? []), ...(b.resultingSelection ?? [])];
		return new ModelRawContentChangedEvent(changes, versionId, isUndoing, isRedoing, selections);
	}
}

/**
 * An event describing a change in injected text.
 * @internal
 */
export class ModelInjectedTextChangedEvent {

	public readonly changes: ModelRawLineChanged[];

	constructor(changes: ModelRawLineChanged[]) {
		this.changes = changes;
	}
}

/**
 * An event describing a change of a line height.
 * @internal
 */
export class ModelLineHeightChangedEvent {

	public readonly changes: ModelLineHeightChanged[];

	constructor(changes: ModelLineHeightChanged[]) {
		this.changes = changes;
	}

	public affects(rangeOrPosition: IRange | IPosition) {
		if (Range.isIRange(rangeOrPosition)) {
			for (const change of this.changes) {
				if (change.lineNumber >= rangeOrPosition.startLineNumber && change.lineNumber <= rangeOrPosition.endLineNumber) {
					return true;
				}
			}
			return false;
		} else {
			for (const change of this.changes) {
				if (change.lineNumber === rangeOrPosition.lineNumber) {
					return true;
				}
			}
			return false;
		}
	}
}

/**
 * An event describing a change in fonts.
 * @internal
 */
export class ModelFontChangedEvent {

	public readonly changes: ModelFontChanged[];

	constructor(changes: ModelFontChanged[]) {
		this.changes = changes;
	}
}

/**
 * @internal
 */
export class InternalModelContentChangeEvent {
	constructor(
		public readonly rawContentChangedEvent: ModelRawContentChangedEvent,
		public readonly contentChangedEvent: IModelContentChangedEvent,
	) { }

	public merge(other: InternalModelContentChangeEvent): InternalModelContentChangeEvent {
		const rawContentChangedEvent = ModelRawContentChangedEvent.merge(this.rawContentChangedEvent, other.rawContentChangedEvent);
		const contentChangedEvent = InternalModelContentChangeEvent._mergeChangeEvents(this.contentChangedEvent, other.contentChangedEvent);
		return new InternalModelContentChangeEvent(rawContentChangedEvent, contentChangedEvent);
	}

	private static _mergeChangeEvents(a: IModelContentChangedEvent, b: IModelContentChangedEvent): IModelContentChangedEvent {
		const changes = ([] as IModelContentChange[]).concat(a.changes).concat(b.changes);
		const eol = b.eol;
		const versionId = b.versionId;
		const isUndoing = (a.isUndoing || b.isUndoing);
		const isRedoing = (a.isRedoing || b.isRedoing);
		const isFlush = (a.isFlush || b.isFlush);
		const isEolChange = a.isEolChange && b.isEolChange; // both must be true to not confuse listeners who skip such edits
		return {
			changes: changes,
			eol: eol,
			isEolChange: isEolChange,
			versionId: versionId,
			isUndoing: isUndoing,
			isRedoing: isRedoing,
			isFlush: isFlush,
			detailedReasons: a.detailedReasons.concat(b.detailedReasons),
			detailedReasonsChangeLengths: a.detailedReasonsChangeLengths.concat(b.detailedReasonsChangeLengths),
		};
	}
}
