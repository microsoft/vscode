/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from 'vs/base/common/errorMessage';
import { IReference, dispose, Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ITextModel, shouldSynchronizeModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IFileService, FileOperation } from 'vs/platform/files/common/files';
import { ExtHostContext, ExtHostDocumentsShape, MainThreadDocumentsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { toLocalResource, extUri, IExtUri } from 'vs/base/common/resources';
import { IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { Emitter, Event } from 'vs/base/common/event';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { ResourceMap } from 'vs/base/common/map';
import { IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ErrorNoTelemetry } from 'vs/base/common/errors';

export class BoundModelReferenceCollection {

	private _data = new Array<{ uri: URI; length: number; dispose(): void }>();
	private _length = 0;

	constructor(
		private readonly _extUri: IExtUri,
		private readonly _maxAge: number = 1000 * 60 * 3, // auto-dispse by age
		private readonly _maxLength: number = 1024 * 1024 * 80, // auto-dispose by total length
		private readonly _maxSize: number = 50 // auto-dispose by number of references
	) {
		//
	}

	dispose(): void {
		this._data = dispose(this._data);
	}

	remove(uri: URI): void {
		for (const entry of [...this._data] /* copy array because dispose will modify it */) {
			if (this._extUri.isEqualOrParent(entry.uri, uri)) {
				entry.dispose();
			}
		}
	}

	add(uri: URI, ref: IReference<any>, length: number = 0): void {
		// const length = ref.object.textEditorModel.getValueLength();
		const dispose = () => {
			const idx = this._data.indexOf(entry);
			if (idx >= 0) {
				this._length -= length;
				ref.dispose();
				clearTimeout(handle);
				this._data.splice(idx, 1);
			}
		};
		const handle = setTimeout(dispose, this._maxAge);
		const entry = { uri, length, dispose };

		this._data.push(entry);
		this._length += length;
		this._cleanup();
	}

	private _cleanup(): void {
		// clean-up wrt total length
		while (this._length > this._maxLength) {
			this._data[0].dispose();
		}
		// clean-up wrt number of documents
		const extraSize = Math.ceil(this._maxSize * 1.2);
		if (this._data.length >= extraSize) {
			dispose(this._data.slice(0, extraSize - this._maxSize));
		}
	}
}

class ModelTracker extends Disposable {

	private _knownVersionId: number;

	constructor(
		private readonly _model: ITextModel,
		private readonly _onIsCaughtUpWithContentChanges: Emitter<URI>,
		private readonly _proxy: ExtHostDocumentsShape,
		private readonly _textFileService: ITextFileService,
	) {
		super();
		this._knownVersionId = this._model.getVersionId();
		this._store.add(this._model.onDidChangeContent((e) => {
			this._knownVersionId = e.versionId;
			this._proxy.$acceptModelChanged(this._model.uri, e, this._textFileService.isDirty(this._model.uri));
			if (this.isCaughtUpWithContentChanges()) {
				this._onIsCaughtUpWithContentChanges.fire(this._model.uri);
			}
		}));
	}

	isCaughtUpWithContentChanges(): boolean {
		return (this._model.getVersionId() === this._knownVersionId);
	}
}

export class MainThreadDocuments extends Disposable implements MainThreadDocumentsShape {

	private _onIsCaughtUpWithContentChanges = this._store.add(new Emitter<URI>());
	readonly onIsCaughtUpWithContentChanges = this._onIsCaughtUpWithContentChanges.event;

	private readonly _proxy: ExtHostDocumentsShape;
	private readonly _modelTrackers = new ResourceMap<ModelTracker>();
	private readonly _modelReferenceCollection: BoundModelReferenceCollection;

	constructor(
		extHostContext: IExtHostContext,
		@IModelService private readonly _modelService: IModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IFileService private readonly _fileService: IFileService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IWorkingCopyFileService workingCopyFileService: IWorkingCopyFileService,
		@IPathService private readonly _pathService: IPathService
	) {
		super();

		this._modelReferenceCollection = this._store.add(new BoundModelReferenceCollection(_uriIdentityService.extUri));

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDocuments);

		this._store.add(_modelService.onModelLanguageChanged(this._onModelModeChanged, this));

		this._store.add(_textFileService.files.onDidSave(e => {
			if (this._shouldHandleFileEvent(e.model.resource)) {
				this._proxy.$acceptModelSaved(e.model.resource);
			}
		}));
		this._store.add(_textFileService.files.onDidChangeDirty(m => {
			if (this._shouldHandleFileEvent(m.resource)) {
				this._proxy.$acceptDirtyStateChanged(m.resource, m.isDirty());
			}
		}));

		this._store.add(workingCopyFileService.onDidRunWorkingCopyFileOperation(e => {
			const isMove = e.operation === FileOperation.MOVE;
			if (isMove || e.operation === FileOperation.DELETE) {
				for (const pair of e.files) {
					const removed = isMove ? pair.source : pair.target;
					if (removed) {
						this._modelReferenceCollection.remove(removed);
					}
				}
			}
		}));
	}

	override dispose(): void {
		dispose(this._modelTrackers.values());
		this._modelTrackers.clear();
		super.dispose();
	}

	isCaughtUpWithContentChanges(resource: URI): boolean {
		const tracker = this._modelTrackers.get(resource);
		if (tracker) {
			return tracker.isCaughtUpWithContentChanges();
		}
		return true;
	}

	private _shouldHandleFileEvent(resource: URI): boolean {
		const model = this._modelService.getModel(resource);
		return !!model && shouldSynchronizeModel(model);
	}

	handleModelAdded(model: ITextModel): void {
		// Same filter as in mainThreadEditorsTracker
		if (!shouldSynchronizeModel(model)) {
			// don't synchronize too large models
			return;
		}
		this._modelTrackers.set(model.uri, new ModelTracker(model, this._onIsCaughtUpWithContentChanges, this._proxy, this._textFileService));
	}

	private _onModelModeChanged(event: { model: ITextModel; oldLanguageId: string }): void {
		const { model } = event;
		if (!this._modelTrackers.has(model.uri)) {
			return;
		}
		this._proxy.$acceptModelLanguageChanged(model.uri, model.getLanguageId());
	}

	handleModelRemoved(modelUrl: URI): void {
		if (!this._modelTrackers.has(modelUrl)) {
			return;
		}
		this._modelTrackers.get(modelUrl)!.dispose();
		this._modelTrackers.delete(modelUrl);
	}

	// --- from extension host process

	async $trySaveDocument(uri: UriComponents): Promise<boolean> {
		const target = await this._textFileService.save(URI.revive(uri));
		return Boolean(target);
	}

	async $tryOpenDocument(uriData: UriComponents): Promise<URI> {
		const inputUri = URI.revive(uriData);
		if (!inputUri.scheme || !(inputUri.fsPath || inputUri.authority)) {
			throw new ErrorNoTelemetry(`Invalid uri. Scheme and authority or path must be set.`);
		}

		const canonicalUri = this._uriIdentityService.asCanonicalUri(inputUri);

		let promise: Promise<URI>;
		switch (canonicalUri.scheme) {
			case Schemas.untitled:
				promise = this._handleUntitledScheme(canonicalUri);
				break;
			case Schemas.file:
			default:
				promise = this._handleAsResourceInput(canonicalUri);
				break;
		}

		let documentUri: URI | undefined;
		try {
			documentUri = await promise;
		} catch (err) {
			throw new ErrorNoTelemetry(`cannot open ${canonicalUri.toString()}. Detail: ${toErrorMessage(err)}`);
		}
		if (!documentUri) {
			throw new ErrorNoTelemetry(`cannot open ${canonicalUri.toString()}`);
		} else if (!extUri.isEqual(documentUri, canonicalUri)) {
			throw new ErrorNoTelemetry(`cannot open ${canonicalUri.toString()}. Detail: Actual document opened as ${documentUri.toString()}`);
		} else if (!this._modelTrackers.has(canonicalUri)) {
			throw new ErrorNoTelemetry(`cannot open ${canonicalUri.toString()}. Detail: Files above 50MB cannot be synchronized with extensions.`);
		} else {
			return canonicalUri;
		}
	}

	$tryCreateDocument(options?: { language?: string; content?: string }): Promise<URI> {
		return this._doCreateUntitled(undefined, options ? options.language : undefined, options ? options.content : undefined);
	}

	private async _handleAsResourceInput(uri: URI): Promise<URI> {
		const ref = await this._textModelResolverService.createModelReference(uri);
		this._modelReferenceCollection.add(uri, ref, ref.object.textEditorModel.getValueLength());
		return ref.object.textEditorModel.uri;
	}

	private async _handleUntitledScheme(uri: URI): Promise<URI> {
		const asLocalUri = toLocalResource(uri, this._environmentService.remoteAuthority, this._pathService.defaultUriScheme);
		const exists = await this._fileService.exists(asLocalUri);
		if (exists) {
			// don't create a new file ontop of an existing file
			return Promise.reject(new Error('file already exists'));
		}
		return await this._doCreateUntitled(Boolean(uri.path) ? uri : undefined);
	}

	private async _doCreateUntitled(associatedResource?: URI, languageId?: string, initialValue?: string): Promise<URI> {
		const model = this._textFileService.untitled.create({
			associatedResource,
			languageId,
			initialValue
		});
		const resource = model.resource;
		const ref = await this._textModelResolverService.createModelReference(resource);
		if (!this._modelTrackers.has(resource)) {
			ref.dispose();
			throw new Error(`expected URI ${resource.toString()} to have come to LIFE`);
		}
		this._modelReferenceCollection.add(resource, ref, ref.object.textEditorModel.getValueLength());
		Event.once(model.onDidRevert)(() => this._modelReferenceCollection.remove(resource));
		this._proxy.$acceptDirtyStateChanged(resource, true); // mark as dirty
		return resource;
	}
}
