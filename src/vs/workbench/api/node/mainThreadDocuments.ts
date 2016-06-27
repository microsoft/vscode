/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {toErrorMessage, onUnexpectedError} from 'vs/base/common/errors';
import {EmitterEvent} from 'vs/base/common/eventEmitter';
import {IModelService} from 'vs/editor/common/services/modelService';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import URI from 'vs/base/common/uri';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {EventType as FileEventType, TextFileChangeEvent, ITextFileService} from 'vs/workbench/parts/files/common/files';
import {TPromise} from 'vs/base/common/winjs.base';
import {IFileService} from 'vs/platform/files/common/files';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {ResourceEditorInput} from 'vs/workbench/common/editor/resourceEditorInput';
import {ExtHostContext, ExtHostDocumentsShape} from './extHostProtocol';

export class MainThreadDocuments {
	private _modelService: IModelService;
	private _modeService: IModeService;
	private _textFileService: ITextFileService;
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
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService
	) {
		this._modelService = modelService;
		this._modeService = modeService;
		this._textFileService = textFileService;
		this._editorService = editorService;
		this._fileService = fileService;
		this._untitledEditorService = untitledEditorService;
		this._proxy = threadService.get(ExtHostContext.ExtHostDocuments);
		this._modelIsSynced = {};

		this._toDispose = [];
		modelService.onModelAdded(this._onModelAdded, this, this._toDispose);
		modelService.onModelRemoved(this._onModelRemoved, this, this._toDispose);
		modelService.onModelModeChanged(this._onModelModeChanged, this, this._toDispose);

		this._toDispose.push(eventService.addListener2(FileEventType.FILE_SAVED, (e: TextFileChangeEvent) => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy._acceptModelSaved(e.resource.toString());
			}
		}));
		this._toDispose.push(eventService.addListener2(FileEventType.FILE_REVERTED, (e: TextFileChangeEvent) => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy._acceptModelReverted(e.resource.toString());
			}
		}));
		this._toDispose.push(eventService.addListener2(FileEventType.FILE_DIRTY, (e: TextFileChangeEvent) => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy._acceptModelDirty(e.resource.toString());
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

	private _shouldHandleFileEvent(e: TextFileChangeEvent): boolean {
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
		this._proxy._acceptModelAdd({
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
		this._proxy._acceptModelModeChanged(model.uri.toString(), oldModeId, model.getMode().getId());
	}

	private _onModelRemoved(model: editorCommon.IModel): void {
		let modelUrl = model.uri;
		if (!this._modelIsSynced[modelUrl.toString()]) {
			return;
		}
		delete this._modelIsSynced[modelUrl.toString()];
		this._modelToDisposeMap[modelUrl.toString()].dispose();
		delete this._modelToDisposeMap[modelUrl.toString()];
		this._proxy._acceptModelRemoved(modelUrl.toString());
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
			this._proxy._acceptModelChanged(modelUrl.toString(), changedEvents);
		}
	}

	// --- from extension host process

	_trySaveDocument(uri: URI): TPromise<boolean> {
		return this._textFileService.save(uri);
	}

	_tryOpenDocument(uri: URI): TPromise<any> {

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
		return this._editorService.resolveEditorModel({ resource: uri }).then(model => {
			return !!model;
		});
	}

	private _handleUnititledScheme(uri: URI): TPromise<boolean> {
		let asFileUri = URI.file(uri.fsPath);
		return this._fileService.resolveFile(asFileUri).then(stats => {
			// don't create a new file ontop of an existing file
			return TPromise.wrapError<boolean>('file already exists on disk');
		}, err => {
			let input = this._untitledEditorService.createOrGet(asFileUri); // using file-uri makes it show in 'Working Files' section
			return input.resolve(true).then(model => {
				if (input.getResource().toString() !== uri.toString()) {
					throw new Error(`expected URI ${uri.toString() } BUT GOT ${input.getResource().toString() }`);
				}
				if (!this._modelIsSynced[uri.toString()]) {
					throw new Error(`expected URI ${uri.toString()} to have come to LIFE`);
				}
				return this._proxy._acceptModelDirty(uri.toString()); // mark as dirty
			}).then(() => {
				return true;
			});
		});
	}

	// --- virtual document logic

	$registerTextContentProvider(handle:number, scheme: string): void {
		this._resourceContentProvider[handle] = ResourceEditorInput.registerResourceContentProvider(scheme, {
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

		TPromise.join(Object.keys(this._virtualDocumentSet).map(key => {
			let resource = URI.parse(key);
			return this._editorService.createInput({ resource }).then(input => {
				if (!this._editorService.isVisible(input, true)) {
					toBeDisposed.push(resource);
				}
			});
		})).then(() => {
			for (let resource of toBeDisposed) {
				this._modelService.destroyModel(resource);
				delete this._virtualDocumentSet[resource.toString()];
			}
		}, onUnexpectedError);
	}
}
