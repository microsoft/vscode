/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from 'vs/base/common/errorMessage';
import { IDisposable, IReference, dispose } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService, shouldSynchronizeModel } from 'vs/editor/common/services/modelService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IFileService } from 'vs/platform/files/common/files';
import { MainThreadDocumentsAndEditors } from 'vs/workbench/api/electron-browser/mainThreadDocumentsAndEditors';
import { ExtHostContext, ExtHostDocumentsShape, IExtHostContext, MainThreadDocumentsShape } from 'vs/workbench/api/node/extHost.protocol';
import { ITextEditorModel } from 'vs/workbench/common/editor';
import { ITextFileService, TextFileModelChangeEvent } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';

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
		let handle: any;
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
		this._textModelResolverService = textModelResolverService;
		this._textFileService = textFileService;
		this._fileService = fileService;
		this._untitledEditorService = untitledEditorService;

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDocuments);
		this._modelIsSynced = {};

		this._toDispose = [];
		this._toDispose.push(documentsAndEditors.onDocumentAdd(models => models.forEach(this._onModelAdded, this)));
		this._toDispose.push(documentsAndEditors.onDocumentRemove(urls => urls.forEach(this._onModelRemoved, this)));
		this._toDispose.push(this._modelReferenceCollection);
		this._toDispose.push(modelService.onModelModeChanged(this._onModelModeChanged, this));

		this._toDispose.push(textFileService.models.onModelSaved(e => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy.$acceptModelSaved(e.resource);
			}
		}));
		this._toDispose.push(textFileService.models.onModelReverted(e => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy.$acceptDirtyStateChanged(e.resource, false);
			}
		}));
		this._toDispose.push(textFileService.models.onModelDirty(e => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy.$acceptDirtyStateChanged(e.resource, true);
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
		return model && shouldSynchronizeModel(model);
	}

	private _onModelAdded(model: ITextModel): void {
		// Same filter as in mainThreadEditorsTracker
		if (!shouldSynchronizeModel(model)) {
			// don't synchronize too large models
			return null;
		}
		let modelUrl = model.uri;
		this._modelIsSynced[modelUrl.toString()] = true;
		this._modelToDisposeMap[modelUrl.toString()] = model.onDidChangeContent((e) => {
			this._proxy.$acceptModelChanged(modelUrl, e, this._textFileService.isDirty(modelUrl));
		});
	}

	private _onModelModeChanged(event: { model: ITextModel; oldModeId: string; }): void {
		let { model, oldModeId } = event;
		let modelUrl = model.uri;
		if (!this._modelIsSynced[modelUrl.toString()]) {
			return;
		}
		this._proxy.$acceptModelModeChanged(model.uri, oldModeId, model.getLanguageIdentifier().language);
	}

	private _onModelRemoved(modelUrl: URI): void {
		let strModelUrl = modelUrl.toString();
		if (!this._modelIsSynced[strModelUrl]) {
			return;
		}
		delete this._modelIsSynced[strModelUrl];
		this._modelToDisposeMap[strModelUrl].dispose();
		delete this._modelToDisposeMap[strModelUrl];
	}

	// --- from extension host process

	$trySaveDocument(uri: UriComponents): Promise<boolean> {
		return this._textFileService.save(URI.revive(uri));
	}

	$tryOpenDocument(_uri: UriComponents): Promise<any> {
		const uri = URI.revive(_uri);
		if (!uri.scheme || !(uri.fsPath || uri.authority)) {
			return Promise.reject(new Error(`Invalid uri. Scheme and authority or path must be set.`));
		}

		let promise: Promise<boolean>;
		switch (uri.scheme) {
			case Schemas.untitled:
				promise = this._handleUntitledScheme(uri);
				break;
			case Schemas.file:
			default:
				promise = this._handleAsResourceInput(uri);
				break;
		}

		return promise.then(success => {
			if (!success) {
				return Promise.reject(new Error('cannot open ' + uri.toString()));
			} else if (!this._modelIsSynced[uri.toString()]) {
				return Promise.reject(new Error('cannot open ' + uri.toString() + '. Detail: Files above 50MB cannot be synchronized with extensions.'));
			} else {
				return undefined;
			}
		}, err => {
			return Promise.reject(new Error('cannot open ' + uri.toString() + '. Detail: ' + toErrorMessage(err)));
		});
	}

	$tryCreateDocument(options?: { language?: string, content?: string }): Promise<URI> {
		return this._doCreateUntitled(undefined, options ? options.language : undefined, options ? options.content : undefined);
	}

	private _handleAsResourceInput(uri: URI): Promise<boolean> {
		return this._textModelResolverService.createModelReference(uri).then(ref => {
			this._modelReferenceCollection.add(ref);
			const result = !!ref.object;
			return result;
		});
	}

	private _handleUntitledScheme(uri: URI): Promise<boolean> {
		let asFileUri = uri.with({ scheme: Schemas.file });
		return this._fileService.resolveFile(asFileUri).then(stats => {
			// don't create a new file ontop of an existing file
			return Promise.reject(new Error('file already exists on disk'));
		}, err => {
			return this._doCreateUntitled(uri).then(resource => !!resource);
		});
	}

	private _doCreateUntitled(resource?: URI, modeId?: string, initialValue?: string): Promise<URI> {
		return this._untitledEditorService.loadOrCreate({
			resource,
			modeId,
			initialValue,
			useResourcePath: Boolean(resource && resource.path)
		}).then(model => {
			const resource = model.getResource();

			if (!this._modelIsSynced[resource.toString()]) {
				throw new Error(`expected URI ${resource.toString()} to have come to LIFE`);
			}

			this._proxy.$acceptDirtyStateChanged(resource, true); // mark as dirty

			return resource;
		});
	}
}
