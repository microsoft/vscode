/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';

export const IURLService = createDecorator<IURLService>('urlService');

export interface IURLHandler {
	handleURL(uri: URI): Promise<boolean>;
}

export interface IURLService {

	_serviceBrand: undefined;

	/**
	 * Create a URL that can be called to trigger IURLhandlers.
	 * The URL that gets passed to the IURLHandlers carries over
	 * any of the provided IURLCreateOption values.
	 */
	create(options?: Partial<UriComponents>): URI;

	open(url: URI): Promise<boolean>;

	registerHandler(handler: IURLHandler): IDisposable;
}
