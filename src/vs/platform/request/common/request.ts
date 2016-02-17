/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import http = require('vs/base/common/http');
import winjs = require('vs/base/common/winjs.base');
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export const IRequestService = createDecorator<IRequestService>('requestService');

export interface IRequestService {
	serviceId: ServiceIdentifier<any>;

	/**
	 * Wraps the call into WinJS.XHR to allow for mocking and telemetry. Use this instead
	 * of calling WinJS.XHR directly.
	 */
	makeRequest(options: http.IXHROptions): winjs.TPromise<http.IXHRResponse>;

	/**
	 * Executes a xhr request and expects a chunked response. The value callback of the
	 * returned promise receives an array of <code>IDataChunk</code> containing all chuncks
	 * recevied. The progress callback receives an array of <code>IDataChunk</code> containing
	 * the delta since the last progress callback.
	 */
	makeChunkedRequest(options: http.IXHROptions): winjs.TPromise<{ request: http.IXHRResponse; chunks: http.IDataChunk[]; }>;
}