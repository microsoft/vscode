/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import {IModel, EventType, IModelContentChangedEvent} from 'vs/editor/common/editorCommon';
import {ICompatWorkerService, ICompatMode} from 'vs/editor/common/services/compatWorkerService';
import {DefaultWorkerFactory} from 'vs/base/worker/defaultWorkerFactory';
import {WorkerClient} from 'vs/base/common/worker/workerClient';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';

export class MainThreadCompatWorkerService implements ICompatWorkerService {
	public _serviceBrand: any;
	public isInMainThread = true;

	private _workerFactory: DefaultWorkerFactory;
	private _worker: WorkerClient;
	private _workerCreatedPromise: TPromise<void>;
	private _triggerWorkersCreatedPromise: (value: void) => void;

	private _modelListeners: { [uri: string]: IDisposable };

	constructor(
		@IModelService modelService: IModelService
	) {
		this._workerFactory = new DefaultWorkerFactory(true);
		this._worker = null;
		this._workerCreatedPromise = new TPromise<void>((c, e, p) => {
			this._triggerWorkersCreatedPromise = c;
		}, () => {
			// Not cancelable
		});

		this._modelListeners = Object.create(null);

		const isInterestingModel = (model:IModel) => {
			if (model.isTooLargeForHavingARichMode()) {
				return false;
			}

			let modeId = model.getModeId();

			let compatModes = ModesRegistry.getCompatModes();
			for (let i = 0; i < compatModes.length; i++) {
				if (compatModes[i].id === modeId) {
					return true;
				}
			}

			return false;
		};

		const onModelAdded = (model:IModel) => {
			if (!isInterestingModel(model)) {
				return;
			}

			this._modelListeners[model.uri.toString()] = model.addBulkListener((events) => {
				let contentChangedEvents = (
					events
					.filter(e => e.getType() === EventType.ModelRawContentChanged)
					.map(e => <IModelContentChangedEvent>e.getData())
				);
				if (contentChangedEvents.length === 0) {
					return;
				}

				this._call('$', 'acceptModelEvents', [model.uri, { contentChanged: contentChangedEvents }]);
			});

			this._call('$', 'acceptNewModel', [{
				url: model.uri,
				versionId: model.getVersionId(),
				value: model.toRawText(),
				modeId: model.getMode().getId()
			}]);
		};

		const onModelRemoved = (model:IModel) => {
			if (this._modelListeners[model.uri.toString()]) {
				this._modelListeners[model.uri.toString()].dispose();
				delete this._modelListeners[model.uri.toString()];

				this._call('$', 'acceptDidDisposeModel', [model.uri]);
			}
		};

		modelService.onModelAdded(onModelAdded);
		modelService.onModelRemoved(onModelRemoved);
		modelService.onModelModeChanged(event => {
			onModelRemoved(event.model);
			onModelAdded(event.model);
		});
	}

	public registerCompatMode(compatMode:ICompatMode): void {
		this._call('$', 'instantiateCompatMode', [compatMode.getId()]);
	}

	public CompatWorker(obj: ICompatMode, methodName: string, target: Function, param: any[]): TPromise<any> {
		return this._call(obj.getId(), methodName, param);
	}

	private _ensureWorkers(): void {
		if (this._triggerWorkersCreatedPromise) {
			// Workers not created yet

			this._createWorker();

			let complete = this._triggerWorkersCreatedPromise;
			this._triggerWorkersCreatedPromise = null;
			complete(null);
		}
	}

	private _afterWorkers(): TPromise<void> {
		this._ensureWorkers();

		let shouldCancelPromise = false;

		return new TPromise<void>((c, e, p) => {

			// hide the initialize promise inside this
			// promise so that it won't be canceled by accident
			this._workerCreatedPromise.then(() => {
				if (!shouldCancelPromise) {
					c(null);
				}
			}, e, p);

		}, () => {
			// mark that this promise is canceled
			shouldCancelPromise = true;
		});
	}

	private _createWorker(isRetry:boolean = false): void {
		this._worker = new WorkerClient(
			this._workerFactory,
			'vs/editor/common/worker/editorWorkerServer'
		);
		this._worker.onModuleLoaded = this._worker.request('initialize', {
			modesRegistryData: {
				compatModes: ModesRegistry.getCompatModes(),
				languages: ModesRegistry.getLanguages()
			}
		}).then(() => {
			ModesRegistry.onDidAddCompatModes((m) => this._call('$', 'acceptCompatModes', [m]));
			ModesRegistry.onDidAddLanguages((m) => this._call('$', 'acceptLanguages', [m]));
		}, (err) => {
			this._worker.dispose();
			this._worker = null;
			if (isRetry) {
				console.warn('Creating the web worker already failed twice. Giving up!');
			} else {
				this._createWorker(true);
			}
		});
	}

	private _call(rpcId: string, methodName: string, args:any[]): TPromise<any> {
		return this._afterWorkers().then(_ => {
			if (this._worker === null) {
				throw new Error('Cannot fulfill request...');
			}
			return this._worker.request('request', {
				target: rpcId,
				methodName: methodName,
				args: args
			});
		});
	}
}
