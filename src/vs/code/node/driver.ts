/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDriver, DriverChannelClient } from 'vs/code/common/driver';
import { connect as connectNet } from 'vs/base/parts/ipc/node/ipc.net';

export async function connect(handle: string): TPromise<IDriver> {
	const client = await connectNet(handle, 'driverClient');
	const channel = client.getChannel('driver');
	return new DriverChannelClient(channel);
}
