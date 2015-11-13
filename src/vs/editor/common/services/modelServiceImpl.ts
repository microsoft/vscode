/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEmitterEvent} from 'vs/base/common/eventEmitter';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IMarker, IMarkerService} from 'vs/platform/markers/common/markers';
import {MirrorModel} from 'vs/editor/common/model/mirrorModel';
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
import {URL} from 'vs/base/common/network';
import Severity from 'vs/base/common/severity';
import {EventProvider} from 'vs/base/common/eventProvider';
import {IDisposable} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import Errors = require('vs/base/common/errors');
import {anonymize} from 'vs/platform/telemetry/common/telemetry';
import {Model} from 'vs/editor/common/model/model';

export interface IRawModelData {
	url:URL;
	versionId:number;
	value:EditorCommon.IRawText;
	properties:any;
	modeId:string;
}

class BoundModel implements IDisposable {

	model:EditorCommon.IModel;
	toUnbind:Function;
	private _decorationIds: string[];

	constructor(model:EditorCommon.IModel) {
		this.model = model;
		this.toUnbind = null;
	}

	public dispose(): void {

		this._decorationIds = this.model.deltaDecorations(this._decorationIds, []);
		this.model = null;

		if (this.toUnbind) {
			this.toUnbind();
			this.toUnbind = null;
		}
	}

	public deltaMarkers(markers:IMarker[]):void {

		// Limit to the first 500 errors/warnings
		markers = markers.slice(0, 500);

		var newModelDecorations = markers.map(marker => {
			return <EditorCommon.IModelDeltaDecoration> {
				range: this._createDecorationRange(marker),
				options: this._createDecorationOption(marker)
			};
		});
		this._decorationIds = this.model.deltaDecorations(this._decorationIds, newModelDecorations);
	}

	private _createDecorationRange(rawMarker: IMarker): EditorCommon.IRange {
		var marker = this.model.validateRange(new Range(rawMarker.startLineNumber, rawMarker.startColumn, rawMarker.endLineNumber, rawMarker.endColumn));
		var ret: EditorCommon.IEditorRange = new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn);
		if (ret.isEmpty()) {
			var word = this.model.getWordAtPosition(ret.getStartPosition());
			if (word) {
				ret.startColumn = word.startColumn;
				ret.endColumn = word.endColumn;
			} else {
				var maxColumn = this.model.getLineLastNonWhitespaceColumn(marker.startLineNumber) ||
					this.model.getLineMaxColumn(marker.startLineNumber);

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
			var minColumn = this.model.getLineFirstNonWhitespaceColumn(rawMarker.startLineNumber);
			if (minColumn < ret.endColumn) {
				ret.startColumn = minColumn;
				rawMarker.startColumn = minColumn;
			}
		}
		return ret;
	}

