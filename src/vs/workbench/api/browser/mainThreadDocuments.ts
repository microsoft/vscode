/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from 'vs/base/common/errorMessage';
import { IDisposable, IReference, dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService, shouldSynchronizeModel } from 'vs/editor/common/services/modelService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IFileService } from 'vs/platform/files/common/files';
import { MainThreadDocumentsAndEditors } from 'vs/workbench/api/browser/mainThreadDocumentsAndEditors';
import { ExtHostContext, ExtHostDocumentsShape, IExtHostContext, MainThreadDocumentsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ITextEditorModel } from 'vs/workbench/common/editor';
import { ITextFileService, TextFileModelChangeEvent } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { toLocalResource } from 'vs/base/common/resources';

export class BoundModelReferenceCollection {

	private _data = new Array<{ length: number, dispose(): void }>();
	private _length = 0;

	constructor(
		private readonly _maxAge: number = 1000 * 60 * 3,
		private readonly _maxLength: number = 1024 * 1024 * 80
	) {
		//
	}

	dispose(): void {
		this._data = dispose(this._data);
	}

	add(ref: IReference<ITextEditorModel>): void {
		const length = ref.object.textEditorModel.getValueLength();
		let handle: any;
		let entry: { length: number, dispose(): void };
		const dispose = () => {
			const idx = this._data.indexOf(entry);
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

	private readonly _modelService: IModelService;
	private readonly _textModelResolverService: ITextModelService;
	private readonly _textFileService: ITextFileService;
	private readonly _fileService: IFileService;
	private readonly _untitledEditorService: IUntitledEditorService;
	private readonly _environmentService: IWorkbenchEnvironmentService;

	private readonly _toDispose = new DisposableStore();
	private _modelToDisposeMap: { [modelUrl: string]: IDisposable; };
	private readonly _proxy: ExtHostDocumentsShape;
	private readonly _modelIsSynced = new Set<string>();
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
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		this._modelService = modelService;
		this._textModelResolverService = textModelResolverService;
		this._textFileService = textFileService;
		this._fileService = fileService;
		this._untitledEditorService = untitledEditorService;
		this._environmentService = environmentService;

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDocuments);

		this._toDispose.add(documentsAndEditors.onDocumentAdd(models => models.forEach(this._onModelAdded, this)));
		this._toDispose.add(documentsAndEditors.onDocumentRemove(urls => urls.forEach(this._onModelRemoved, this)));
		this._toDispose.add(this._modelReferenceCollection);
		this._toDispose.add(modelService.onModelModeChanged(this._onModelModeChanged, this));

		this._toDispose.add(textFileService.models.onModelSaved(e => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy.$acceptModelSaved(e.resource);
			}
		}));
		this._toDispose.add(textFileService.models.onModelReverted(e => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy.$acceptDirtyStateChanged(e.resource, false);
			}
		}));
		this._toDispose.add(textFileService.models.onModelDirty(e => {
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
		this._toDispose.dispose();
	}

	private _shouldHandleFileEvent(e: TextFileModelChangeEvent): boolean {
		const model = this._modelService.getModel(e.resource);
		return !!model && shouldSynchronizeModel(model);
	}

	private _onModelAdded(model: ITextModel): void {
		// Same filter as in mainThreadEditorsTracker
		if (!shouldSynchronizeModel(model)) {
			// don't synchronize too large models
			return;
		}
		const modelUrl = model.uri;
		this._modelIsSynced.add(modelUrl.toString());
		this._modelToDisposeMap[modelUrl.toString()] = model.onDidChangeContent((e) => {
			this._proxy.$acceptModelChanged(modelUrl, e, this._textFileService.isDirty(modelUrl));
		});
	}

	private _onModelModeChanged(event: { model: ITextModel; oldModeId: string; }): void {
		let { model, oldModeId } = event;
		const modelUrl = model.uri;
		if (!this._modelIsSynced.has(modelUrl.toString())) {
			return;
		}
		this._proxy.$acceptModelModeChanged(model.uri, oldModeId, model.getLanguageIdentifier().language);
	}

	private _onModelRemoved(modelUrl: URI): void {
		const strModelUrl = modelUrl.toString();
		if (!this._modelIsSynced.has(strModelUrl)) {
			return;
		}
		this._modelIsSynced.delete(strModelUrl);
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
			} else if (!this._modelIsSynced.has(uri.toString())) {
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
		const asLocalUri = toLocalResource(uri, this._environmentService.configuration.remoteAuthority);
		return this._fileService.resolve(asLocalUri).then(stats => {
			// don't create a new file ontop of an existing file
			return Promise.reject(new Error('file already exists'));
		}, err => {
			return this._doCreateUntitled(uri).then(resource => !!resource);
		});
	}

	private _doCreateUntitled(resource?: URI, mode?: string, initialValue?: string): Promise<URI> {
		return this._untitledEditorService.loadOrCreate({
			resource,
			mode,
			initialValue,
			useResourcePath: Boolean(resource && resource.path)
		}).then(model => {
			const resource = model.getResource();

			if (!this._modelIsSynced.has(resource.toString())) {
				throw new Error(`expected URI ${resource.toString()} to have come to LIFE`);
			}

			this._proxy.$acceptDirtyStateChanged(resource, true); // mark as dirty

			return resource;
		});
	}
}
