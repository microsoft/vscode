/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IRequestService = createDecorator<IRequestService>('requestService2');

export interface IRequestService {
	_serviceBrand: any;

	request(options, token: CancellationToken): Promise<object>;
}

export class SimpleRequestService implements IRequestService {

	_serviceBrand: any;

	request(options, token: CancellationToken): Promise<object> {
		return Promise.resolve(Object.create(null));
	}
}