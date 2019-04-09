/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRequestHandler } from 'vs/base/common/worker/simpleWorker';


class ExtensionWorker implements IRequestHandler {

	readonly _requestHandlerBrand: any;

	constructor() {
		console.log('HERE');
	}
}

export function create(): IRequestHandler {
	return new ExtensionWorker();
}