	private _createDecorationOption(marker:IMarker): EditorCommon.IModelDecorationOptions {

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

export interface IModelsEvents {
	[url:string]: any[];
}

export class ModelServiceImpl implements IModelService {
	public serviceId = IModelService;

	private _models: {[modelId:string]:BoundModel;};
	private _markerService: IMarkerService;
	private _markerServiceSubscription: IDisposable;
	private _threadService: IThreadService;
	private _workerHelper: ModelServiceWorkerHelper;

	private _onModelAdded: EventSource<(model: EditorCommon.IModel) => void>;
	private _onModelRemoved: EventSource<(model: EditorCommon.IModel) => void>;
	private _onModelModeChanged: EventSource<(model: EditorCommon.IModel, oldModeId:string) => void>;
	private _accumulatedModelEvents: IModelsEvents;
	private _lastSentModelEventsTime: number;
	private _sendModelEventsTimerId: number;

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

		this._accumulatedModelEvents = {};
		this._lastSentModelEventsTime = -1;
		this._sendModelEventsTimerId = -1;
	}

	public dispose(): void {
		if(this._markerServiceSubscription) {
			this._markerServiceSubscription.dispose();
		}
		if (this._sendModelEventsTimerId !== -1) {
			clearTimeout(this._sendModelEventsTimerId);
			this._sendModelEventsTimerId = -1;
		}
	}

	private _sendModelEvents(url:URL, events:any[]): void {
		let modelId = url.toString();
		this._accumulatedModelEvents[modelId] = this._accumulatedModelEvents[modelId] || [];
		this._accumulatedModelEvents[modelId] = this._accumulatedModelEvents[modelId].concat(events);

		this._sendModelEventsNow();
		// this._scheduleSendModelEvents();
	}

	// private _scheduleSendModelEvents(): void {
	// 	if (this._sendModelEventsTimerId !== -1) {
	// 		// sending model events already scheduled
	// 		return;
	// 	}

	// 	let elapsed = Date.now() - this._lastSentModelEventsTime;
	// 	if (elapsed >= 100) {
	// 		// more than 100ms have passed since last model events have been sent => send events now
	// 		this._sendModelEventsNow();
	// 	} else {
	// 		this._sendModelEventsTimerId = setTimeout(() => {
	// 			this._sendModelEventsTimerId = -1;
	// 			this._sendModelEventsNow();
	// 		}, 100 - elapsed);
	// 	}
	// }

	private _sendModelEventsNow(): void {
		this._lastSentModelEventsTime = Date.now();

		let sendingEvents = this._accumulatedModelEvents;
		this._accumulatedModelEvents = {};
		this._workerHelper.$onModelsEvents(sendingEvents);
	}

	private _handleMarkerChange(changedResources: URI[]): void {

		changedResources.forEach(resource => {
			var boundModel = this._models[resource.toString()];
			if (!boundModel) {
				return;
			}
			boundModel.deltaMarkers(this._markerService.read({ resource: resource, take: 500 }));
		});
	}

	// --- begin IModelService

	public createModel(value:string, modeOrPromise:TPromise<Modes.IMode>|Modes.IMode, resource: URL): EditorCommon.IModel {
		var model = new Model(value, modeOrPromise, resource);
		this.addModel(model);
		return model;
	}

	public addModel(model:EditorCommon.IModel): void {
		var modelId = model.getAssociatedResource().toString();

		if (this._models[modelId]) {
			// There already exists a model with this id => this is a programmer error
			throw new Error('BoundModels: Cannot add model ' + anonymize(modelId) + ' because it already exists!');
		}

		var boundModel = new BoundModel(model);

		boundModel.toUnbind = model.addBulkListener((events) => this._onModelEvents(modelId, events));
		if(this._markerService) {
			boundModel.deltaMarkers(this._markerService.read({ resource: model.getAssociatedResource() }));
		}
		this._models[modelId] = boundModel;

		// Create model in workers
		this._workerHelper.$createModel(ModelServiceImpl._getBoundModelData(model));
		this._onModelAdded.fire(model);
	}

	public removeModel(model:EditorCommon.IModel): void {
		var modelId = model.getAssociatedResource().toString();

		if (this._accumulatedModelEvents[modelId]) {
			delete this._accumulatedModelEvents[modelId];
		}

		if (!this._models[modelId]) {
			// There is no model with this id => this is a programmer error
			throw new Error('BoundModels: Cannot remove model ' + anonymize(modelId) + ' because it doesn\'t exist!');
		}

		// Dispose model in workers
		this._workerHelper.$disposeModel(model.getAssociatedResource());
		// this._modelDispose(model.getAssociatedResource());
		this._models[modelId].dispose();

		delete this._models[modelId];

		if (this._markerService) {
			var markers = this._markerService.read({ resource: model.getAssociatedResource() }),
				owners: { [o: string]: any } = Object.create(null);

			markers.forEach(marker => owners[marker.owner] = this);
			Object.keys(owners).forEach(owner => this._markerService.changeOne(owner, model.getAssociatedResource(), []));
		}

		this._onModelRemoved.fire(model);
	}

	public destroyModel(resource: URL): void {
		let model = this.getModel(resource);
		if (model) {
			model.destroy();
		}
	}

	public getModels(): EditorCommon.IModel[] {
		var ret: EditorCommon.IModel[] = [];
		for (var modelId in this._models) {
			if (this._models.hasOwnProperty(modelId)) {
				ret.push(this._models[modelId].model);
			}
		}
		return ret;
	}

	public getModel(resource: URL): EditorCommon.IModel {
		var boundModel = this._models[resource.toString()];
		if (boundModel) {
			return boundModel.model;
		}
		return null;
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

	private static _getBoundModelData(model:EditorCommon.IModel): IRawModelData {
		return {
			url: model.getAssociatedResource(),
			versionId: model.getVersionId(),
			properties: model.getProperties(),
			value: model.toRawText(),
			modeId: model.getMode().getId()
		};
	}

	private _onModelEvents(modelId:string, events:IEmitterEvent[]): void {

		var resultingEvents:any[] = [],
			changed = false,
			i:number,
			len:number;

		for (i = 0, len = events.length; i < len; i++) {
			var e = events[i];
			var data = e.getData();
			switch (e.getType()) {

				case EditorCommon.EventType.ModelDispose:
					this.removeModel(this._models[modelId].model);
					return;

				case EditorCommon.EventType.ModelContentChanged:
					switch (data.changeType) {
						case EditorCommon.EventType.ModelContentChangedFlush:
							resultingEvents.push(this._mixinProperties({ type: e.getType() }, data, ['changeType', 'detail', 'versionId']));
							break;

						case EditorCommon.EventType.ModelContentChangedLinesDeleted:
							resultingEvents.push(this._mixinProperties({ type: e.getType() }, data, ['changeType', 'fromLineNumber', 'toLineNumber', 'versionId']));
							break;

						case EditorCommon.EventType.ModelContentChangedLinesInserted:
							resultingEvents.push(this._mixinProperties({ type: e.getType() }, data, ['changeType', 'fromLineNumber', 'toLineNumber', 'detail', 'versionId']));
							break;

						case EditorCommon.EventType.ModelContentChangedLineChanged:
							resultingEvents.push(this._mixinProperties({ type: e.getType() }, data, ['changeType', 'lineNumber', 'detail', 'versionId']));
							break;
					}
					changed = true;
					break;

				case EditorCommon.EventType.ModelPropertiesChanged:
					resultingEvents.push(this._mixinProperties({ type: e.getType() }, data, ['properties']));
					break;

				case EditorCommon.EventType.ModelModeChanged:
					let modeChangedEvent = <EditorCommon.IModelModeChangedEvent>data;
					this._workerHelper.$onModelModeChanged(modelId, modeChangedEvent.oldMode.getId(), modeChangedEvent.newMode.getId());
					this._onModelModeChanged.fire(this._models[modelId].model, modeChangedEvent.oldMode.getId());
					break;
			}
		}

		if (resultingEvents.length > 0) {
			// Forward events to all the workers
			this._sendModelEvents(this._models[modelId].model.getAssociatedResource(), resultingEvents);
		}
	}

	private _mixinProperties(dst:any, src:any, properties:string[]): any {
		for (var i = 0; i < properties.length; i++) {
			dst[properties[i]] = src[properties[i]];
		}
		return dst;
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

	public $createModel(data:IRawModelData): TPromise<void> {
		// Create & insert the mirror model eagerly in the resource service
		var mirrorModel = new MirrorModel(this._resourceService, data.versionId, data.value, null, data.url, data.properties);
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

	public $onModelModeChanged(modelId:string, oldModeId:string, newModeId:string): TPromise<void> {
		var mirrorModel = this._resourceService.get(URI.parse(modelId));

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

	public $disposeModel(url:URL): void {
		var model = <MirrorModel>this._resourceService.get(url);
		this._resourceService.remove(url);
		if (model) {
			model.dispose();
		}
	}

	public $onModelsEvents(events:IModelsEvents): void {
		let missingModels: string[] = [];
		Object.keys(events).forEach((strURL:string) => {
			var model = <MirrorModel>this._resourceService.get(new URL(strURL));
			if (!model) {
				missingModels.push(strURL);
				return;
			}
			try {
				model.onEvents(events[strURL]);
			} catch (err) {
				Errors.onUnexpectedError(err);
			}
		});

		if (missingModels.length > 0) {
			throw new Error('Received model events for missing models ' + missingModels.map(anonymize).join(' AND '));
		}
	}
}
