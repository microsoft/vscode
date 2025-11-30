/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getMonacoEnvironment } from '../../../../base/browser/browser.js';
import { WebWorkerDescriptor } from '../../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { WebWorkerService } from '../../../../platform/webWorker/browser/webWorkerServiceImpl.js';

export class StandaloneWebWorkerService extends WebWorkerService {
	protected override _createWorker(descriptor: WebWorkerDescriptor): Promise<Worker> {
		const monacoEnvironment = getMonacoEnvironment();
		if (monacoEnvironment) {
			if (typeof monacoEnvironment.getWorker === 'function') {
				const worker = monacoEnvironment.getWorker('workerMain.js', descriptor.label);
				if (worker !== undefined) {
					return Promise.resolve(worker);
				}
			}
		}

		return super._createWorker(descriptor);
	}

	override getWorkerUrl(descriptor: WebWorkerDescriptor): string {
		const monacoEnvironment = getMonacoEnvironment();
		if (monacoEnvironment) {
			if (typeof monacoEnvironment.getWorkerUrl === 'function') {
				const workerUrl = monacoEnvironment.getWorkerUrl('workerMain.js', descriptor.label);
				if (workerUrl !== undefined) {
					const absoluteUrl = new URL(workerUrl, document.baseURI).toString();
					return absoluteUrl;
				}
			}
		}

		if (!descriptor.esmModuleLocationBundler) {
			throw new Error(`You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker for the worker label: ${descriptor.label}`);
		}

		const url = typeof descriptor.esmModuleLocationBundler === 'function' ? descriptor.esmModuleLocationBundler() : descriptor.esmModuleLocationBundler;
		const urlStr = url.toString();
		return urlStr;
	}
}
