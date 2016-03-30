/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {DefaultWorkerFactory} from 'vs/base/worker/defaultWorkerFactory';
import {SimpleWorkerClient} from 'vs/base/common/worker/simpleWorker';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IModelService} from 'vs/editor/common/services/modelService';
import {EditorModelManager} from 'vs/editor/common/services/editorWorkerServiceImpl';
import {Defaults} from '../typescript';
import {register} from '../languageFeatures';
import AbstractWorker from './worker';

class Client {

	private _client: TPromise<{ worker: AbstractWorker; manager: EditorModelManager }> = null;
	private _clientDispose: IDisposable[] = [];
	private _factory = new DefaultWorkerFactory();
	private _modelService: IModelService;

	constructor(modelService: IModelService) {
		this._modelService = modelService;
	}

	private _createClient(): TPromise<{ worker: AbstractWorker; manager: EditorModelManager; }> {

		const client = new SimpleWorkerClient<AbstractWorker>(this._factory, 'vs/languages/typescript/common/worker/workerImpl', AbstractWorker);
		const manager = new EditorModelManager(client.get(), this._modelService, true);

		this._clientDispose.push(manager);
		this._clientDispose.push(client);

		const stopWorker = () => {
			this._clientDispose = disposeAll(this._clientDispose);
			this._client = null;
		};

		// stop worker after being idle
		const handle = setInterval(() => {
			if (Date.now() - client.getLastRequestTimestamp() > 1000 * 60) {
				stopWorker();
			}
		}, 1000 * 60);
		this._clientDispose.push({ dispose() { clearInterval(handle); } });

		// stop worker when defaults change
		this._clientDispose.push(Defaults.onDidChange(() => stopWorker()));

		// send default to worker right away
		const worker = client.get();
		const {compilerOptions, extraLibs} = Defaults;
		return worker.acceptDefaults(compilerOptions, extraLibs).then(() =>({ worker, manager }));
	}

	dispose(): void {
		this._clientDispose = disposeAll(this._clientDispose);
		this._client = null;
	}

	get(resources: URI[]): TPromise<AbstractWorker> {
		if (!this._client) {
			this._client = this._createClient();
		}

		return this._client
			.then(data => data.manager.withSyncedResources(resources)
				.then(_ => data.worker));
	}
}

export function create(selector: string, modelService: IModelService, markerService: IMarkerService) {

	const client = new Client(modelService);
	const registration = register(modelService, markerService, selector,
		(first: URI, ...more: URI[]) => client.get([first].concat(more)));

	return {
		dispose() {
			client.dispose();
			registration.dispose();
		}
	};
}