/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {DefaultWorkerFactory} from 'vs/base/worker/defaultWorkerFactory';
import {SimpleWorkerClient} from 'vs/base/common/worker/simpleWorker';
import {IModelService} from 'vs/editor/common/services/modelService';
import {Defaults} from '../typescript';
import registerLanguageFeatures from '../languageFeatures';
import AbstractWorker from './worker';


class Client {

	private _client: TPromise<AbstractWorker> = null;
	private _clientDispose: IDisposable[];
	private _factory = new DefaultWorkerFactory();
	private _modelService: IModelService;

	constructor(modelService: IModelService) {
		this._modelService = modelService;
	}

	private _createClient(): TPromise<AbstractWorker> {
		let client = new SimpleWorkerClient<AbstractWorker>(
			this._factory,
			'vs/languages/typescript/common/worker/workerImpl',
			AbstractWorker);

		this._clientDispose = [];

		const handle = setInterval(() => {
			if (Date.now() - client.getLastRequestTimestamp() > 1000 * 60) {
				this._clientDispose = disposeAll(this._clientDispose);
				this._client = null;
				client = null;
			}
		}, 1000 * 60);

		this._clientDispose.push({ dispose() { clearInterval(handle); } });
		this._clientDispose.push(client);

		const worker = client.get();
		this._clientDispose.push(Defaults.onDidChangeCompilerOptions(options => worker.acceptCompilerOptions(options)));

		return worker.acceptCompilerOptions(Defaults.getCompilerOptions()).then(() => worker);
	}

	dispose(): void {
		this._clientDispose = disposeAll(this._clientDispose);
	}

	get(): TPromise<AbstractWorker> {
		if (!this._client) {
			this._client = this._createClient();
		}

		// TODO@joh use proper model sync
		return this._client.then(worker => {
			let promises = this._modelService.getModels().map(model => {
				return TPromise.as(worker.acceptNewModel({
					url: model.getAssociatedResource().toString(),
					versionId: model.getVersionId(),
					value: {
						EOL: model.getEOL(),
						lines: model.getLinesContent(),
						length: model.getValueLength(),
						BOM: undefined,
						options: undefined
					}
				}));
			});

			return TPromise.join(promises).then(() => worker);
		});
	}
}

export function create(selector: string, modelService: IModelService) {

	const client = new Client(modelService);
	const registration = registerLanguageFeatures(selector, modelService, () => client.get());

	return {
		dispose() {
			client.dispose();
			registration.dispose();
		}
	};
}