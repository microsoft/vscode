/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';

export const IURLService = createDecorator<IURLService>('urlService');

export interface IURLHandler {
	handleURL(uri: URI): Thenable<boolean>;
}

export interface IURLService {
	_serviceBrand: any;

	open(url: URI): Thenable<boolean>;
	registerHandler(handler: IURLHandler): IDisposable;
}
