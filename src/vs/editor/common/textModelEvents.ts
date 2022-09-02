/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IModelDecoration, InjectedTextOptions } from 'vs/editor/common/model';

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

export interface IModelContentChange {
	/**
	 * The range that got replaced.
	 */
	readonly range: IRange;
	/**
	 * The offset of the range that got replaced.
	 */
	readonly rangeOffset: number;
	/**
	 * The length of the range that got replaced.
	 */
	readonly rangeLength: number;
	/**
	 * The new text for the range.
	 */
	readonly text: string;
}

/**
 * An event describing a change in the text of a model.
 */
export interface IModelContentChangedEvent {
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
}

/**
 * An event describing that model decorations have changed.
 */
export interface IModelDecorationsChangedEvent {
	readonly affectsMinimap: boolean;
	readonly affectsOverviewRuler: boolean;
}

/**
 * An event describing that some ranges of lines have been tokenized (their tokens have changed).
 * @internal
 */
export interface IModelTokensChangedEvent {
	readonly tokenizationSupportChanged: boolean;
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
	 * The line that has changed.
	 */
	public readonly lineNumber: number;
	/**
	 * The new value of the line.
	 */
	public readonly detail: string;
	/**
	 * The injected text on the line.
	 */
	public readonly injectedText: LineInjectedText[] | null;

	constructor(lineNumber: number, detail: string, injectedText: LineInjectedText[] | null) {
		this.lineNumber = lineNumber;
		this.detail = detail;
		this.injectedText = injectedText;
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
	 * At what line the deletion stopped (inclusive).
	 */
	public readonly toLineNumber: number;

	constructor(fromLineNumber: number, toLineNumber: number) {
		this.fromLineNumber = fromLineNumber;
		this.toLineNumber = toLineNumber;
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
	 * `toLineNumber` - `fromLineNumber` + 1 denotes the number of lines that were inserted
	 */
	public readonly toLineNumber: number;
	/**
	 * The text that was inserted
	 */
	public readonly detail: string[];
	/**
	 * The injected texts for every inserted line.
	 */
	public readonly injectedTexts: (LineInjectedText[] | null)[];

	constructor(fromLineNumber: number, toLineNumber: number, detail: string[], injectedTexts: (LineInjectedText[] | null)[]) {
		this.injectedTexts = injectedTexts;
		this.fromLineNumber = fromLineNumber;
		this.toLineNumber = toLineNumber;
		this.detail = detail;
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

	constructor(changes: ModelRawChange[], versionId: number, isUndoing: boolean, isRedoing: boolean) {
		this.changes = changes;
		this.versionId = versionId;
		this.isUndoing = isUndoing;
		this.isRedoing = isRedoing;
		this.resultingSelection = null;
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
		return new ModelRawContentChangedEvent(changes, versionId, isUndoing, isRedoing);
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
		return {
			changes: changes,
			eol: eol,
			versionId: versionId,
			isUndoing: isUndoing,
			isRedoing: isRedoing,
			isFlush: isFlush
		};
	}
}
