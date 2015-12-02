/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEmitterEvent} from 'vs/base/common/eventEmitter';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IMarker, IMarkerService} from 'vs/platform/markers/common/markers';
import {IMirrorModelEvents, MirrorModel} from 'vs/editor/common/model/mirrorModel';
import {Range} from 'vs/editor/common/core/range';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {Remotable, IThreadService, ThreadAffinity, IThreadSynchronizableObject} from 'vs/platform/thread/common/thread';
import {AllWorkersAttr} from 'vs/platform/thread/common/threadService';
import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {EventSource} from 'vs/base/common/eventSource';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import {EventProvider} from 'vs/base/common/eventProvider';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import Errors = require('vs/base/common/errors');
import {anonymize} from 'vs/platform/telemetry/common/telemetry';
import {Model} from 'vs/editor/common/model/model';

export interface IRawModelData {
	url:URI;
	versionId:number;
	value:EditorCommon.IRawText;
	properties:any;
	modeId:string;
}

function MODEL_ID(resource:URI): string {
	return resource.toString();
}

class ModelData implements IDisposable {
	model: EditorCommon.IModel;
	isSyncedToWorkers: boolean;

	private _markerDecorations: string[];
	private _modelEventsListener: IDisposable;

	constructor(model: EditorCommon.IModel, eventsHandler:(modelData:ModelData, events:IEmitterEvent[])=>void) {
		this.model = model;
		this.isSyncedToWorkers = false;

		this._markerDecorations = [];
		this._modelEventsListener = model.addBulkListener2((events) => eventsHandler(this, events));
	}

	public dispose(): void {
		this._markerDecorations = this.model.deltaDecorations(this._markerDecorations, []);
		this._modelEventsListener.dispose();
		this._modelEventsListener = null;
		this.model = null;
	}

	public getModelId(): string {
		return MODEL_ID(this.model.getAssociatedResource());
	}

	public acceptMarkerDecorations(newDecorations:EditorCommon.IModelDeltaDecoration[]): void {
		this._markerDecorations = this.model.deltaDecorations(this._markerDecorations, newDecorations);
	}
}

class ModelMarkerHandler {

	public static setMarkers(modelData:ModelData, markers:IMarker[]):void {

		// Limit to the first 500 errors/warnings
		markers = markers.slice(0, 500);

		let newModelDecorations:EditorCommon.IModelDeltaDecoration[] = markers.map((marker) => {
			return {
				range: this._createDecorationRange(modelData.model, marker),
				options: this._createDecorationOption(marker)
			};
		});

		modelData.acceptMarkerDecorations(newModelDecorations);
	}

	private static _createDecorationRange(model:EditorCommon.IModel, rawMarker: IMarker): EditorCommon.IRange {
		let marker = model.validateRange(new Range(rawMarker.startLineNumber, rawMarker.startColumn, rawMarker.endLineNumber, rawMarker.endColumn));
		let ret: EditorCommon.IEditorRange = new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn);
		if (ret.isEmpty()) {
			let word = model.getWordAtPosition(ret.getStartPosition());
			if (word) {
				ret.startColumn = word.startColumn;
				ret.endColumn = word.endColumn;
			} else {
				let maxColumn = model.getLineLastNonWhitespaceColumn(marker.startLineNumber) ||
					model.getLineMaxColumn(marker.startLineNumber);

				if (maxColumn === 1) {
					// empty line
//					console.warn('marker on empty line:', marker);
				} else if (ret.endColumn >= maxColumn) {
					// behind eol
					ret.endColumn = maxColumn;
					ret.startColumn = maxColumn - 1;
				} else {
					// extend marker to width = 1
					ret.endColumn += 1;
				}
			}
		} else if (rawMarker.endColumn === Number.MAX_VALUE && rawMarker.startColumn === 1 && ret.startLineNumber === ret.endLineNumber) {
			let minColumn = model.getLineFirstNonWhitespaceColumn(rawMarker.startLineNumber);
			if (minColumn < ret.endColumn) {
				ret.startColumn = minColumn;
				rawMarker.startColumn = minColumn;
			}
		}
		return ret;
	}

	private static _createDecorationOption(marker:IMarker): EditorCommon.IModelDecorationOptions {

		let className: string;
		let color: string;
		let darkColor: string;
		let htmlMessage: IHTMLContentElement[] = null;

		switch (marker.severity) {
			case Severity.Ignore:
				// do something
				break;
			case Severity.Warning:
			case Severity.Info:
				className = EditorCommon.ClassName.EditorWarningDecoration;
				color = 'rgba(18,136,18,0.7)';
				darkColor = 'rgba(18,136,18,0.7)';
				break;
			case Severity.Error:
			default:
				className = EditorCommon.ClassName.EditorErrorDecoration;
				color = 'rgba(255,18,18,0.7)';
				darkColor = 'rgba(255,18,18,0.7)';
				break;
		}

		if (typeof marker.message === 'string') {
			htmlMessage = [{ isText: true, text: marker.message }];
		} else if (Array.isArray(marker.message)) {
			htmlMessage = <IHTMLContentElement[]><any>marker.message;
		} else if (marker.message) {
			htmlMessage = [marker.message];
		}

		return {
			stickiness: EditorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			className,
			htmlMessage: htmlMessage,
			overviewRuler: {
				color,
				darkColor,
				position: EditorCommon.OverviewRulerLane.Right
			}
		};
	}
}

