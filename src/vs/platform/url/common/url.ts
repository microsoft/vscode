/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';

export const ID = 'urlService';
export const IURLService = createDecorator<IURLService>(ID);

export interface IURLHandler {
	handleURL(uri: URI): TPromise<boolean>;
}

export interface IURLService {
	_serviceBrand: any;

	open(url: URI): TPromise<boolean>;
	registerHandler(handler: IURLHandler): IDisposable;
}
