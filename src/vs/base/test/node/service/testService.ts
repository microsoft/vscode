/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');

export class TestService {
	public pong(ping:string): winjs.TPromise<{ incoming:string, outgoing:string }> {
		return winjs.TPromise.as({
			incoming: ping,
			outgoing: 'pong'
		});
	}

	public cancelMe(): winjs.TPromise<boolean> {
		return winjs.TPromise.timeout(100).then(() => {
			return true;
		});
	}
}