/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Server } from 'vs/base/node/service.cp';
import { TestService } from 'vs/base/test/node/service/testService';

const server = new Server();
server.registerService('TestService', new TestService());