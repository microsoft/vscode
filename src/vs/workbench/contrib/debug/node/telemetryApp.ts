/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { AppInsightsAppender } from 'vs/platform/telemetry/node/appInsightsAppender';
import { TelemetryAppenderChannel } from 'vs/platform/telemetry/node/telemetryIpc';

const appender = new AppInsightsAppender(process.argv[2], JSON.parse(process.argv[3]), process.argv[4]);
process.once('exit', () => appender.flush());

const channel = new TelemetryAppenderChannel(appender);
const server = new Server('telemetry');
server.registerChannel('telemetryAppender', channel);
