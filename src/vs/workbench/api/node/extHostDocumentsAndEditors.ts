/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from 'vs/base/common/event';
import { dispose } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtHostDocumentsAndEditorsShape, IDocumentsAndEditorsDelta, IMainContext, MainContext } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostDocumentData } from 'vs/workbench/api/node/extHostDocumentData';
import { ExtHostTextEditor } from 'vs/workbench/api/node/extHostTextEditor';
import * as typeConverters from 'vs/workbench/api/node/extHostTypeConverters';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';

export class ExtHostDocumentsAndEditors implements ExtHostDocumentsAndEditorsShape {

	private _disposables: Disposable[] = [];

	private _activeEditorId: string;

	private readonly _editors = new Map<string, ExtHostTextEditor>();
	private readonly _documents = new Map<string, ExtHostDocumentData>();

	private readonly _onDidAddDocuments = new Emitter<ExtHostDocumentData[]>();
	private readonly _onDidRemoveDocuments = new Emitter<ExtHostDocumentData[]>();
	private readonly _onDidChangeVisibleTextEditors = new Emitter<ExtHostTextEditor[]>();
	private readonly _onDidChangeActiveTextEditor = new Emitter<ExtHostTextEditor>();

	readonly onDidAddDocuments: Event<ExtHostDocumentData[]> = this._onDidAddDocuments.event;
	readonly onDidRemoveDocuments: Event<ExtHostDocumentData[]> = this._onDidRemoveDocuments.event;
	readonly onDidChangeVisibleTextEditors: Event<ExtHostTextEditor[]> = this._onDidChangeVisibleTextEditors.event;
	readonly onDidChangeActiveTextEditor: Event<ExtHostTextEditor> = this._onDidChangeActiveTextEditor.event;

	constructor(
		private readonly _mainContext: IMainContext,
	) { }

	dispose() {
		this._disposables = dispose(this._disposables);
	}

	$acceptDocumentsAndEditorsDelta(delta: IDocumentsAndEditorsDelta): void {

		const removedDocuments: ExtHostDocumentData[] = [];
		const addedDocuments: ExtHostDocumentData[] = [];
		const removedEditors: ExtHostTextEditor[] = [];

		if (delta.removedDocuments) {
			for (const uriComponent of delta.removedDocuments) {
				const uri = URI.revive(uriComponent);
				const id = uri.toString();
				const data = this._documents.get(id);
				this._documents.delete(id);
				removedDocuments.push(data);
			}
		}

		if (delta.addedDocuments) {
			for (const data of delta.addedDocuments) {
				const resource = URI.revive(data.uri);
				assert.ok(!this._documents.has(resource.toString()), `document '${resource} already exists!'`);

				const documentData = new ExtHostDocumentData(
					this._mainContext.getProxy(MainContext.MainThreadDocuments),
					resource,
					data.lines,
					data.EOL,
					data.modeId,
					data.versionId,
					data.isDirty
				);
				this._documents.set(resource.toString(), documentData);
				addedDocuments.push(documentData);
			}
		}

		if (delta.removedEditors) {
			for (const id of delta.removedEditors) {
				const editor = this._editors.get(id);
				this._editors.delete(id);
				removedEditors.push(editor);
			}
		}

		if (delta.addedEditors) {
			for (const data of delta.addedEditors) {
				const resource = URI.revive(data.documentUri);
				assert.ok(this._documents.has(resource.toString()), `document '${resource}' does not exist`);
				assert.ok(!this._editors.has(data.id), `editor '${data.id}' already exists!`);

				const documentData = this._documents.get(resource.toString());
				const editor = new ExtHostTextEditor(
					this._mainContext.getProxy(MainContext.MainThreadTextEditors),
					data.id,
					documentData,
					data.selections.map(typeConverters.Selection.to),
					data.options,
					data.visibleRanges.map(typeConverters.Range.to),
					typeConverters.ViewColumn.to(data.editorPosition)
				);
				this._editors.set(data.id, editor);
			}
		}

		if (delta.newActiveEditor !== undefined) {
			assert.ok(delta.newActiveEditor === null || this._editors.has(delta.newActiveEditor), `active editor '${delta.newActiveEditor}' does not exist`);
			this._activeEditorId = delta.newActiveEditor;
		}

		dispose(removedDocuments);
		dispose(removedEditors);

		// now that the internal state is complete, fire events
		if (delta.removedDocuments) {
			this._onDidRemoveDocuments.fire(removedDocuments);
		}
		if (delta.addedDocuments) {
			this._onDidAddDocuments.fire(addedDocuments);
		}

		if (delta.removedEditors || delta.addedEditors) {
			this._onDidChangeVisibleTextEditors.fire(this.allEditors());
		}
		if (delta.newActiveEditor !== undefined) {
			this._onDidChangeActiveTextEditor.fire(this.activeEditor());
		}
	}

	getDocument(strUrl: string): ExtHostDocumentData {
		return this._documents.get(strUrl);
	}

	allDocuments(): ExtHostDocumentData[] {
		const result: ExtHostDocumentData[] = [];
		this._documents.forEach(data => result.push(data));
		return result;
	}

	getEditor(id: string): ExtHostTextEditor {
		return this._editors.get(id);
	}

	activeEditor(): ExtHostTextEditor | undefined {
		if (!this._activeEditorId) {
			return undefined;
		} else {
			return this._editors.get(this._activeEditorId);
		}
	}

	allEditors(): ExtHostTextEditor[] {
		const result: ExtHostTextEditor[] = [];
		this._editors.forEach(data => result.push(data));
		return result;
	}
}
