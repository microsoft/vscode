/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import http = require('vs/base/common/http');
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IRequestService = createDecorator<IRequestService>('requestService');

export interface IRequestService {
	_serviceBrand: any;

	/**
	 * Wraps the call into WinJS.XHR to allow for mocking and telemetry. Use this instead
	 * of calling WinJS.XHR directly.
	 */
	makeRequest(options: http.IXHROptions): TPromise<http.IXHRResponse>;
}