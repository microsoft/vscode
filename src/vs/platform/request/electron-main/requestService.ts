/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRequestOptions, IRequestContext } from 'vs/platform/request/common/request';
import { RequestService as NodeRequestService, IRawRequestFunction } from 'vs/platform/request/node/requestService';
import { assign } from 'vs/base/common/objects';
import { net } from 'electron';
import { CancellationToken } from 'vs/base/common/cancellation';

function getRawRequest(options: IRequestOptions): IRawRequestFunction {
	return net.request as any as IRawRequestFunction;
}

export class RequestService extends NodeRequestService {

	request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		return super.request(assign({}, options || {}, { getRawRequest }), token);
	}
}
