/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import Event, {Emitter} from 'vs/base/common/event';
import {IEmitterEvent} from 'vs/base/common/eventEmitter';
import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {IDisposable} from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IMarker, IMarkerService} from 'vs/platform/markers/common/markers';
import {anonymize} from 'vs/platform/telemetry/common/telemetry';
import {IThreadService, Remotable, ThreadAffinity} from 'vs/platform/thread/common/thread';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IMirrorModelEvents, MirrorModel} from 'vs/editor/common/model/mirrorModel';
import {Model} from 'vs/editor/common/model/model';
import {IMode} from 'vs/editor/common/modes';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import * as platform from 'vs/base/common/platform';
import {IConfigurationService, ConfigurationServiceEventTypes, IConfigurationServiceEvent} from 'vs/platform/configuration/common/configuration';
import {DEFAULT_INDENTATION} from 'vs/editor/common/config/defaultConfig';
import {IMessageService} from 'vs/platform/message/common/message';

export interface IRawModelData {
	url:URI;
	versionId:number;
	value:editorCommon.IRawText;
	modeId:string;
}

function MODEL_ID(resource:URI): string {
	return resource.toString();
}

class ModelData implements IDisposable {
	model: editorCommon.IModel;
	isSyncedToWorkers: boolean;

	private _markerDecorations: string[];
	private _modelEventsListener: IDisposable;

	constructor(model: editorCommon.IModel, eventsHandler:(modelData:ModelData, events:IEmitterEvent[])=>void) {
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

	public acceptMarkerDecorations(newDecorations:editorCommon.IModelDeltaDecoration[]): void {
		this._markerDecorations = this.model.deltaDecorations(this._markerDecorations, newDecorations);
	}
}

class ModelMarkerHandler {

	public static setMarkers(modelData:ModelData, markers:IMarker[]):void {

		// Limit to the first 500 errors/warnings
		markers = markers.slice(0, 500);

		let newModelDecorations:editorCommon.IModelDeltaDecoration[] = markers.map((marker) => {
			return {
				range: this._createDecorationRange(modelData.model, marker),
				options: this._createDecorationOption(marker)
			};
		});

		modelData.acceptMarkerDecorations(newModelDecorations);
	}

	private static _createDecorationRange(model:editorCommon.IModel, rawMarker: IMarker): editorCommon.IRange {
		let marker = model.validateRange(new Range(rawMarker.startLineNumber, rawMarker.startColumn, rawMarker.endLineNumber, rawMarker.endColumn));
		let ret: editorCommon.IEditorRange = new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn);
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

	private static _createDecorationOption(marker:IMarker): editorCommon.IModelDecorationOptions {

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
				className = editorCommon.ClassName.EditorWarningDecoration;
				color = 'rgba(18,136,18,0.7)';
				darkColor = 'rgba(18,136,18,0.7)';
				break;
			case Severity.Error:
			default:
				className = editorCommon.ClassName.EditorErrorDecoration;
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

		if (marker.source) {
			htmlMessage.unshift({ isText: true, text: `[${marker.source}] ` });
		}

		return {
			stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			className,
			htmlMessage: htmlMessage,
			overviewRuler: {
				color,
				darkColor,
				position: editorCommon.OverviewRulerLane.Right
			}
		};
	}
}

interface IRawConfig {
	files?: {
		eol?: any;
	};
	editor?: {
		tabSize?: any;
		insertSpaces?: any;
		detectIndentation?: any;
	};
}

export class ModelServiceImpl implements IModelService {
	public serviceId = IModelService;

	private _markerService: IMarkerService;
	private _markerServiceSubscription: IDisposable;
	private _threadService: IThreadService;
	private _modeService: IModeService;
	private _messageService: IMessageService;
	private _configurationService: IConfigurationService;
	private _configurationServiceSubscription: IDisposable;
	private _workerHelper: ModelServiceWorkerHelper;

