/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IDisposable, dispose, IReference } from 'vs/base/common/lifecycle';
import { TextFileModelChangeEvent, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileService } from 'vs/platform/files/common/files';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ExtHostContext, MainThreadDocumentsShape, ExtHostDocumentsShape, IExtHostContext } from '../node/extHost.protocol';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { MainThreadDocumentsAndEditors } from './mainThreadDocumentsAndEditors';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ITextEditorModel } from 'vs/workbench/common/editor';

export class BoundModelReferenceCollection {

	private _data = new Array<{ length: number, dispose(): void }>();
	private _length = 0;

	constructor(
		private _maxAge: number = 1000 * 60 * 3,
		private _maxLength: number = 1024 * 1024 * 80
	) {
		//
	}

	dispose(): void {
		this._data = dispose(this._data);
	}

	add(ref: IReference<ITextEditorModel>): void {
		let length = ref.object.textEditorModel.getValueLength();
		let handle: number;
		let entry: { length: number, dispose(): void };
		const dispose = () => {
			let idx = this._data.indexOf(entry);
			if (idx >= 0) {
				this._length -= length;
				ref.dispose();
				clearTimeout(handle);
				this._data.splice(idx, 1);
			}
		};
		handle = setTimeout(dispose, this._maxAge);
		entry = { length, dispose };

		this._data.push(entry);
		this._length += length;
		this._cleanup();
	}

	private _cleanup(): void {
		while (this._length > this._maxLength) {
			this._data[0].dispose();
		}
	}
}

export class MainThreadDocuments implements MainThreadDocumentsShape {

	private _modelService: IModelService;
	private _modeService: IModeService;
	private _textModelResolverService: ITextModelService;
	private _textFileService: ITextFileService;
	private _fileService: IFileService;
	private _untitledEditorService: IUntitledEditorService;

	private _toDispose: IDisposable[];
	private _modelToDisposeMap: { [modelUrl: string]: IDisposable; };
	private _proxy: ExtHostDocumentsShape;
	private _modelIsSynced: { [modelId: string]: boolean; };
	private _modelReferenceCollection = new BoundModelReferenceCollection();

