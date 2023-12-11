/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { net } from 'electron';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IRequestContext, IRequestOptions } from 'vs/base/parts/request/common/request';
import { IRawRequestFunction, RequestService as NodeRequestService } from 'vs/platform/request/node/requestService';

function getRawRequest(options: IRequestOptions): IRawRequestFunction {
	return net.request as any as IRawRequestFunction;
}

export class RequestMainService extends NodeRequestService {

	override request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		return super.request({ ...(options || {}), getRawRequest, isChromiumNetwork: true }, token);
	}
}
