/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { dispose } from 'vs/base/common/lifecycle';
import { MainContext, ExtHostDocumentsAndEditorsShape, IDocumentsAndEditorsDelta, IMainContext } from './extHost.protocol';
import { ExtHostDocumentData } from './extHostDocumentData';
import { ExtHostTextEditor, ExtHostTextEditor2 } from './extHostTextEditor';
import * as assert from 'assert';
import * as typeConverters from './extHostTypeConverters';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';

export class ExtHostDocumentsAndEditors implements ExtHostDocumentsAndEditorsShape {

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
		private readonly _extHostExtensions?: ExtHostExtensionService
	) {
	}

	$acceptDocumentsAndEditorsDelta(delta: IDocumentsAndEditorsDelta): void {

		const removedDocuments: ExtHostDocumentData[] = [];
		const addedDocuments: ExtHostDocumentData[] = [];
		const removedEditors: ExtHostTextEditor[] = [];

		if (delta.removedDocuments) {
			for (const id of delta.removedDocuments) {
				const data = this._documents.get(id);
				this._documents.delete(id);
				removedDocuments.push(data);
			}
		}

		if (delta.addedDocuments) {
			for (const data of delta.addedDocuments) {
				assert.ok(!this._documents.has(data.url.toString()), `document '${data.url} already exists!'`);

				const documentData = new ExtHostDocumentData(
					this._mainContext.get(MainContext.MainThreadDocuments),
					data.url,
					data.lines,
					data.EOL,
					data.modeId,
					data.versionId,
					data.isDirty
				);
				this._documents.set(data.url.toString(), documentData);
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
				assert.ok(this._documents.has(data.document.toString()), `document '${data.document}' does not exist`);
				assert.ok(!this._editors.has(data.id), `editor '${data.id}' already exists!`);

				const documentData = this._documents.get(data.document.toString());
				const editor = new ExtHostTextEditor2(
					this._extHostExtensions,
					this._mainContext.get(MainContext.MainThreadTelemetry),
					this._mainContext.get(MainContext.MainThreadEditors),
					data.id,
					documentData,
					data.selections.map(typeConverters.toSelection),
					data.options,
					typeConverters.toViewColumn(data.editorPosition)
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