	private _onModelAdded: Emitter<editorCommon.IModel>;
	private _onModelRemoved: Emitter<editorCommon.IModel>;
	private _onModelModeChanged: Emitter<{ model: editorCommon.IModel; oldModeId: string; }>;

	private _modelCreationOptions: editorCommon.ITextModelCreationOptions;

	private _hasShownMigrationMessage: boolean;

	/**
	 * All the models known in the system.
	 */
	private _models: {[modelId:string]:ModelData;};

	constructor(
		threadService: IThreadService,
		markerService: IMarkerService,
		modeService: IModeService,
		configurationService: IConfigurationService,
		messageService: IMessageService
	) {
		this._modelCreationOptions = {
			tabSize: DEFAULT_INDENTATION.tabSize,
			insertSpaces: DEFAULT_INDENTATION.insertSpaces,
			detectIndentation: DEFAULT_INDENTATION.detectIndentation,
			defaultEOL: (platform.isLinux || platform.isMacintosh) ? editorCommon.DefaultEndOfLine.LF : editorCommon.DefaultEndOfLine.CRLF
		};
		this._threadService = threadService;
		this._markerService = markerService;
		this._modeService = modeService;
		this._workerHelper = this._threadService.getRemotable(ModelServiceWorkerHelper);
		this._configurationService = configurationService;
		this._messageService = messageService;
		this._hasShownMigrationMessage = false;

		let readConfig = (config:IRawConfig) => {
			const eol = config.files && config.files.eol;

			let shouldShowMigrationMessage = false;

			let tabSize = DEFAULT_INDENTATION.tabSize;
			if (config.editor && typeof config.editor.tabSize !== 'undefined') {
				let parsedTabSize = parseInt(config.editor.tabSize, 10);
				if (!isNaN(parsedTabSize)) {
					tabSize = parsedTabSize;
				}
				shouldShowMigrationMessage = shouldShowMigrationMessage || (config.editor.tabSize === 'auto');
			}

			let insertSpaces = DEFAULT_INDENTATION.insertSpaces;
			if (config.editor && typeof config.editor.insertSpaces !== 'undefined') {
				insertSpaces = (config.editor.insertSpaces === 'false' ? false : Boolean(config.editor.insertSpaces));
				shouldShowMigrationMessage = shouldShowMigrationMessage || (config.editor.insertSpaces === 'auto');
			}

			let newDefaultEOL = this._modelCreationOptions.defaultEOL;
			if (eol === '\r\n') {
				newDefaultEOL = editorCommon.DefaultEndOfLine.CRLF;
			} else if (eol === '\n') {
				newDefaultEOL = editorCommon.DefaultEndOfLine.LF;
			}

			let detectIndentation = DEFAULT_INDENTATION.detectIndentation;
			if (config.editor && typeof config.editor.detectIndentation !== 'undefined') {
				detectIndentation = (config.editor.detectIndentation === 'false' ? false : Boolean(config.editor.detectIndentation));
			}

			this._setModelOptions({
				tabSize: tabSize,
				insertSpaces: insertSpaces,
				detectIndentation: detectIndentation,
				defaultEOL: newDefaultEOL
			});


			if (shouldShowMigrationMessage && !this._hasShownMigrationMessage) {
				this._hasShownMigrationMessage = true;
				this._messageService.show(Severity.Info, nls.localize('indentAutoMigrate', "Please update your settings: `editor.detectIndentation` replaces `editor.tabSize`: \"auto\" or `editor.insertSpaces`: \"auto\""));
			}
		};
		this._configurationServiceSubscription = this._configurationService.addListener2(ConfigurationServiceEventTypes.UPDATED, (e: IConfigurationServiceEvent) => {
			readConfig(e.config);
		});
		this._configurationService.loadConfiguration().then((config) => {
			readConfig(config);
		});

		this._models = {};

		this._onModelAdded = new Emitter<editorCommon.IModel>();
		this._onModelRemoved = new Emitter<editorCommon.IModel>();
		this._onModelModeChanged = new Emitter<{ model: editorCommon.IModel; oldModeId: string; }>();

		if(this._markerService) {
			this._markerServiceSubscription = this._markerService.onMarkerChanged(this._handleMarkerChange, this);
		}
	}