	constructor(
		documentsAndEditors: MainThreadDocumentsAndEditors,
		extHostContext: IExtHostContext,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@ITextFileService textFileService: ITextFileService,
		@IFileService fileService: IFileService,
		@ITextModelService textModelResolverService: ITextModelService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
	) {
		this._modelService = modelService;
		this._modeService = modeService;
		this._textModelResolverService = textModelResolverService;
		this._textFileService = textFileService;
		this._fileService = fileService;
		this._untitledEditorService = untitledEditorService;

		this._proxy = extHostContext.get(ExtHostContext.ExtHostDocuments);
		this._modelIsSynced = {};

		this._toDispose = [];
		this._toDispose.push(documentsAndEditors.onDocumentAdd(models => models.forEach(this._onModelAdded, this)));
		this._toDispose.push(documentsAndEditors.onDocumentRemove(urls => urls.forEach(this._onModelRemoved, this)));
		this._toDispose.push(this._modelReferenceCollection);
		this._toDispose.push(modelService.onModelModeChanged(this._onModelModeChanged, this));

		this._toDispose.push(textFileService.models.onModelSaved(e => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy.$acceptModelSaved(e.resource.toString());
			}
		}));
		this._toDispose.push(textFileService.models.onModelReverted(e => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy.$acceptDirtyStateChanged(e.resource.toString(), false);
			}
		}));
		this._toDispose.push(textFileService.models.onModelDirty(e => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy.$acceptDirtyStateChanged(e.resource.toString(), true);
			}
		}));

		this._modelToDisposeMap = Object.create(null);
	}

	public dispose(): void {
		Object.keys(this._modelToDisposeMap).forEach((modelUrl) => {
			this._modelToDisposeMap[modelUrl].dispose();
		});
		this._modelToDisposeMap = Object.create(null);
		this._toDispose = dispose(this._toDispose);
	}

	private _shouldHandleFileEvent(e: TextFileModelChangeEvent): boolean {
		const model = this._modelService.getModel(e.resource);
		return model && !model.isTooLargeForHavingARichMode();
	}

	private _onModelAdded(model: editorCommon.IModel): void {
		// Same filter as in mainThreadEditorsTracker
		if (model.isTooLargeForHavingARichMode()) {
			// don't synchronize too large models
			return null;
		}
		let modelUrl = model.uri;
		this._modelIsSynced[modelUrl.toString()] = true;
		this._modelToDisposeMap[modelUrl.toString()] = model.onDidChangeContent((e) => {
			this._proxy.$acceptModelChanged(modelUrl.toString(), e, this._textFileService.isDirty(modelUrl));
		});
	}

	private _onModelModeChanged(event: { model: editorCommon.IModel; oldModeId: string; }): void {
		let { model, oldModeId } = event;
		let modelUrl = model.uri;
		if (!this._modelIsSynced[modelUrl.toString()]) {
			return;
		}
		this._proxy.$acceptModelModeChanged(model.uri.toString(), oldModeId, model.getLanguageIdentifier().language);
	}

	private _onModelRemoved(modelUrl: string): void {

		if (!this._modelIsSynced[modelUrl]) {
			return;
		}
		delete this._modelIsSynced[modelUrl];
		this._modelToDisposeMap[modelUrl].dispose();
		delete this._modelToDisposeMap[modelUrl];
	}

	// --- from extension host process

	$trySaveDocument(uri: URI): TPromise<boolean> {
		return this._textFileService.save(uri);
	}

	$tryOpenDocument(uri: URI): TPromise<any> {

		if (!uri.scheme || !(uri.fsPath || uri.authority)) {
			return TPromise.wrapError(new Error(`Invalid uri. Scheme and authority or path must be set.`));
		}

		let promise: TPromise<boolean>;
		switch (uri.scheme) {
			case 'untitled':
				promise = this._handleUnititledScheme(uri);
				break;
			case 'file':
			default:
				promise = this._handleAsResourceInput(uri);
				break;
		}

		return promise.then(success => {
			if (!success) {
				return TPromise.wrapError(new Error('cannot open ' + uri.toString()));
			}
			return undefined;
		}, err => {
			return TPromise.wrapError(new Error('cannot open ' + uri.toString() + '. Detail: ' + toErrorMessage(err)));
		});
	}

	$tryCreateDocument(options?: { language?: string, content?: string }): TPromise<URI> {
		return this._doCreateUntitled(void 0, options ? options.language : void 0, options ? options.content : void 0);
	}

	private _handleAsResourceInput(uri: URI): TPromise<boolean> {
		return this._textModelResolverService.createModelReference(uri).then(ref => {
			this._modelReferenceCollection.add(ref);
			const result = !!ref.object;
			return result;
		});
	}

	private _handleUnititledScheme(uri: URI): TPromise<boolean> {
		let asFileUri = uri.with({ scheme: 'file' });
		return this._fileService.resolveFile(asFileUri).then(stats => {
			// don't create a new file ontop of an existing file
			return TPromise.wrapError<boolean>(new Error('file already exists on disk'));
		}, err => this._doCreateUntitled(asFileUri).then(resource => !!resource));
	}

	private _doCreateUntitled(resource?: URI, modeId?: string, initialValue?: string): TPromise<URI> {
		return this._untitledEditorService.loadOrCreate({ resource, modeId, initialValue }).then(model => {
			const resource = model.getResource();

			if (!this._modelIsSynced[resource.toString()]) {
				throw new Error(`expected URI ${resource.toString()} to have come to LIFE`);
			}

			this._proxy.$acceptDirtyStateChanged(resource.toString(), true); // mark as dirty

			return resource;
		});
	}
}
