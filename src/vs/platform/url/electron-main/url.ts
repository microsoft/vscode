/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { IWindowOpenable } from '../../window/common/window.js';

export interface IProtocolUrl {

	/**
	 * The parsed URI from the raw URL.
	 */
	uri: URI;

	/**
	 * The raw URL that was passed in.
	 */
	originalUrl: string;
}

/**
 * A special set of protocol URLs that are to be handled
 * right on startup. Handling is complex depending on the
 * form of the protocol URL:
 *
 * On the high level, there are 2 types of protocol URLs:
 * - those that need to be handled within a window because
 *   they need to be forwarded to an extension for example
 * - those that can be handled directly as window to open
 *
 * The former can be of the form:
 * ```
 * <protocol>://<extension.id>/<path>
 * ```
 * and the latter are of the form
 *
 * ```
 * <protocol>:/<file | vscode-remote>/<path>
 * ```
 *
 * On top of that, protocol URLs can indicate to be handled in
 * a new empty window or not via the `windowId` parameter. If that
 * parameter is set to `_blank`, the URL should be handled not in
 * the existing window but a new window. This is only supported
 * for protocol URLs that need to be handled within a window.
 *
 * This interface splits the protocol links up into the 2 groups:
 * - `urls` are the protocol URLs that need to be handled in a window
 * - `openables` are windows that should open for the protocol URLs
 *
 * The decision is made as follows:
 * - a URL with authority `file` or `vscode-remote` becomes an `IWindowOpenable`
 *   and will not be included in the `urls` array because it was fully handled
 * - a URL with any other authority will be added to the `urls` array
 */
export interface IInitialProtocolUrls {

	/**
	 * Initial protocol URLs to handle that are not
	 * already converted to `IWindowOpenable` window
	 * instances.
	 *
	 * These URLs will be handled by the URL service
	 * in the active or a new empty window (if `windowId`
	 * is set to `_blank`).
	 */
	readonly urls: IProtocolUrl[];

	/**
	 * Initial protocol URLs that result in direct
	 * windows to open.
	 */
	readonly openables: IWindowOpenable[];
}
