/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IWebWorkerClient } from '../../../base/common/worker/webWorker.js';
import { WebWorkerDescriptor } from './webWorkerDescriptor.js';

export const IWebWorkerService = createDecorator<IWebWorkerService>('IWebWorkerService');

export interface IWebWorkerService {
	readonly _serviceBrand: undefined;

	createWorkerClient<T extends object>(workerDescriptor: WebWorkerDescriptor | Worker | Promise<Worker>): IWebWorkerClient<T>;

	getWorkerUrl(descriptor: WebWorkerDescriptor): string;
}
