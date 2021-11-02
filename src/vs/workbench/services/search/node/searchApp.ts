/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { SearchChannel } from './searchIpc';
import { SearchService } from './rawSearchService';

const server = new Server('search');
const service = new SearchService();
const channel = new SearchChannel(service);
server.registerChannel('search', channel);