/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import http = require('vs/base/common/http');
import winjs = require('vs/base/common/winjs.base');
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export var IRequestService = createDecorator<IRequestService>('requestService');

export interface IRequestService {
	serviceId : ServiceIdentifier<any>;

	/**
	 * Returns the URL that can be used to access the provided service. The optional second argument can
	 * be provided to narrow down the request URL to a specific file system resource. The third argument
	 * allows to specify to return a fully absolute server URL.
	 */
	getRequestUrl(service:string, path?:string, absolute?:boolean):string;

	/**
	 * Returns the path from the given requestUrl using the provided service identifier. The path will match
	 * the path that was passed in to IRequestService#getRequestUrl() or null if it can not be identified. Path
	 * always begins with a leading slash.
	 */
	getPath(service:string, requestUrl:URI):string;

	/**
	 * Wraps the call into WinJS.XHR to allow for mocking and telemetry. Use this instead
	 * of calling WinJS.XHR directly.
	 */
	makeRequest(options:http.IXHROptions):winjs.TPromise<http.IXHRResponse>;

	/**
	 * Executes a xhr request and expects a chunked response. The value callback of the
	 * returned promise receives an array of <code>IDataChunk</code> containing all chuncks
	 * recevied. The progress callback receives an array of <code>IDataChunk</code> containing
	 * the delta since the last progress callback.
	 */
	makeChunkedRequest(options:http.IXHROptions):winjs.TPromise<{request:http.IXHRResponse; chunks:http.IDataChunk[];}>;
}

