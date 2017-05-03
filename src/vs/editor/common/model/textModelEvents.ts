/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IRange } from 'vs/editor/common/core/range';

/**
 * @internal
 */
export const TextModelEventType = {
	ModelDispose: 'modelDispose',
	ModelTokensChanged: 'modelTokensChanged',
	ModelLanguageChanged: 'modelLanguageChanged',
	ModelOptionsChanged: 'modelOptionsChanged',
	ModelContentChanged: 'contentChanged',
	ModelRawContentChanged2: 'rawContentChanged2',
	ModelDecorationsChanged: 'decorationsChanged',
};

/**
 * An event describing that the current mode associated with a model has changed.
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
}

export interface IModelContentChange {
	/**
	 * The range that got replaced.
	 */
	readonly range: IRange;
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
	/**
	 * Lists of ids for added decorations.
	 */
	readonly addedDecorations: string[];
	/**
	 * Lists of ids for changed decorations.
	 */
	readonly changedDecorations: string[];
	/**
	 * List of ids for removed decorations.
	 */
	readonly removedDecorations: string[];
}

/**
 * An event describing that some ranges of lines have been tokenized (their tokens have changed).
 */
export interface IModelTokensChangedEvent {
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
	LinesInserted = 4
}

/**
 * An event describing that a model has been reset to a new value.
 * @internal
 */
export class ModelRawFlush {
	public readonly changeType = RawContentChangedType.Flush;
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

	constructor(lineNumber: number, detail: string) {
		this.lineNumber = lineNumber;
		this.detail = detail;
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
	public readonly detail: string;

	constructor(fromLineNumber: number, toLineNumber: number, detail: string) {
		this.fromLineNumber = fromLineNumber;
		this.toLineNumber = toLineNumber;
		this.detail = detail;
	}
}

/**
 * @internal
 */
export type ModelRawChange = ModelRawFlush | ModelRawLineChanged | ModelRawLinesDeleted | ModelRawLinesInserted;

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

	constructor(changes: ModelRawChange[], versionId: number, isUndoing: boolean, isRedoing: boolean) {
		this.changes = changes;
		this.versionId = versionId;
		this.isUndoing = isUndoing;
		this.isRedoing = isRedoing;
	}
}
