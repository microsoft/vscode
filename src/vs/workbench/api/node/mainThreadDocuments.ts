/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { toErrorMessage } from 'vs/base/common/errorMessage';
import { EmitterEvent } from 'vs/base/common/eventEmitter';
import { IModelService } from 'vs/editor/common/services/modelService';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import URI from 'vs/base/common/uri';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IEventService } from 'vs/platform/event/common/event';
import { getResource } from 'vs/workbench/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { TextFileModelChangeEvent, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileService } from 'vs/platform/files/common/files';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ExtHostContext, MainThreadDocumentsShape, ExtHostDocumentsShape } from './extHost.protocol';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';

export class MainThreadDocuments extends MainThreadDocumentsShape {
	private _modelService: IModelService;
	private _modeService: IModeService;
	private _textModelResolverService: ITextModelResolverService;
	private _textFileService: ITextFileService;
	private _codeEditorService: ICodeEditorService;
	private _editorService: IWorkbenchEditorService;
	private _fileService: IFileService;
	private _untitledEditorService: IUntitledEditorService;
	private _toDispose: IDisposable[];
	private _modelToDisposeMap: { [modelUrl: string]: IDisposable; };
	private _proxy: ExtHostDocumentsShape;
	private _modelIsSynced: { [modelId: string]: boolean; };
	private _resourceContentProvider: { [handle: number]: IDisposable };
	private _virtualDocumentSet: { [resource: string]: boolean };

