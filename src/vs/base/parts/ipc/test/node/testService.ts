/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';

export class TestService {

	pong(ping:string): TPromise<{ incoming:string, outgoing:string }> {
		return TPromise.as({ incoming: ping, outgoing: 'pong' });
	}

	cancelMe(): TPromise<boolean> {
		return TPromise.timeout(100).then(() => true);
	}
}