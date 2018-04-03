/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ID = 'driverService';
export const IDriverService = createDecorator<IDriverService>(ID);

export interface IWindow {
	id: string;
}

export interface IDriverService {
	_serviceBrand: any;
	getWindows(): TPromise<IWindow[]>;
}
