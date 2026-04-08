/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { coalesceInPlace } from '../../../vs/base/common/arrays';
import { ResourceMap } from '../../../vs/base/common/map';
import { URI as Uri } from '../../../vs/base/common/uri';
import { Position } from '../../../vs/workbench/api/common/extHostTypes/position';
import { Range } from '../../../vs/workbench/api/common/extHostTypes/range';
import { SnippetString } from '../../../vs/workbench/api/common/extHostTypes/snippetString';
import { SnippetTextEdit } from '../../../vs/workbench/api/common/extHostTypes/snippetTextEdit';
import { TextEdit } from '../../../vs/workbench/api/common/extHostTypes/textEdit';

export interface WorkspaceEditEntryMetadata {
	needsConfirmation: boolean;
	label: string;
	description?: string;
	// iconPath?: Uri | { light: Uri; dark: Uri } | ThemeIcon;
}

export interface IFileOperationOptions {
	readonly overwrite?: boolean;
	readonly ignoreIfExists?: boolean;
	readonly ignoreIfNotExists?: boolean;
	readonly recursive?: boolean;
	readonly contents?: Uint8Array;
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
	readonly from?: Uri;
	readonly to?: Uri;
	readonly options?: IFileOperationOptions;
	readonly metadata?: WorkspaceEditEntryMetadata;
}

export interface IFileTextEdit {
	readonly _type: FileEditType.Text;
	readonly uri: Uri;
	readonly edit: TextEdit;
	readonly metadata?: WorkspaceEditEntryMetadata;
}

export interface IFileSnippetTextEdit {
	readonly _type: FileEditType.Snippet;
	readonly uri: Uri;
	readonly range: Range;
	readonly edit: SnippetString;
	readonly metadata?: WorkspaceEditEntryMetadata;
}

type WorkspaceEditEntry = IFileOperation | IFileTextEdit | IFileSnippetTextEdit;

export class WorkspaceEdit {
	private readonly _edits: WorkspaceEditEntry[] = [];

	_allEntries(): ReadonlyArray<WorkspaceEditEntry> {
		return this._edits;
	}

	// --- file

	renameFile(
		from: Uri,
		to: Uri,
		options?: { readonly overwrite?: boolean; readonly ignoreIfExists?: boolean },
		metadata?: WorkspaceEditEntryMetadata
	): void {
		this._edits.push({ _type: FileEditType.File, from, to, options, metadata });
	}

	createFile(
		uri: Uri,
		options?: { readonly overwrite?: boolean; readonly ignoreIfExists?: boolean; readonly contents?: Uint8Array },
		metadata?: WorkspaceEditEntryMetadata
	): void {
		this._edits.push({ _type: FileEditType.File, from: undefined, to: uri, options, metadata });
	}

	deleteFile(
		uri: Uri,
		options?: { readonly recursive?: boolean; readonly ignoreIfNotExists?: boolean },
		metadata?: WorkspaceEditEntryMetadata
	): void {
		this._edits.push({ _type: FileEditType.File, from: uri, to: undefined, options, metadata });
	}

	// --- text

	replace(uri: Uri, range: Range, newText: string, metadata?: WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.Text, uri, edit: new TextEdit(range, newText), metadata });
	}

	insert(resource: Uri, position: Position, newText: string, metadata?: WorkspaceEditEntryMetadata): void {
		this.replace(resource, new Range(position, position), newText, metadata);
	}

	delete(resource: Uri, range: Range, metadata?: WorkspaceEditEntryMetadata): void {
		this.replace(resource, range, '', metadata);
	}

	// --- text (Maplike)

	has(uri: Uri): boolean {
		return this._edits.some(edit => edit._type === FileEditType.Text && edit.uri.toString() === uri.toString());
	}

	set(uri: Uri, edits: ReadonlyArray<TextEdit | SnippetTextEdit>): void;
	set(uri: Uri, edits: ReadonlyArray<[TextEdit | SnippetTextEdit, WorkspaceEditEntryMetadata]>): void;

	set(
		uri: Uri,
		edits:
			| null
			| undefined
			| ReadonlyArray<TextEdit | SnippetTextEdit | [TextEdit | SnippetTextEdit, WorkspaceEditEntryMetadata]>
	): void {
		if (!edits) {
			// remove all text, snippet, or notebook edits for `uri`
			for (let i = 0; i < this._edits.length; i++) {
				const element = this._edits[i];
				switch (element._type) {
					case FileEditType.Text:
					case FileEditType.Snippet:
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
				let edit: TextEdit | SnippetTextEdit;
				let metadata: WorkspaceEditEntryMetadata | undefined;
				if (Array.isArray(editOrTuple)) {
					edit = editOrTuple[0];
					metadata = editOrTuple[1];
				} else {
					edit = editOrTuple;
				}
				if (SnippetTextEdit.isSnippetTextEdit(edit)) {
					this._edits.push({
						_type: FileEditType.Snippet,
						uri,
						range: edit.range,
						edit: edit.snippet,
						metadata,
					});
				} else {
					this._edits.push({ _type: FileEditType.Text, uri, edit, metadata });
				}
			}
		}
	}

	get(uri: Uri): TextEdit[] {
		const res: TextEdit[] = [];
		for (const candidate of this._edits) {
			if (candidate._type === FileEditType.Text && candidate.uri.toString() === uri.toString()) {
				res.push(candidate.edit);
			}
		}
		return res;
	}

	entries(): [Uri, TextEdit[]][] {
		const textEdits = new ResourceMap<[Uri, TextEdit[]]>();
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

	toJSON(): any {
		return this.entries();
	}
}


/**
 * Represents sources that can cause {@link window.onDidChangeTextEditorSelection selection change events}.
 */
export enum TextEditorSelectionChangeKind {
	/**
	 * Selection changed due to typing in the editor.
	 */
	Keyboard = 1,
	/**
	 * Selection change due to clicking in the editor.
	 */
	Mouse = 2,
	/**
	 * Selection changed because a command ran.
	 */
	Command = 3
}

/**
 * Reasons for why a text document has changed.
 */
export enum TextDocumentChangeReason {
	/** The text change is caused by an undo operation. */
	Undo = 1,

	/** The text change is caused by an redo operation. */
	Redo = 2,
}