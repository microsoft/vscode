/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { coalesceInPlace } from '../../../../base/common/arrays.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { CellEditType, ICellMetadataEdit, IDocumentMetadataEdit } from '../../../contrib/notebook/common/notebookCommon.js';
import { NotebookEdit } from './notebooks.js';
import { SnippetTextEdit } from './snippetTextEdit.js';
import { es5ClassCompat } from './es5ClassCompat.js';
import { Position } from './position.js';
import { Range } from './range.js';
import { TextEdit } from './textEdit.js';

export interface IFileOperationOptions {
	readonly overwrite?: boolean;
	readonly ignoreIfExists?: boolean;
	readonly ignoreIfNotExists?: boolean;
	readonly recursive?: boolean;
	readonly contents?: Uint8Array | vscode.DataTransferFile;
}

export const enum FileEditType {
	File = 1,
	Text = 2,
	Cell = 3,
	CellReplace = 5,
	Snippet = 6,
}

export interface IFileOperation {
	readonly _type: FileEditType.File;
	readonly from?: URI;
	readonly to?: URI;
	readonly options?: IFileOperationOptions;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
}

export interface IFileTextEdit {
	readonly _type: FileEditType.Text;
	readonly uri: URI;
	readonly edit: TextEdit;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
}

export interface IFileSnippetTextEdit {
	readonly _type: FileEditType.Snippet;
	readonly uri: URI;
	readonly range: vscode.Range;
	readonly edit: vscode.SnippetString;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
	readonly keepWhitespace?: boolean;
}

export interface IFileCellEdit {
	readonly _type: FileEditType.Cell;
	readonly uri: URI;
	readonly edit?: ICellMetadataEdit | IDocumentMetadataEdit;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
}

export interface ICellEdit {
	readonly _type: FileEditType.CellReplace;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
	readonly uri: URI;
	readonly index: number;
	readonly count: number;
	readonly cells: vscode.NotebookCellData[];
}

export type WorkspaceEditEntry = IFileOperation | IFileTextEdit | IFileSnippetTextEdit | IFileCellEdit | ICellEdit;

@es5ClassCompat
export class WorkspaceEdit implements vscode.WorkspaceEdit {

	private readonly _edits: WorkspaceEditEntry[] = [];


	_allEntries(): ReadonlyArray<WorkspaceEditEntry> {
		return this._edits;
	}

