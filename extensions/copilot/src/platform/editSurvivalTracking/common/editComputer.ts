/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { BugIndicatingError } from '../../../util/vs/base/common/errors';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { StringEdit } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { IDiffService } from '../../diff/common/diffService';
import { stringEditFromDiff, stringEditFromTextContentChange } from '../../editing/common/edit';
import { IWorkspaceService } from '../../workspace/common/workspaceService';

export class EditComputer extends Disposable {
	private readonly _baseDocumentText = this._document.getText();
	/**
	 * ```
	 * _baseText
	 * ----diffEdits---->
	 * _baseDocumentText
	 * ----_editsOnTop---->
	 * _document.getText()
	 * ```
	*/
	private _editsOnTop: StringEdit = StringEdit.empty;

	constructor(
		private readonly _baseText: string,
		private readonly _document: vscode.TextDocument,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IDiffService private readonly _diffService: IDiffService,
	) {
		super();

		this._register(this._workspaceService.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() !== this._document.uri.toString()) {
				return;
			}
			const edits = stringEditFromTextContentChange(e.contentChanges);
			this._editsOnTop = this._editsOnTop.compose(edits);
		}));
	}

	async compute(): Promise<ISyncEditProvider> {
		const diffEdits = await stringEditFromDiff(this._baseText, this._baseDocumentText, this._diffService);
		return {
			document: this._document,
			baseText: this._baseText,
			getEditsSinceInitial: () => {
				if (this._store.isDisposed) {
					throw new BugIndicatingError('EditComputer has been disposed');
				}
				return diffEdits.compose(this._editsOnTop);
			}
		};
	}
}

export interface ISyncEditProvider {
	readonly baseText: string;
	readonly document: vscode.TextDocument;
	/**
	 * ```
	 * baseText ----getEditsSinceInitial()----> document.getText()
	 * ```
	*/
	getEditsSinceInitial(): StringEdit;
}

export class DocumentEditRecorder extends Disposable {
	private _edits: StringEdit = StringEdit.empty;

	public readonly initialTextVersion = this.textDocument.version;

	constructor(
		public readonly textDocument: vscode.TextDocument,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
		super();

		this._register(this._workspaceService.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === this.textDocument.uri.toString()) {
				const edits = stringEditFromTextContentChange(e.contentChanges);
				this._edits = this._edits.compose(edits);
			}
		}));
	}

	/**
	 * ```
	 * this.initialTextVersion
	 * ----this.getEdits()---->
	 * this.textDocument.version
	 * ```
	*/
	getEdits(): StringEdit {
		if (this._store.isDisposed) {
			throw new BugIndicatingError('DocumentEditRecorder has been disposed');
		}
		return this._edits;
	}
}
