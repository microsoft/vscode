/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Server } from 'vs/base/node/service.cp';
import {ChokidarWatcherService} from 'vs/workbench/services/files/node/watcher/unix/chokidarWatcherService';

const server = new Server();
server.registerService('WatcherService', new ChokidarWatcherService());