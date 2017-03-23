/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IRequestOptions, IRequestContext, request, IRawRequestFunction } from 'vs/base/node/request';
import { RequestService as NodeRequestService } from 'vs/platform/request/node/requestService';
import { assign } from 'vs/base/common/objects';
import { net } from 'electron';

function getRawRequest(options: IRequestOptions): IRawRequestFunction {
	return net.request as any as IRawRequestFunction;
}

export class RequestService extends NodeRequestService {

	request(options: IRequestOptions): TPromise<IRequestContext> {
		return super.request(options, options => request(assign({}, options || {}, { getRawRequest })));
	}
}