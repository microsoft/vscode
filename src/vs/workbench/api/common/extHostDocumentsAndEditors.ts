/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from '../../../base/common/assert.js';
import * as vscode from 'vscode';
import { Emitter, Event } from '../../../base/common/event.js';
import { dispose } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ExtHostDocumentsAndEditorsShape, IDocumentsAndEditorsDelta, MainContext } from './extHost.protocol.js';
import { ExtHostDocumentData } from './extHostDocumentData.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtHostTextEditor } from './extHostTextEditor.js';
import * as typeConverters from './extHostTypeConverters.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ResourceMap } from '../../../base/common/map.js';
import { Schemas } from '../../../base/common/network.js';
import { Iterable } from '../../../base/common/iterator.js';
import { Lazy } from '../../../base/common/lazy.js';

class Reference<T> {
	private _count = 0;
	constructor(readonly value: T) { }
	ref() {
		this._count++;
	}
	unref() {
		return --this._count === 0;
	}
}

export class ExtHostDocumentsAndEditors implements ExtHostDocumentsAndEditorsShape {

	readonly _serviceBrand: undefined;

	private _activeEditorId: string | null = null;

	private readonly _editors = new Map<string, ExtHostTextEditor>();
	private readonly _documents = new ResourceMap<Reference<ExtHostDocumentData>>();

	private readonly _onDidAddDocuments = new Emitter<readonly ExtHostDocumentData[]>();
	private readonly _onDidRemoveDocuments = new Emitter<readonly ExtHostDocumentData[]>();
	private readonly _onDidChangeVisibleTextEditors = new Emitter<readonly vscode.TextEditor[]>();
	private readonly _onDidChangeActiveTextEditor = new Emitter<vscode.TextEditor | undefined>();

	readonly onDidAddDocuments: Event<readonly ExtHostDocumentData[]> = this._onDidAddDocuments.event;
	readonly onDidRemoveDocuments: Event<readonly ExtHostDocumentData[]> = this._onDidRemoveDocuments.event;
	readonly onDidChangeVisibleTextEditors: Event<readonly vscode.TextEditor[]> = this._onDidChangeVisibleTextEditors.event;
	readonly onDidChangeActiveTextEditor: Event<vscode.TextEditor | undefined> = this._onDidChangeActiveTextEditor.event;

	constructor(
		@IExtHostRpcService private readonly _extHostRpc: IExtHostRpcService,
		@ILogService private readonly _logService: ILogService
	) { }

	$acceptDocumentsAndEditorsDelta(delta: IDocumentsAndEditorsDelta): void {
		this.acceptDocumentsAndEditorsDelta(delta);
	}

	acceptDocumentsAndEditorsDelta(delta: IDocumentsAndEditorsDelta): void {

		const removedDocuments: ExtHostDocumentData[] = [];
		const addedDocuments: ExtHostDocumentData[] = [];
		const removedEditors: ExtHostTextEditor[] = [];

		if (delta.removedDocuments) {
			for (const uriComponent of delta.removedDocuments) {
				const uri = URI.revive(uriComponent);
				const data = this._documents.get(uri);
				if (data?.unref()) {
					this._documents.delete(uri);
					removedDocuments.push(data.value);
				}
			}
		}

		if (delta.addedDocuments) {
			for (const data of delta.addedDocuments) {
				const resource = URI.revive(data.uri);
				let ref = this._documents.get(resource);

				// double check -> only notebook cell documents should be
				// referenced/opened more than once...
				if (ref) {
					if (resource.scheme !== Schemas.vscodeNotebookCell && resource.scheme !== Schemas.vscodeInteractiveInput) {
						throw new Error(`document '${resource} already exists!'`);
					}
				}
				if (!ref) {
					ref = new Reference(new ExtHostDocumentData(
						this._extHostRpc.getProxy(MainContext.MainThreadDocuments),
						resource,
						data.lines,
						data.EOL,
						data.versionId,
						data.languageId,
						data.isDirty,
						data.encoding
					));
					this._documents.set(resource, ref);
					addedDocuments.push(ref.value);
				}

				ref.ref();
			}
		}

		if (delta.removedEditors) {
			for (const id of delta.removedEditors) {
				const editor = this._editors.get(id);
				this._editors.delete(id);
				if (editor) {
					removedEditors.push(editor);
				}
			}
		}

		if (delta.addedEditors) {
			for (const data of delta.addedEditors) {
				const resource = URI.revive(data.documentUri);
				assert.ok(this._documents.has(resource), `document '${resource}' does not exist`);
				assert.ok(!this._editors.has(data.id), `editor '${data.id}' already exists!`);

				const documentData = this._documents.get(resource)!.value;
				const editor = new ExtHostTextEditor(
					data.id,
					this._extHostRpc.getProxy(MainContext.MainThreadTextEditors),
					this._logService,
					new Lazy(() => documentData.document),
					data.selections.map(typeConverters.Selection.to),
					data.options,
					data.visibleRanges.map(range => typeConverters.Range.to(range)),
					typeof data.editorPosition === 'number' ? typeConverters.ViewColumn.to(data.editorPosition) : undefined
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
			this._onDidChangeVisibleTextEditors.fire(this.allEditors().map(editor => editor.value));
		}
		if (delta.newActiveEditor !== undefined) {
			this._onDidChangeActiveTextEditor.fire(this.activeEditor());
		}
	}

	getDocument(uri: URI): ExtHostDocumentData | undefined {
		return this._documents.get(uri)?.value;
	}

	allDocuments(): Iterable<ExtHostDocumentData> {
		return Iterable.map(this._documents.values(), ref => ref.value);
	}

	getEditor(id: string): ExtHostTextEditor | undefined {
		return this._editors.get(id);
	}

	activeEditor(): vscode.TextEditor | undefined;
	activeEditor(internal: true): ExtHostTextEditor | undefined;
	activeEditor(internal?: true): vscode.TextEditor | ExtHostTextEditor | undefined {
		if (!this._activeEditorId) {
			return undefined;
		}
		const editor = this._editors.get(this._activeEditorId);
		if (internal) {
			return editor;
		} else {
			return editor?.value;
		}
	}

	allEditors(): ExtHostTextEditor[] {
		return [...this._editors.values()];
	}
}

export interface IExtHostDocumentsAndEditors extends ExtHostDocumentsAndEditors { }
export const IExtHostDocumentsAndEditors = createDecorator<IExtHostDocumentsAndEditors>('IExtHostDocumentsAndEditors');
