/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Server } from 'vs/base/node/service.cp';
import {SearchService} from 'vs/workbench/services/search/node/rawSearchService';

const server = new Server();
server.registerService('SearchService', new SearchService());