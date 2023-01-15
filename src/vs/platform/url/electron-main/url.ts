/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IWindowOpenable, IOpenEmptyWindowOptions } from 'vs/platform/window/common/window';

export interface IProtocolUrl {

	/**
	 * The parsed URI from the raw URL.
	 */
	readonly uri: URI;

	/**
	 * The raw URL that was passed in.
	 */
	readonly originalUrl: string;
}

/**
 * Protocol URLs that are passed in on startup.
 */
export interface IInitialProtocolUrls {

	/**
	 * Initial protocol URLs to handle that are not
	 * already converted to `IWindowOpenable` or empty
	 * window instances.
	 *
	 * These URLs will be handled by the URL service
	 * in the active window (i.e. forwarded to extensions).
	 */
	readonly urls: IProtocolUrl[];

	/**
	 * Initial protocol URLs that result in direct
	 * `IWindowOpenable` or empty instances. These
	 * are either handled directly by the window
	 * when opening or within the empty window.
	 */
	readonly openables: (IWindowOpenable | IOpenEmptyWindowOptions)[];
}
