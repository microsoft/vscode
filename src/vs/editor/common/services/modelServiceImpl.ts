/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import network = require('vs/base/common/network');
import Event, {Emitter} from 'vs/base/common/event';
import {EmitterEvent} from 'vs/base/common/eventEmitter';
import {MarkedString, textToMarkedString} from 'vs/base/common/htmlContent';
import {IDisposable} from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IMarker, IMarkerService} from 'vs/platform/markers/common/markers';
import {anonymize} from 'vs/platform/telemetry/common/telemetry';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {Model} from 'vs/editor/common/model/model';
import {IMode} from 'vs/editor/common/modes';
import {IModelService} from 'vs/editor/common/services/modelService';
import * as platform from 'vs/base/common/platform';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {DEFAULT_INDENTATION, DEFAULT_TRIM_AUTO_WHITESPACE} from 'vs/editor/common/config/defaultConfig';
import {IMessageService} from 'vs/platform/message/common/message';

export interface IRawModelData {
	url: URI;
	versionId: number;
	value: editorCommon.IRawText;
	modeId: string;
}

function MODEL_ID(resource: URI): string {
	return resource.toString();
}

class ModelData implements IDisposable {
	model: editorCommon.IModel;

	private _markerDecorations: string[];
	private _modelEventsListener: IDisposable;

	constructor(model: editorCommon.IModel, eventsHandler: (modelData: ModelData, events: EmitterEvent[]) => void) {
		this.model = model;

		this._markerDecorations = [];
		this._modelEventsListener = model.addBulkListener((events) => eventsHandler(this, events));
	}

	public dispose(): void {
		this._markerDecorations = this.model.deltaDecorations(this._markerDecorations, []);
		this._modelEventsListener.dispose();
		this._modelEventsListener = null;
		this.model = null;
	}

	public getModelId(): string {
		return MODEL_ID(this.model.uri);
	}

	public acceptMarkerDecorations(newDecorations: editorCommon.IModelDeltaDecoration[]): void {
		this._markerDecorations = this.model.deltaDecorations(this._markerDecorations, newDecorations);
	}
}

class ModelMarkerHandler {

	public static setMarkers(modelData: ModelData, markers: IMarker[]): void {

		// Limit to the first 500 errors/warnings
		markers = markers.slice(0, 500);

		let newModelDecorations: editorCommon.IModelDeltaDecoration[] = markers.map((marker) => {
			return {
				range: this._createDecorationRange(modelData.model, marker),
				options: this._createDecorationOption(marker)
			};
		});

		modelData.acceptMarkerDecorations(newModelDecorations);
	}

	private static _createDecorationRange(model: editorCommon.IModel, rawMarker: IMarker): editorCommon.IRange {
		let marker = model.validateRange(new Range(rawMarker.startLineNumber, rawMarker.startColumn, rawMarker.endLineNumber, rawMarker.endColumn));
		let ret: Range = new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn);
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

	private static _createDecorationOption(marker: IMarker): editorCommon.IModelDecorationOptions {

		let className: string;
		let color: string;
		let darkColor: string;
		let htmlMessage: MarkedString[] = null;

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
			htmlMessage = [ textToMarkedString(marker.message) ];
		} else if (Array.isArray(marker.message)) {
			htmlMessage = <MarkedString[]><any>marker.message;
		} else if (marker.message) {
			htmlMessage = [ marker.message ];
		}

		if (htmlMessage && marker.source) {
			htmlMessage.unshift(`[${marker.source}] `);
		}

		return {
			stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			className,
			hoverMessage: htmlMessage,
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
		trimAutoWhitespace?: any;
	};
}

export class ModelServiceImpl implements IModelService {
	public serviceId = IModelService;

	private _markerService: IMarkerService;
	private _markerServiceSubscription: IDisposable;
	private _messageService: IMessageService;
	private _configurationService: IConfigurationService;
	private _configurationServiceSubscription: IDisposable;

	private _onModelAdded: Emitter<editorCommon.IModel>;
	private _onModelRemoved: Emitter<editorCommon.IModel>;
	private _onModelModeChanged: Emitter<{ model: editorCommon.IModel; oldModeId: string; }>;

	private _modelCreationOptions: editorCommon.ITextModelCreationOptions;

	private _hasShownMigrationMessage: boolean;

	/**
	 * All the models known in the system.
	 */
	private _models: { [modelId: string]: ModelData; };

