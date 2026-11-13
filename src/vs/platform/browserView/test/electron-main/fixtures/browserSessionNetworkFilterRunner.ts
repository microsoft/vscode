/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../../../bootstrap-esm.js';
import { app } from 'electron';
import Mocha from 'mocha';
import { pathToFileURL } from 'url';

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');
void app.whenReady().then(async () => {
	const mocha = new Mocha({ ui: 'tdd', grep: process.argv[3], timeout: 5000 });
	mocha.reporter('json', { output: process.argv[4] });
	mocha.suite.emit('pre-require', globalThis, process.argv[2], mocha);
	await import(pathToFileURL(process.argv[2]).href);
	mocha.run(failures => app.exit(failures ? 1 : 0));
}).catch(error => {
	console.error(error);
	app.exit(1);
});
