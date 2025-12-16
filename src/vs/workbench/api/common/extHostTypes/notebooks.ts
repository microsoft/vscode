/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { es5ClassCompat } from './es5ClassCompat.js';
import { illegalArgument } from '../../../../base/common/errors.js';
import { Mimes, normalizeMimeType, isTextStreamMime } from '../../../../base/common/mime.js';
import { generateUuid } from '../../../../base/common/uuid.js';

/* eslint-disable local/code-no-native-private */

export enum NotebookCellKind {
	Markup = 1,
	Code = 2
}

export class NotebookRange {
	static isNotebookRange(thing: unknown): thing is vscode.NotebookRange {
		if (thing instanceof NotebookRange) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return typeof (<NotebookRange>thing).start === 'number'
			&& typeof (<NotebookRange>thing).end === 'number';
	}

	private _start: number;
	private _end: number;

	get start() {
		return this._start;
	}

	get end() {
		return this._end;
	}

	get isEmpty(): boolean {
		return this._start === this._end;
	}

	constructor(start: number, end: number) {
		if (start < 0) {
			throw illegalArgument('start must be positive');
		}
		if (end < 0) {
			throw illegalArgument('end must be positive');
		}
		if (start <= end) {
			this._start = start;
			this._end = end;
		} else {
			this._start = end;
			this._end = start;
		}
	}

	with(change: { start?: number; end?: number }): NotebookRange {
		let start = this._start;
		let end = this._end;

		if (change.start !== undefined) {
			start = change.start;
		}
		if (change.end !== undefined) {
			end = change.end;
		}
		if (start === this._start && end === this._end) {
			return this;
		}
		return new NotebookRange(start, end);
	}
}

export class NotebookCellData {

	static validate(data: NotebookCellData): void {
		if (typeof data.kind !== 'number') {
			throw new Error('NotebookCellData MUST have \'kind\' property');
		}
		if (typeof data.value !== 'string') {
			throw new Error('NotebookCellData MUST have \'value\' property');
		}
		if (typeof data.languageId !== 'string') {
			throw new Error('NotebookCellData MUST have \'languageId\' property');
		}
	}

	static isNotebookCellDataArray(value: unknown): value is vscode.NotebookCellData[] {
		return Array.isArray(value) && (<unknown[]>value).every(elem => NotebookCellData.isNotebookCellData(elem));
	}

	static isNotebookCellData(value: unknown): value is vscode.NotebookCellData {
		// return value instanceof NotebookCellData;
		return true;
	}

	kind: NotebookCellKind;
	value: string;
	languageId: string;
	mime?: string;
	outputs?: vscode.NotebookCellOutput[];
	metadata?: Record<string, unknown>;
	executionSummary?: vscode.NotebookCellExecutionSummary;

	constructor(kind: NotebookCellKind, value: string, languageId: string, mime?: string, outputs?: vscode.NotebookCellOutput[], metadata?: Record<string, unknown>, executionSummary?: vscode.NotebookCellExecutionSummary) {
		this.kind = kind;
		this.value = value;
		this.languageId = languageId;
		this.mime = mime;
		this.outputs = outputs ?? [];
		this.metadata = metadata;
		this.executionSummary = executionSummary;

		NotebookCellData.validate(this);
	}
}

export class NotebookData {

	cells: NotebookCellData[];
	metadata?: { [key: string]: unknown };

	constructor(cells: NotebookCellData[]) {
		this.cells = cells;
	}
}

@es5ClassCompat
export class NotebookEdit implements vscode.NotebookEdit {

	static isNotebookCellEdit(thing: unknown): thing is NotebookEdit {
		if (thing instanceof NotebookEdit) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return NotebookRange.isNotebookRange((<NotebookEdit>thing))
			&& Array.isArray((<NotebookEdit>thing).newCells);
	}

	static replaceCells(range: NotebookRange, newCells: NotebookCellData[]): NotebookEdit {
		return new NotebookEdit(range, newCells);
	}

	static insertCells(index: number, newCells: vscode.NotebookCellData[]): vscode.NotebookEdit {
		return new NotebookEdit(new NotebookRange(index, index), newCells);
	}

	static deleteCells(range: NotebookRange): NotebookEdit {
		return new NotebookEdit(range, []);
	}

	static updateCellMetadata(index: number, newMetadata: { [key: string]: unknown }): NotebookEdit {
		const edit = new NotebookEdit(new NotebookRange(index, index), []);
		edit.newCellMetadata = newMetadata;
		return edit;
	}

