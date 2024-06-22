/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createConnection, createServer } from '@volar/language-server/browser';
import { startServer } from '../htmlServer';

const connection = createConnection();
const server = createServer(connection);

startServer(server, connection);
