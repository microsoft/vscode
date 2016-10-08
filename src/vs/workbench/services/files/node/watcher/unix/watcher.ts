/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';

export interface IWatcherRequest {
	basePath: string;
	ignored: string[];
	verboseLogging: boolean;
}

export interface IWatcherService {
	watch(request: IWatcherRequest): TPromise<void>;
}
