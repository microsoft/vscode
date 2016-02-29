/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {RunOnceScheduler} from 'vs/base/common/async';
import {IEmitterEvent} from 'vs/base/common/eventEmitter';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {IMirrorModel} from 'vs/editor/common/editorCommon';
import {IResourceAddedEvent, IResourceRemovedEvent, IResourceService, ResourceEvents} from 'vs/editor/common/services/resourceService';

interface IValidationHelperFilter {
	(resource:IMirrorModel): boolean;
}

export interface IValidationHelperCallback {
	(toValidate:URI[]): void;
}

class ValidationModel implements IDisposable {

	private _toDispose: IDisposable[];
	private _changeCallback: (model:ValidationModel)=>void;
	private _model: IMirrorModel;
	private _isDirty: boolean;

	public constructor(model: IMirrorModel, changeCallback:(model:ValidationModel)=>void) {
		this._toDispose = [];
		this._changeCallback = changeCallback;
		this._model = model;
		this._isDirty = false;
		this._toDispose.push({
			dispose: model.addBulkListener((events) => this._onModelChanged(events))
		});
	}

	public dispose(): void {
		this._toDispose = disposeAll(this._toDispose);
		this._changeCallback = null;
	}

	public markAsClean(): void {
		this._isDirty = false;
	}

	public markAsDirty(): void {
		this._isDirty = true;
	}

	public isDirty(): boolean {
		return this._isDirty;
	}

	public getMirrorModel(): IMirrorModel {
		return this._model;
	}

	private _onModelChanged(events:IEmitterEvent[]): void {
		var containsChanged = false;
		for (var i = 0; !containsChanged && i < events.length; i++) {
			if (events[i].getType() === 'changed') {
				containsChanged = true;
			}
		}
		if (containsChanged) {
			this._changeCallback(this);
		}
	}
}

export class ValidationHelper implements IDisposable {

	private _toDispose:IDisposable[];

	private _isEnabled:boolean;
	private _validate:RunOnceScheduler;
	private _resourceService:IResourceService;
	private _callback:IValidationHelperCallback;
	private _filter:IValidationHelperFilter;
	private _validationDelay:number;
	private _models:{[url:string]:ValidationModel;};
	private _isDueToConfigurationChange:boolean;

	public constructor(resourceService:IResourceService, modeId: string, callback:IValidationHelperCallback) {
		this._toDispose = [];
		this._resourceService = resourceService;
		this._callback = callback;
		this._filter = (resource) => (resource.getMode().getId() === modeId);
		this._validationDelay = 500;
		this._models = {};
		this._isDueToConfigurationChange = false;

		this._toDispose.push(this._resourceService.addListener2_(ResourceEvents.ADDED, (e) => {
			this._onResourceAdded(e);
		}));

		this._toDispose.push(this._resourceService.addListener2_(ResourceEvents.REMOVED, (e) => {
			this._onResourceRemoved(e);
		}));

		this._validate = new RunOnceScheduler(() => this._invokeCallback(), this._validationDelay);
		this._toDispose.push(this._validate);

		this._resourceService.all().forEach((element) => this._addElement(element));
	}

	public dispose(): void {
		this._toDispose = disposeAll(this._toDispose);

		disposeAll(Object.keys(this._models).map((modelUrl) => this._models[modelUrl]));
		this._models = null;
	}

	public trigger(): void {
		this._validate.schedule();
	}

	public triggerDueToConfigurationChange(): void {
		this._isDueToConfigurationChange = true;
		this._validate.schedule();
	}

	private _addElement(element:IMirrorModel): void {
		if (!this._filter(element)) {
			return;
		}

		var model = <IMirrorModel>element;

		var validationModel = new ValidationModel(model, (model) => this._onChanged(model));
		this._models[model.getAssociatedResource().toString()] = validationModel;
		this._onChanged(validationModel);
	}

	private _onResourceAdded(e:IResourceAddedEvent): void {
		var stringUrl = e.url.toString();

		if (this._models.hasOwnProperty(stringUrl)) {
			this._models[stringUrl].dispose();
		}

		this._addElement(e.addedElement);
	}

	private _onResourceRemoved(e:IResourceRemovedEvent): void {
		var stringUrl = e.url.toString();

		if (this._models.hasOwnProperty(stringUrl)) {
			this._models[stringUrl].dispose();
			delete this._models[stringUrl];
		}
	}

	private _onChanged(model:ValidationModel): void {
		model.markAsDirty();
		this._validate.schedule();
	}

	private _invokeCallback(): void {
		if (!this._isEnabled) {
			return;
		}

		var dirtyModels: URI[] = [];
		var cleanModels: URI[] = [];

		Object.keys(this._models)
			.map((modelUrl) => this._models[modelUrl])
			.forEach((model) => {
				if (model.isDirty()) {
					dirtyModels.push(model.getMirrorModel().getAssociatedResource());
					model.markAsClean();
				} else {
					cleanModels.push(model.getMirrorModel().getAssociatedResource());
				}
			});

		var isDueToConfigurationChange = this._isDueToConfigurationChange;
		this._isDueToConfigurationChange = false;

		let toValidate: URI[] = dirtyModels;
		if (isDueToConfigurationChange) {
			toValidate = toValidate.concat(cleanModels);
		}

		this._callback(toValidate);
	}

	public enable(): void {
		this._isEnabled = true;
		this.trigger();
	}
}