	// --- file
	renameFile(from: vscode.Uri, to: vscode.Uri, options?: { readonly overwrite?: boolean; readonly ignoreIfExists?: boolean }, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.File, from, to, options, metadata });
	}

	createFile(uri: vscode.Uri, options?: { readonly overwrite?: boolean; readonly ignoreIfExists?: boolean; readonly contents?: Uint8Array | vscode.DataTransferFile }, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.File, from: undefined, to: uri, options, metadata });
	}

	deleteFile(uri: vscode.Uri, options?: { readonly recursive?: boolean; readonly ignoreIfNotExists?: boolean }, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.File, from: uri, to: undefined, options, metadata });
	}

	// --- notebook
	private replaceNotebookMetadata(uri: URI, value: Record<string, unknown>, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.Cell, metadata, uri, edit: { editType: CellEditType.DocumentMetadata, metadata: value } });
	}

	private replaceNotebookCells(uri: URI, startOrRange: vscode.NotebookRange, cellData: vscode.NotebookCellData[], metadata?: vscode.WorkspaceEditEntryMetadata): void {
		const start = startOrRange.start;
		const end = startOrRange.end;

		if (start !== end || cellData.length > 0) {
			this._edits.push({ _type: FileEditType.CellReplace, uri, index: start, count: end - start, cells: cellData, metadata });
		}
	}

	private replaceNotebookCellMetadata(uri: URI, index: number, cellMetadata: Record<string, unknown>, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.Cell, metadata, uri, edit: { editType: CellEditType.Metadata, index, metadata: cellMetadata } });
	}

	// --- text
	replace(uri: URI, range: Range, newText: string, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.Text, uri, edit: new TextEdit(range, newText), metadata });
	}

	insert(resource: URI, position: Position, newText: string, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this.replace(resource, new Range(position, position), newText, metadata);
	}

	delete(resource: URI, range: Range, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this.replace(resource, range, '', metadata);
	}

	// --- text (Maplike)
	has(uri: URI): boolean {
		return this._edits.some(edit => edit._type === FileEditType.Text && edit.uri.toString() === uri.toString());
	}

	set(uri: URI, edits: ReadonlyArray<TextEdit | SnippetTextEdit>): void;
	set(uri: URI, edits: ReadonlyArray<[TextEdit | SnippetTextEdit, vscode.WorkspaceEditEntryMetadata | undefined]>): void;
	set(uri: URI, edits: readonly NotebookEdit[]): void;
	set(uri: URI, edits: ReadonlyArray<[NotebookEdit, vscode.WorkspaceEditEntryMetadata | undefined]>): void;

	set(uri: URI, edits: null | undefined | ReadonlyArray<TextEdit | SnippetTextEdit | NotebookEdit | [NotebookEdit, vscode.WorkspaceEditEntryMetadata | undefined] | [TextEdit | SnippetTextEdit, vscode.WorkspaceEditEntryMetadata | undefined]>): void {
		if (!edits) {
			// remove all text, snippet, or notebook edits for `uri`
			for (let i = 0; i < this._edits.length; i++) {
				const element = this._edits[i];
				switch (element._type) {
					case FileEditType.Text:
					case FileEditType.Snippet:
					case FileEditType.Cell:
					case FileEditType.CellReplace:
						if (element.uri.toString() === uri.toString()) {
							this._edits[i] = undefined!; // will be coalesced down below
						}
						break;
				}
			}
			coalesceInPlace(this._edits);
		} else {
			// append edit to the end
			for (const editOrTuple of edits) {
				if (!editOrTuple) {
					continue;
				}
				let edit: TextEdit | SnippetTextEdit | NotebookEdit;
				let metadata: vscode.WorkspaceEditEntryMetadata | undefined;
				if (Array.isArray(editOrTuple)) {
					edit = editOrTuple[0];
					metadata = editOrTuple[1];
				} else {
					edit = editOrTuple;
				}
				if (NotebookEdit.isNotebookCellEdit(edit)) {
					if (edit.newCellMetadata) {
						this.replaceNotebookCellMetadata(uri, edit.range.start, edit.newCellMetadata, metadata);
					} else if (edit.newNotebookMetadata) {
						this.replaceNotebookMetadata(uri, edit.newNotebookMetadata, metadata);
					} else {
						this.replaceNotebookCells(uri, edit.range, edit.newCells, metadata);
					}
				} else if (SnippetTextEdit.isSnippetTextEdit(edit)) {
					this._edits.push({ _type: FileEditType.Snippet, uri, range: edit.range, edit: edit.snippet, metadata, keepWhitespace: edit.keepWhitespace });

				} else {
					this._edits.push({ _type: FileEditType.Text, uri, edit, metadata });
				}
			}
		}
	}

	get(uri: URI): TextEdit[] {
		const res: TextEdit[] = [];
		for (const candidate of this._edits) {
			if (candidate._type === FileEditType.Text && candidate.uri.toString() === uri.toString()) {
				res.push(candidate.edit);
			}
		}
		return res;
	}

	entries(): [URI, TextEdit[]][] {
		const textEdits = new ResourceMap<[URI, TextEdit[]]>();
		for (const candidate of this._edits) {
			if (candidate._type === FileEditType.Text) {
				let textEdit = textEdits.get(candidate.uri);
				if (!textEdit) {
					textEdit = [candidate.uri, []];
					textEdits.set(candidate.uri, textEdit);
				}
				textEdit[1].push(candidate.edit);
			}
		}
		return [...textEdits.values()];
	}

	get size(): number {
		return this.entries().length;
	}

	toJSON(): [URI, TextEdit[]][] {
		return this.entries();
	}
}