	constructor(
		@IThreadService threadService: IThreadService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@IEventService eventService: IEventService,
		@ITextFileService textFileService: ITextFileService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@ITextModelResolverService textModelResolverService: ITextModelResolverService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService
	) {
		super();
		this._modelService = modelService;
		this._modeService = modeService;
		this._textModelResolverService = textModelResolverService;
		this._textFileService = textFileService;
		this._codeEditorService = codeEditorService;
		this._editorService = editorService;
		this._fileService = fileService;
		this._untitledEditorService = untitledEditorService;
		this._proxy = threadService.get(ExtHostContext.ExtHostDocuments);
		this._modelIsSynced = {};

		this._toDispose = [];
		modelService.onModelAdded(this._onModelAdded, this, this._toDispose);
		modelService.onModelRemoved(this._onModelRemoved, this, this._toDispose);
		modelService.onModelModeChanged(this._onModelModeChanged, this, this._toDispose);

		this._toDispose.push(textFileService.models.onModelSaved(e => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy.$acceptModelSaved(e.resource.toString());
			}
		}));
		this._toDispose.push(textFileService.models.onModelReverted(e => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy.$acceptModelReverted(e.resource.toString());
			}
		}));
		this._toDispose.push(textFileService.models.onModelDirty(e => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy.$acceptModelDirty(e.resource.toString());
			}
		}));

		const handle = setInterval(() => this._runDocumentCleanup(), 1000 * 60 * 3);
		this._toDispose.push({ dispose() { clearInterval(handle); } });

		this._modelToDisposeMap = Object.create(null);
		this._resourceContentProvider = Object.create(null);
		this._virtualDocumentSet = Object.create(null);
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
		this._modelToDisposeMap[modelUrl.toString()] = model.addBulkListener((events) => this._onModelEvents(modelUrl, events));
		this._proxy.$acceptModelAdd({
			url: model.uri,
			versionId: model.getVersionId(),
			value: model.toRawText(),
			modeId: model.getMode().getId(),
			isDirty: this._textFileService.isDirty(modelUrl)
		});
	}

	private _onModelModeChanged(event: { model: editorCommon.IModel; oldModeId: string; }): void {
		let {model, oldModeId} = event;
		let modelUrl = model.uri;
		if (!this._modelIsSynced[modelUrl.toString()]) {
			return;
		}
		this._proxy.$acceptModelModeChanged(model.uri.toString(), oldModeId, model.getMode().getId());
	}

	private _onModelRemoved(model: editorCommon.IModel): void {
		let modelUrl = model.uri;
		if (!this._modelIsSynced[modelUrl.toString()]) {
			return;
		}
		delete this._modelIsSynced[modelUrl.toString()];
		this._modelToDisposeMap[modelUrl.toString()].dispose();
		delete this._modelToDisposeMap[modelUrl.toString()];
		this._proxy.$acceptModelRemoved(modelUrl.toString());
	}

	private _onModelEvents(modelUrl: URI, events: EmitterEvent[]): void {
		let changedEvents: editorCommon.IModelContentChangedEvent2[] = [];
		for (let i = 0, len = events.length; i < len; i++) {
			let e = events[i];
			switch (e.getType()) {
				case editorCommon.EventType.ModelContentChanged2:
					changedEvents.push(<editorCommon.IModelContentChangedEvent2>e.getData());
					break;
			}
		}
		if (changedEvents.length > 0) {
			this._proxy.$acceptModelChanged(modelUrl.toString(), changedEvents, this._textFileService.isDirty(modelUrl));
		}
	}

	// --- from extension host process

	$trySaveDocument(uri: URI): TPromise<boolean> {
		return this._textFileService.save(uri);
	}

	$tryOpenDocument(uri: URI): TPromise<any> {

		if (!uri.scheme || !(uri.fsPath || uri.authority)) {
			return TPromise.wrapError(`Invalid uri. Scheme and authority or path must be set.`);
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
				return TPromise.wrapError('cannot open ' + uri.toString());
			}
		}, err => {
			return TPromise.wrapError('cannot open ' + uri.toString() + '. Detail: ' + toErrorMessage(err));
		});
	}

	private _handleAsResourceInput(uri: URI): TPromise<boolean> {
		return this._textModelResolverService.createModelReference(uri).then(ref => {
			const result = !!ref.object;

			// TODO@Joao TODO@Joh when should this model reference be disposed?
			// ref.dispose();

			return result;
		});
	}

	private _handleUnititledScheme(uri: URI): TPromise<boolean> {
		let asFileUri = URI.file(uri.fsPath);
		return this._fileService.resolveFile(asFileUri).then(stats => {
			// don't create a new file ontop of an existing file
			return TPromise.wrapError<boolean>('file already exists on disk');
		}, err => {
			let input = this._untitledEditorService.createOrGet(asFileUri);
			return input.resolve(true).then(model => {
				if (input.getResource().toString() !== uri.toString()) {
					throw new Error(`expected URI ${uri.toString()} BUT GOT ${input.getResource().toString()}`);
				}
				if (!this._modelIsSynced[uri.toString()]) {
					throw new Error(`expected URI ${uri.toString()} to have come to LIFE`);
				}
				return this._proxy.$acceptModelDirty(uri.toString()); // mark as dirty
			}).then(() => {
				return true;
			});
		});
	}

	// --- virtual document logic

	$registerTextContentProvider(handle: number, scheme: string): void {
		this._resourceContentProvider[handle] = this._textModelResolverService.registerTextModelContentProvider(scheme, {
			provideTextContent: (uri: URI): TPromise<editorCommon.IModel> => {
				return this._proxy.$provideTextDocumentContent(handle, uri).then(value => {
					if (typeof value === 'string') {
						this._virtualDocumentSet[uri.toString()] = true;
						const firstLineText = value.substr(0, 1 + value.search(/\r?\n/));
						const mode = this._modeService.getOrCreateModeByFilenameOrFirstLine(uri.fsPath, firstLineText);
						return this._modelService.createModel(value, mode, uri);
					}
				});
			}
		});
	}

	$unregisterTextContentProvider(handle: number): void {
		const registration = this._resourceContentProvider[handle];
		if (registration) {
			registration.dispose();
			delete this._resourceContentProvider[handle];
		}
	}

	$onVirtualDocumentChange(uri: URI, value: string): void {
		const model = this._modelService.getModel(uri);
		if (model) {
			model.setValue(value);
		}
	}

	private _runDocumentCleanup(): void {

		const toBeDisposed: URI[] = [];

		// list of uris used in editors
		const activeResources: { [uri: string]: boolean } = Object.create(null);
		for (const editor of this._codeEditorService.listCodeEditors()) {
			if (editor.getModel()) {
				activeResources[editor.getModel().uri.toString()] = true;
			}
		}

		for (const workbenchEditor of this._editorService.getVisibleEditors()) {
			const uri = getResource(workbenchEditor.input);
			if (uri) {
				activeResources[uri.toString()] = true;
			}
		}

		// intersect with virtual documents
		for (let uri in this._virtualDocumentSet) {
			if (!activeResources[uri]) {
				toBeDisposed.push(URI.parse(uri));
			}
		}

		// dispose unused virtual documents
		for (let resource of toBeDisposed) {
			this._modelService.destroyModel(resource);
			delete this._virtualDocumentSet[resource.toString()];
		}
	}
}
