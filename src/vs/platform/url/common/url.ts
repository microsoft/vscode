/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IURLService = createDecorator<IURLService>('urlService');

export interface IOpenURLOptions {

	/**
	 * If not provided or `false`, signals that the
	 * URL to open did not originate from the product
	 * but outside. As such, a confirmation dialog
	 * might be shown to the user.
	 */
	trusted?: boolean;

	originalUrl?: string;
}

export interface IURLHandler {
	handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean>;
}

export interface IURLService {

	readonly _serviceBrand: undefined;

	/**
	 * Create a URL that can be called to trigger IURLhandlers.
	 * The URL that gets passed to the IURLHandlers carries over
	 * any of the provided IURLCreateOption values.
	 */
	create(options?: Partial<UriComponents>): URI;

	open(url: URI, options?: IOpenURLOptions): Promise<boolean>;

	registerHandler(handler: IURLHandler): IDisposable;
}
