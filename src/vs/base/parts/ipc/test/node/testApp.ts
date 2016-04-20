/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { TestChannel } from './testService';

const server = new Server();
server.registerChannel('test', new TestChannel());