	public getCreationOptions(): editorCommon.ITextModelCreationOptions {
		return this._modelCreationOptions;
	}

	private _setModelOptions(newOpts: editorCommon.ITextModelCreationOptions): void {
		if (
			(this._modelCreationOptions.detectIndentation === newOpts.detectIndentation)
			&& (this._modelCreationOptions.insertSpaces === newOpts.insertSpaces)
			&& (this._modelCreationOptions.tabSize === newOpts.tabSize)
		) {
			// Same indent opts, no need to touch created models
			this._modelCreationOptions = newOpts;
			return;
		}
		this._modelCreationOptions = newOpts;

		// Update options on all models
		for (let modelId in this._models) {
			if (this._models.hasOwnProperty(modelId)) {
				let modelData = this._models[modelId];

				if (this._modelCreationOptions.detectIndentation) {
					modelData.model.detectIndentation(this._modelCreationOptions.insertSpaces, this._modelCreationOptions.tabSize);
				} else {
					modelData.model.updateOptions({
						insertSpaces: this._modelCreationOptions.insertSpaces,
						tabSize:  this._modelCreationOptions.tabSize
					});
				}
			}
		}
	}

	public dispose(): void {
		if(this._markerServiceSubscription) {
			this._markerServiceSubscription.dispose();
		}
		this._configurationServiceSubscription.dispose();
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

	private _shouldSyncModelToWorkers(model:editorCommon.IModel): boolean {
		if (model.isTooLargeForHavingARichMode()) {
			return false;
		}
		// Only sync models with compat modes to the workers
		return this._modeService.isCompatMode(model.getMode().getId());
	}

	private _createModelData(value:string, modeOrPromise:TPromise<IMode>|IMode, resource: URI): ModelData {
		// create & save the model
		let model = new Model(value, this._modelCreationOptions, modeOrPromise, resource);
		let modelId = MODEL_ID(model.getAssociatedResource());

		if (this._models[modelId]) {
			// There already exists a model with this id => this is a programmer error
			throw new Error('ModelService: Cannot add model ' + anonymize(modelId) + ' because it already exists!');
		}

		let modelData = new ModelData(model, (modelData, events) => this._onModelEvents(modelData, events));
		this._models[modelId] = modelData;

		return modelData;
	}

	public createModel(value:string, modeOrPromise:TPromise<IMode>|IMode, resource: URI): editorCommon.IModel {
		let modelData = this._createModelData(value, modeOrPromise, resource);

		// handle markers (marker service => model)
		if (this._markerService) {
			ModelMarkerHandler.setMarkers(modelData, this._markerService.read({ resource: modelData.model.getAssociatedResource() }));
		}

		if (this._shouldSyncModelToWorkers(modelData.model)) {
			// send this model to the workers
			this._beginWorkerSync(modelData);
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

	public getModels(): editorCommon.IModel[] {
		let ret: editorCommon.IModel[] = [];
		for (let modelId in this._models) {
			if (this._models.hasOwnProperty(modelId)) {
				ret.push(this._models[modelId].model);
			}
		}
		return ret;
	}

	public getModel(resource: URI): editorCommon.IModel {
		let modelId = MODEL_ID(resource);
		let modelData = this._models[modelId];
		if (!modelData) {
			return null;
		}
		return modelData.model;
	}

	public get onModelAdded(): Event<editorCommon.IModel> {
		return this._onModelAdded ? this._onModelAdded.event : null;
	}

	public get onModelRemoved(): Event<editorCommon.IModel> {
		return this._onModelRemoved ? this._onModelRemoved.event : null;
	}

	public get onModelModeChanged(): Event<{ model: editorCommon.IModel; oldModeId: string; }> {
		return this._onModelModeChanged ? this._onModelModeChanged.event : null;
	}

	// --- end IModelService

	private _beginWorkerSync(modelData:ModelData): void {
		if (modelData.isSyncedToWorkers) {
			throw new Error('Model is already being synced to workers!');
		}

		modelData.isSyncedToWorkers = true;
		this._workerHelper.$_acceptNewModel(ModelServiceImpl._getBoundModelData(modelData.model));
	}

	private _stopWorkerSync(modelData:ModelData): void {
		if (!modelData.isSyncedToWorkers) {
			throw new Error('Model is already not being synced to workers!');
		}
		modelData.isSyncedToWorkers = false;
		this._workerHelper.$_acceptDidDisposeModel(modelData.model.getAssociatedResource());
	}

	private _onModelDisposing(model:editorCommon.IModel): void {
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
			this._stopWorkerSync(modelData);
		}

		delete this._models[modelId];
		modelData.dispose();

		this._onModelRemoved.fire(model);
	}

	private static _getBoundModelData(model:editorCommon.IModel): IRawModelData {
		return {
			url: model.getAssociatedResource(),
			versionId: model.getVersionId(),
			value: model.toRawText(),
			modeId: model.getMode().getId()
		};
	}

	private _onModelEvents(modelData:ModelData, events:IEmitterEvent[]): void {

		// First look for dispose
		for (let i = 0, len = events.length; i < len; i++) {
			let e = events[i];
			if (e.getType() === editorCommon.EventType.ModelDispose) {
				this._onModelDisposing(modelData.model);
				// no more processing since model got disposed
				return;
			}
		}

		// Second, look for mode change
		for (let i = 0, len = events.length; i < len; i++) {
			let e = events[i];
			if (e.getType() === editorCommon.EventType.ModelModeChanged) {
				let wasSyncedToWorkers = modelData.isSyncedToWorkers;
				let shouldSyncToWorkers = this._shouldSyncModelToWorkers(modelData.model);

				this._onModelModeChanged.fire({
					model: modelData.model,
					oldModeId: (<editorCommon.IModelModeChangedEvent>e.getData()).oldMode.getId()
				});

				if (wasSyncedToWorkers) {
					if (shouldSyncToWorkers) {
						// true -> true
						// Forward mode change to all the workers
						this._workerHelper.$_acceptDidChangeModelMode(modelData.getModelId(), modelData.model.getMode().getId());
					} else {
						// true -> false
						// Stop worker sync for this model
						this._stopWorkerSync(modelData);
						// no more processing since we have removed the model from the workers
						return;
					}
				} else {
					if (shouldSyncToWorkers) {
						// false -> true
						// Begin syncing this model to the workers
						this._beginWorkerSync(modelData);
						// no more processing since we are sending the latest state
						return;
					} else {
						// false -> false
						// no more processing since this model was not synced and will not be synced
						return;
					}
				}
			}
		}

		if (!modelData.isSyncedToWorkers) {
			return;
		}

		// Finally, look for model content changes
		let eventsForWorkers: IMirrorModelEvents = { contentChanged: [] };
		for (let i = 0, len = events.length; i < len; i++) {
			let e = events[i];

			if (e.getType() === editorCommon.EventType.ModelContentChanged) {
				eventsForWorkers.contentChanged.push(<editorCommon.IModelContentChangedEvent>e.getData());
			}
		}

		if (eventsForWorkers.contentChanged.length > 0) {
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
		let mirrorModel = new MirrorModel(this._resourceService, data.versionId, data.value, null, data.url);
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

	public $_acceptDidChangeModelMode(modelId:string, newModeId:string): TPromise<void> {
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
			onUnexpectedError(err);
		}
	}
}
