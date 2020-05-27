/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProtocolConnection, createProtocolConnection, Logger, createConnection, InitializeParams, WatchDog } from 'vscode-languageserver';
import { startServer } from '../cssServer';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-jsonrpc/lib/browser/main';

declare let self: any;

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const watchDog: WatchDog = {
	shutdownReceived: false,
	initialize(_params: InitializeParams): void { },
	exit(_code: number): void { }
};

const connectionFactory = (logger: Logger): ProtocolConnection => {
	return createProtocolConnection(messageReader, messageWriter, logger);
};
const connection = createConnection(connectionFactory, watchDog);

startServer(connection, {});