	static updateNotebookMetadata(newMetadata: { [key: string]: unknown }): NotebookEdit {
		const edit = new NotebookEdit(new NotebookRange(0, 0), []);
		edit.newNotebookMetadata = newMetadata;
		return edit;
	}

	range: NotebookRange;
	newCells: NotebookCellData[];
	newCellMetadata?: { [key: string]: unknown };
	newNotebookMetadata?: { [key: string]: unknown };

	constructor(range: NotebookRange, newCells: NotebookCellData[]) {
		this.range = range;
		this.newCells = newCells;
	}
}

export class NotebookCellOutputItem {

	static isNotebookCellOutputItem(obj: unknown): obj is vscode.NotebookCellOutputItem {
		if (obj instanceof NotebookCellOutputItem) {
			return true;
		}
		if (!obj) {
			return false;
		}
		return typeof (<vscode.NotebookCellOutputItem>obj).mime === 'string'
			&& (<vscode.NotebookCellOutputItem>obj).data instanceof Uint8Array;
	}

	static error(err: Error | { name: string; message?: string; stack?: string }): NotebookCellOutputItem {
		const obj = {
			name: err.name,
			message: err.message,
			stack: err.stack
		};
		return NotebookCellOutputItem.json(obj, 'application/vnd.code.notebook.error');
	}

	static stdout(value: string): NotebookCellOutputItem {
		return NotebookCellOutputItem.text(value, 'application/vnd.code.notebook.stdout');
	}

	static stderr(value: string): NotebookCellOutputItem {
		return NotebookCellOutputItem.text(value, 'application/vnd.code.notebook.stderr');
	}

	static bytes(value: Uint8Array, mime: string = 'application/octet-stream'): NotebookCellOutputItem {
		return new NotebookCellOutputItem(value, mime);
	}

	static #encoder = new TextEncoder();

	static text(value: string, mime: string = Mimes.text): NotebookCellOutputItem {
		const bytes = NotebookCellOutputItem.#encoder.encode(String(value));
		return new NotebookCellOutputItem(bytes, mime);
	}

	static json(value: unknown, mime: string = 'text/x-json'): NotebookCellOutputItem {
		const rawStr = JSON.stringify(value, undefined, '\t');
		return NotebookCellOutputItem.text(rawStr, mime);
	}

	constructor(
		public data: Uint8Array,
		public mime: string
	) {
		const mimeNormalized = normalizeMimeType(mime, true);
		if (!mimeNormalized) {
			throw new Error(`INVALID mime type: ${mime}. Must be in the format "type/subtype[;optionalparameter]"`);
		}
		this.mime = mimeNormalized;
	}
}

export class NotebookCellOutput {

	static isNotebookCellOutput(candidate: unknown): candidate is vscode.NotebookCellOutput {
		if (candidate instanceof NotebookCellOutput) {
			return true;
		}
		if (!candidate || typeof candidate !== 'object') {
			return false;
		}
		return typeof (<NotebookCellOutput>candidate).id === 'string' && Array.isArray((<NotebookCellOutput>candidate).items);
	}

	static ensureUniqueMimeTypes(items: NotebookCellOutputItem[], warn: boolean = false): NotebookCellOutputItem[] {
		const seen = new Set<string>();
		const removeIdx = new Set<number>();
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const normalMime = normalizeMimeType(item.mime);
			// We can have multiple text stream mime types in the same output.
			if (!seen.has(normalMime) || isTextStreamMime(normalMime)) {
				seen.add(normalMime);
				continue;
			}
			// duplicated mime types... first has won
			removeIdx.add(i);
			if (warn) {
				console.warn(`DUPLICATED mime type '${item.mime}' will be dropped`);
			}
		}
		if (removeIdx.size === 0) {
			return items;
		}
		return items.filter((_item, index) => !removeIdx.has(index));
	}

	id: string;
	items: NotebookCellOutputItem[];
	metadata?: Record<string, unknown>;

	constructor(
		items: NotebookCellOutputItem[],
		idOrMetadata?: string | Record<string, unknown>,
		metadata?: Record<string, unknown>
	) {
		this.items = NotebookCellOutput.ensureUniqueMimeTypes(items, true);
		if (typeof idOrMetadata === 'string') {
			this.id = idOrMetadata;
			this.metadata = metadata;
		} else {
			this.id = generateUuid();
			this.metadata = idOrMetadata ?? metadata;
		}
	}
}
