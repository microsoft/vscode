/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Server } from '../../../../base/parts/ipc/node/ipc.cp.js';
import { TelemetryAppenderChannel } from '../../../../platform/telemetry/common/telemetryIpc.js';
import { OneDataSystemAppender } from '../../../../platform/telemetry/node/1dsAppender.js';

const appender = new OneDataSystemAppender(undefined, false, process.argv[2], JSON.parse(process.argv[3]), process.argv[4]);
process.once('exit', () => appender.flush());

const channel = new TelemetryAppenderChannel([appender]);
const server = new Server('telemetry');
server.registerChannel('telemetryAppender', channel);