export class ModelServiceImpl implements IModelService {
	public serviceId = IModelService;

	private _markerService: IMarkerService;
	private _markerServiceSubscription: IDisposable;
	private _threadService: IThreadService;
	private _workerHelper: ModelServiceWorkerHelper;

	private _onModelAdded: EventSource<(model: EditorCommon.IModel) => void>;
	private _onModelRemoved: EventSource<(model: EditorCommon.IModel) => void>;
	private _onModelModeChanged: EventSource<(model: EditorCommon.IModel, oldModeId:string) => void>;

	/**
	 * All the models known in the system.
	 */
	private _models: {[modelId:string]:ModelData;};

	constructor(threadService: IThreadService, markerService: IMarkerService) {
		this._threadService = threadService;
		this._markerService = markerService;
		this._workerHelper = this._threadService.getRemotable(ModelServiceWorkerHelper);

		this._models = {};

		this._onModelAdded = new EventSource<(model: EditorCommon.IModel) => void>();
		this._onModelRemoved = new EventSource<(model: EditorCommon.IModel) => void>();
		this._onModelModeChanged = new EventSource<(model: EditorCommon.IModel, oldModeId:string) => void>();

		if(this._markerService) {
			this._markerServiceSubscription = this._markerService.onMarkerChanged(this._handleMarkerChange, this);
		}
	}

	public dispose(): void {
		if(this._markerServiceSubscription) {
			this._markerServiceSubscription.dispose();
		}
	}

	private _handleMarkerChange(changedResources: URI[]): void {
		changedResources.forEach((resource) => {
			let modelId = MODEL_ID(resource);
			let modelData = this._models[modelId];
			if (!modelData) {
				return;
			}
			ModelMarkerHandler.setMarkers(modelData, this._markerService.read({ resource: resource, take: 500 }));
		});
	}

	// --- begin IModelService

	private _createModelData(value:string, modeOrPromise:TPromise<Modes.IMode>|Modes.IMode, resource: URI): ModelData {
		// create & save the model
		let model = new Model(value, modeOrPromise, resource);
		let modelId = MODEL_ID(model.getAssociatedResource());

		if (this._models[modelId]) {
			// There already exists a model with this id => this is a programmer error
			throw new Error('ModelService: Cannot add model ' + anonymize(modelId) + ' because it already exists!');
		}

		let modelData = new ModelData(model, (modelData, events) => this._onModelEvents(modelData, events));
		this._models[modelId] = modelData;

		return modelData;
	}

	public createModel(value:string, modeOrPromise:TPromise<Modes.IMode>|Modes.IMode, resource: URI): EditorCommon.IModel {
		let modelData = this._createModelData(value, modeOrPromise, resource);
		let modelId = modelData.getModelId();

		// handle markers (marker service => model)
		if (this._markerService) {
			ModelMarkerHandler.setMarkers(modelData, this._markerService.read({ resource: modelData.model.getAssociatedResource() }));
		}

		if (!modelData.model.isTooLargeForHavingARichMode()) {
			// send this model to the workers
			modelData.isSyncedToWorkers = true;
			this._workerHelper.$_acceptNewModel(ModelServiceImpl._getBoundModelData(modelData.model));
		}

		this._onModelAdded.fire(modelData.model);

		return modelData.model;
	}

	public destroyModel(resource: URI): void {
		// We need to support that not all models get disposed through this service (i.e. model.dispose() should work!)
		let modelData = this._models[MODEL_ID(resource)];
		if (!modelData) {
			return;
		}
		modelData.model.dispose();
	}

	public getModels(): EditorCommon.IModel[] {
		let ret: EditorCommon.IModel[] = [];
		for (let modelId in this._models) {
			if (this._models.hasOwnProperty(modelId)) {
				ret.push(this._models[modelId].model);
			}
		}
		return ret;
	}

	public getModel(resource: URI): EditorCommon.IModel {
		let modelId = MODEL_ID(resource);
		let modelData = this._models[modelId];
		if (!modelData) {
			return null;
		}
		return modelData.model;
	}

	public get onModelAdded(): EventProvider<(model:EditorCommon.IModel)=>void> {
		return this._onModelAdded ? this._onModelAdded.value : null;
	}

	public get onModelRemoved(): EventProvider<(model:EditorCommon.IModel)=>void> {
		return this._onModelRemoved ? this._onModelRemoved.value : null;
	}

	public get onModelModeChanged(): EventProvider<(model:EditorCommon.IModel, oldModeId:string)=>void> {
		return this._onModelModeChanged ? this._onModelModeChanged.value : null;
	}

	// --- end IModelService

