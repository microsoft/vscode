/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, writeFileSync } from 'node:fs';
import http from 'node:http';

const args = process.argv.slice(2);
const value = (name: string): string => {
	const result = args.find(argument => argument.startsWith(`${name}=`))?.slice(name.length + 1);
	if (result === undefined) {
		throw new Error(`Missing fixture argument: ${name}`);
	}
	return result;
};
writeFileSync(value('--fixture-started'), JSON.stringify(args));
if (args.includes('--fixture-exit-before-ready')) {
	process.exit(17);
}
let listening = false;
const server = http.createServer((_request, response) => {
	response.end(JSON.stringify({ webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/fixture' }));
});
setInterval(() => {
	if (!listening && existsSync(value('--fixture-ready'))) {
		listening = true;
		server.listen(Number(value('--remote-debugging-port')), '127.0.0.1');
	}
	if (existsSync(value('--fixture-exit'))) {
		process.exit(23);
	}
}, 25);
