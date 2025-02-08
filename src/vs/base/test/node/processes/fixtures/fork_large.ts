/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as processes from '../../../../node/processes.js';

const sender = processes.createQueuedSender(<any>process);

process.on('message', msg => {
	sender.send(msg);
	sender.send(msg);
	sender.send(msg);
	sender.send('done');
});

sender.send('ready');
