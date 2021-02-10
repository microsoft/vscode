/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { PtyService } from 'vs/platform/terminal/node/ptyHost/ptyService';

const server = new Server('ptyHost');
const service = new PtyService();
server.registerChannel('ptyHost', ProxyChannel.fromService(service));