	constructor(
		@IMarkerService markerService: IMarkerService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMessageService messageService: IMessageService
	) {
		this._modelCreationOptions = {
			tabSize: DEFAULT_INDENTATION.tabSize,
			insertSpaces: DEFAULT_INDENTATION.insertSpaces,
			detectIndentation: DEFAULT_INDENTATION.detectIndentation,
			defaultEOL: (platform.isLinux || platform.isMacintosh) ? editorCommon.DefaultEndOfLine.LF : editorCommon.DefaultEndOfLine.CRLF,
			trimAutoWhitespace: DEFAULT_TRIM_AUTO_WHITESPACE
		};
		this._markerService = markerService;
		this._configurationService = configurationService;
		this._messageService = messageService;
		this._hasShownMigrationMessage = false;
		this._models = {};


		this._onModelAdded = new Emitter<editorCommon.IModel>();
		this._onModelRemoved = new Emitter<editorCommon.IModel>();
		this._onModelModeChanged = new Emitter<{ model: editorCommon.IModel; oldModeId: string; }>();

		if (this._markerService) {
			this._markerServiceSubscription = this._markerService.onMarkerChanged(this._handleMarkerChange, this);
		}

		let readConfig = (config: IRawConfig) => {

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
			const eol = config.files && config.files.eol;
			if (eol === '\r\n') {
				newDefaultEOL = editorCommon.DefaultEndOfLine.CRLF;
			} else if (eol === '\n') {
				newDefaultEOL = editorCommon.DefaultEndOfLine.LF;
			}

			let trimAutoWhitespace = this._modelCreationOptions.trimAutoWhitespace;
			if (config.editor && typeof config.editor.trimAutoWhitespace !== 'undefined') {
				trimAutoWhitespace = (config.editor.trimAutoWhitespace === 'false' ? false : Boolean(config.editor.trimAutoWhitespace));
			}

			let detectIndentation = DEFAULT_INDENTATION.detectIndentation;
			if (config.editor && typeof config.editor.detectIndentation !== 'undefined') {
				detectIndentation = (config.editor.detectIndentation === 'false' ? false : Boolean(config.editor.detectIndentation));
			}

			this._setModelOptions({
				tabSize: tabSize,
				insertSpaces: insertSpaces,
				detectIndentation: detectIndentation,
				defaultEOL: newDefaultEOL,
				trimAutoWhitespace: trimAutoWhitespace
			});


			if (shouldShowMigrationMessage && !this._hasShownMigrationMessage) {
				this._hasShownMigrationMessage = true;
				this._messageService.show(Severity.Info, nls.localize('indentAutoMigrate', "Please update your settings: `editor.detectIndentation` replaces `editor.tabSize`: \"auto\" or `editor.insertSpaces`: \"auto\""));
			}
		};

		this._configurationServiceSubscription = this._configurationService.onDidUpdateConfiguration(e => {
			readConfig(e.config);
		});
		readConfig(this._configurationService.getConfiguration());
	}

	public getCreationOptions(): editorCommon.ITextModelCreationOptions {
		return this._modelCreationOptions;
	}

	private _setModelOptions(newOpts: editorCommon.ITextModelCreationOptions): void {
		if (
			(this._modelCreationOptions.detectIndentation === newOpts.detectIndentation)
			&& (this._modelCreationOptions.insertSpaces === newOpts.insertSpaces)
			&& (this._modelCreationOptions.tabSize === newOpts.tabSize)
			&& (this._modelCreationOptions.trimAutoWhitespace === newOpts.trimAutoWhitespace)
		) {
			// Same indent opts, no need to touch created models
			this._modelCreationOptions = newOpts;
			return;
		}
		this._modelCreationOptions = newOpts;

		// Update options on all models
		let keys = Object.keys(this._models);
		for (let i = 0, len = keys.length; i < len; i++) {
			let modelId = keys[i];
			let modelData = this._models[modelId];

			if (this._modelCreationOptions.detectIndentation) {
				modelData.model.detectIndentation(this._modelCreationOptions.insertSpaces, this._modelCreationOptions.tabSize);
				modelData.model.updateOptions({
					trimAutoWhitespace: this._modelCreationOptions.trimAutoWhitespace
				});
			} else {
				modelData.model.updateOptions({
					insertSpaces: this._modelCreationOptions.insertSpaces,
					tabSize: this._modelCreationOptions.tabSize,
					trimAutoWhitespace: this._modelCreationOptions.trimAutoWhitespace
				});
			}
		}
	}

	public dispose(): void {
		if (this._markerServiceSubscription) {
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

	private _cleanUp(model: editorCommon.IModel): void {
		// clean up markers for internal, transient models
		if (model.uri.scheme === network.Schemas.inMemory
			|| model.uri.scheme === network.Schemas.internal
			|| model.uri.scheme === network.Schemas.vscode) {
			if (this._markerService) {
				this._markerService.read({ resource: model.uri }).map(marker => marker.owner).forEach(owner => this._markerService.remove(owner, [model.uri]));
			}
		}
	}

	// --- begin IModelService

	private _createModelData(value: string | editorCommon.IRawText, modeOrPromise: TPromise<IMode> | IMode, resource: URI): ModelData {
		// create & save the model
		let model:Model;
		if (typeof value === 'string') {
			model = Model.createFromString(value, this._modelCreationOptions, modeOrPromise, resource);
		} else {
			model = new Model(value, modeOrPromise, resource);
		}
		let modelId = MODEL_ID(model.uri);

		if (this._models[modelId]) {
			// There already exists a model with this id => this is a programmer error
			throw new Error('ModelService: Cannot add model ' + anonymize(modelId) + ' because it already exists!');
		}

		let modelData = new ModelData(model, (modelData, events) => this._onModelEvents(modelData, events));
		this._models[modelId] = modelData;

		return modelData;
	}

	public createModel(value: string | editorCommon.IRawText, modeOrPromise: TPromise<IMode> | IMode, resource: URI): editorCommon.IModel {
		let modelData = this._createModelData(value, modeOrPromise, resource);

		// handle markers (marker service => model)
		if (this._markerService) {
			ModelMarkerHandler.setMarkers(modelData, this._markerService.read({ resource: modelData.model.uri }));
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

		let keys = Object.keys(this._models);
		for (let i = 0, len = keys.length; i < len; i++) {
			let modelId = keys[i];
			ret.push(this._models[modelId].model);
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

	private _onModelDisposing(model: editorCommon.IModel): void {
		let modelId = MODEL_ID(model.uri);
		let modelData = this._models[modelId];

		this._cleanUp(model);

		delete this._models[modelId];
		modelData.dispose();

		this._onModelRemoved.fire(model);
	}

	private _onModelEvents(modelData: ModelData, events: EmitterEvent[]): void {

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
				this._onModelModeChanged.fire({
					model: modelData.model,
					oldModeId: (<editorCommon.IModelModeChangedEvent>e.getData()).oldMode.getId()
				});
			}
		}
	}
}
