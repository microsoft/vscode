/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { es5ClassCompat } from './es5ClassCompat.js';
import { illegalArgument } from '../../../../base/common/errors.js';

export enum NotebookCellKind {
	Markup = 1,
	Code = 2
}

export class NotebookRange {
	static isNotebookRange(thing: any): thing is vscode.NotebookRange {
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
	metadata?: Record<string, any>;
	executionSummary?: vscode.NotebookCellExecutionSummary;

	constructor(kind: NotebookCellKind, value: string, languageId: string, mime?: string, outputs?: vscode.NotebookCellOutput[], metadata?: Record<string, any>, executionSummary?: vscode.NotebookCellExecutionSummary) {
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
	metadata?: { [key: string]: any };

	constructor(cells: NotebookCellData[]) {
		this.cells = cells;
	}
}

@es5ClassCompat
export class NotebookEdit implements vscode.NotebookEdit {

	static isNotebookCellEdit(thing: any): thing is NotebookEdit {
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

	static updateCellMetadata(index: number, newMetadata: { [key: string]: any }): NotebookEdit {
		const edit = new NotebookEdit(new NotebookRange(index, index), []);
		edit.newCellMetadata = newMetadata;
		return edit;
	}

	static updateNotebookMetadata(newMetadata: { [key: string]: any }): NotebookEdit {
		const edit = new NotebookEdit(new NotebookRange(0, 0), []);
		edit.newNotebookMetadata = newMetadata;
		return edit;
	}

	range: NotebookRange;
	newCells: NotebookCellData[];
	newCellMetadata?: { [key: string]: any };
	newNotebookMetadata?: { [key: string]: any };

	constructor(range: NotebookRange, newCells: NotebookCellData[]) {
		this.range = range;
		this.newCells = newCells;
	}
}
