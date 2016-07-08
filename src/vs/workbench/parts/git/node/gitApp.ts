/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { createRawGitService } from './rawGitServiceBootstrap';
import { GitChannel } from 'vs/workbench/parts/git/common/gitIpc';

const server = new Server();
const service = createRawGitService(process.argv[2], process.argv[3], process.argv[4], process.argv[5], process.argv[6]);
const channel = new GitChannel(service);
server.registerChannel('git', channel);
