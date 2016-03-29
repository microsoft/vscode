/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {DefaultWorkerFactory} from 'vs/base/worker/defaultWorkerFactory';
import {SimpleWorkerClient} from 'vs/base/common/worker/simpleWorker';
import {IModelService} from 'vs/editor/common/services/modelService';
import {Defaults} from '../typescript';
import registerLanguageFeatures from '../languageFeatures';
import AbstractWorker from './worker';

export function create(selector: string, modelService: IModelService) {

	const factory = new DefaultWorkerFactory();
	let client: SimpleWorkerClient<AbstractWorker>;
	let handle: number;

	const worker = () => {

		if (!client) {
			client = new SimpleWorkerClient<AbstractWorker>(
				factory,
				'vs/languages/typescript/common/worker/workerImpl',
				AbstractWorker);

			handle = setInterval(() => {
				if (Date.now() - client.getLastRequestTimestamp() > 1000 * 60 * 5) {
					dispose();
				}
			}, 1000 * 60);

			client.get().acceptCompilerOptions(Defaults.getCompilerOptions());
			let subscription = Defaults.onDidChangeCompilerOptions(options => client.get().acceptCompilerOptions(options));

			function dispose() {
				subscription.dispose();
				clearTimeout(handle);
				client.dispose();
				client = undefined;
			}
		}

		let result = client.get();
		// return TPromise.as(result);

		let promises = modelService.getModels().map(model => {
			return TPromise.as(result.acceptNewModel({
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

		return TPromise.join(promises).then(() => result);
	};

	// --- register features
	registerLanguageFeatures(selector, modelService, worker);

	return {
		dispose() {
			clearTimeout(handle);
			if (client) {
				client.dispose();
			}
		}
	};
}