	private _onModelDisposing(model:EditorCommon.IModel): void {
		let modelId = MODEL_ID(model.getAssociatedResource());
		let modelData = this._models[modelId];

		// TODO@Joh why are we removing markers here?
		if (this._markerService) {
			var markers = this._markerService.read({ resource: model.getAssociatedResource() }),
				owners: { [o: string]: any } = Object.create(null);

			markers.forEach(marker => owners[marker.owner] = this);
			Object.keys(owners).forEach(owner => this._markerService.changeOne(owner, model.getAssociatedResource(), []));
		}

		if (modelData.isSyncedToWorkers) {
			// Dispose model in workers
			this._workerHelper.$_acceptDidDisposeModel(model.getAssociatedResource());
		}

		delete this._models[modelId];
		modelData.dispose();

		this._onModelRemoved.fire(model);
	}

	private static _getBoundModelData(model:EditorCommon.IModel): IRawModelData {
		return {
			url: model.getAssociatedResource(),
			versionId: model.getVersionId(),
			properties: model.getProperties(),
			value: model.toRawText(),
			modeId: model.getMode().getId()
		};
	}

	private _onModelEvents(modelData:ModelData, events:IEmitterEvent[]): void {
		let eventsForWorkers: IMirrorModelEvents = { contentChanged: [], propertiesChanged: null };

		for (let i = 0, len = events.length; i < len; i++) {
			let e = events[i];
			let data = e.getData();

			switch (e.getType()) {
				case EditorCommon.EventType.ModelDispose:
					this._onModelDisposing(modelData.model);
					// no more event processing
					return;

				case EditorCommon.EventType.ModelContentChanged:
					if (modelData.isSyncedToWorkers) {
						eventsForWorkers.contentChanged.push(<EditorCommon.IModelContentChangedEvent>data);
					}
					break;

				case EditorCommon.EventType.ModelPropertiesChanged:
					if (modelData.isSyncedToWorkers) {
						eventsForWorkers.propertiesChanged = <EditorCommon.IModelPropertiesChangedEvent>data;
					}
					break;

				case EditorCommon.EventType.ModelModeChanged:
					let modeChangedEvent = <EditorCommon.IModelModeChangedEvent>data;
					if (modelData.isSyncedToWorkers) {
						// Forward mode change to all the workers
						this._workerHelper.$_acceptDidChangeModelMode(modelData.getModelId(), modeChangedEvent.oldMode.getId(), modeChangedEvent.newMode.getId());
					}
					this._onModelModeChanged.fire(modelData.model, modeChangedEvent.oldMode.getId());
					break;
			}
		}

		if (eventsForWorkers.contentChanged.length > 0 || eventsForWorkers.propertiesChanged) {
			// Forward events to all the workers
			this._workerHelper.$_acceptModelEvents(modelData.getModelId(), eventsForWorkers);
		}
	}
}

@Remotable.WorkerContext('ModelServiceWorkerHelper', ThreadAffinity.All)
export class ModelServiceWorkerHelper {

	private _resourceService:IResourceService;
	private _modeService:IModeService;

	constructor(
		@IResourceService resourceService: IResourceService,
		@IModeService modeService: IModeService
	) {
		this._resourceService = resourceService;
		this._modeService = modeService;
	}

	public $_acceptNewModel(data:IRawModelData): TPromise<void> {
		// Create & insert the mirror model eagerly in the resource service
		let mirrorModel = new MirrorModel(this._resourceService, data.versionId, data.value, null, data.url, data.properties);
		this._resourceService.insert(mirrorModel.getAssociatedResource(), mirrorModel);

		// Block worker execution until the mode is instantiated
		return this._modeService.getOrCreateMode(data.modeId).then((mode) => {
			// Changing mode should trigger a remove & an add, therefore:

			// (1) Remove from resource service
			this._resourceService.remove(mirrorModel.getAssociatedResource());

			// (2) Change mode
			mirrorModel.setMode(mode);

			// (3) Insert again to resource service (it will have the new mode)
			this._resourceService.insert(mirrorModel.getAssociatedResource(), mirrorModel);
		});
	}

	public $_acceptDidChangeModelMode(modelId:string, oldModeId:string, newModeId:string): TPromise<void> {
		let mirrorModel = this._resourceService.get(URI.parse(modelId));

		// Block worker execution until the mode is instantiated
		return this._modeService.getOrCreateMode(newModeId).then((mode) => {
			// Changing mode should trigger a remove & an add, therefore:

			// (1) Remove from resource service
			this._resourceService.remove(mirrorModel.getAssociatedResource());

			// (2) Change mode
			mirrorModel.setMode(mode);

			// (3) Insert again to resource service (it will have the new mode)
			this._resourceService.insert(mirrorModel.getAssociatedResource(), mirrorModel);
		});
	}

	public $_acceptDidDisposeModel(url:URI): void {
		let model = <MirrorModel>this._resourceService.get(url);
		this._resourceService.remove(url);
		if (model) {
			model.dispose();
		}
	}

	public $_acceptModelEvents(modelId: string, events:IMirrorModelEvents): void {
		let model = <MirrorModel>this._resourceService.get(URI.parse(modelId));
		if (!model) {
			throw new Error('Received model events for missing model ' + anonymize(modelId));
		}
		try {
			model.onEvents(events);
		} catch (err) {
			Errors.onUnexpectedError(err);
		}
	}
}
