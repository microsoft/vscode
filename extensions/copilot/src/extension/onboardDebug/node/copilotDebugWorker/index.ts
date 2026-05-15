/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'os';
import * as readline from 'readline';
import * as path from '../../../../util/vs/base/common/path';
import { openVscodeUri } from './open';
import { SimpleRPC } from './rpc';
import { IStartOptions } from './shared';

// ⚠️⚠️⚠️
// This file is built into a standlone bundle, executed in a worker.
// Avoid including unnecessary dependencies!
//
// This is used on macOS and Linux. On Windows, you'll need to make changes
// in copilotDebugWorker.ps1 instead. This is because Electron on Windows
// is not built with support for console stdin.
// ⚠️⚠️⚠️

const [_node, _script, callbackUrl, remoteCommand, ...args] = process.argv;

const enum Flags {
	Print = '--print',
	NoCache = '--no-cache',
	Help = '--help',
	Save = '--save',
	Once = '--once',
}

const flagConfig = {
	[Flags.Print]: false,
	[Flags.NoCache]: false,
	[Flags.Help]: false,
	[Flags.Save]: false,
	[Flags.Once]: false,
};

while (args.length && flagConfig.hasOwnProperty(args[0])) {
	flagConfig[args.shift() as Flags] = true;
}

if (!args.length || flagConfig[Flags.Help]) {
	console.log(`Usage: copilot-debug [${Object.keys(flagConfig).join('] [')}] <command> <args...>`);
	console.log('');
	console.log('Options:');
	console.log('  --print     Print the generated configuration without running it');
	console.log('  --no-cache  Generate a new configuration without checking the cache.');
	console.log('  --save      Save the configuration to your launch.json.');
	console.log('  --once      Exit after the debug session ends.');
	console.log('  --help      Print this help.');
	process.exit(flagConfig[Flags.Help] ? 0 : 1);
}

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

const server = createServer(socket => {
	clearInterval(waitingMessage);

	const rpc = new SimpleRPC(socket);
	rpc.registerMethod('output', ({ category, output }) => {
		if (category === 'stderr') {
			process.stderr.write(output);
		} else if (category === 'stdout') {
			process.stdout.write(output);
		} else if (category !== 'telemetry' && output) {
			console.log(output); // so that a newline is added
		}

		return Promise.resolve();
	});

	rpc.registerMethod('exit', async ({ code, error }) => {
		if (error && !triedToStop) {
			console.error(error);
		}

		await Promise.all([
			new Promise<void>(resolve => process.stdout.end(resolve)),
			new Promise<void>(resolve => process.stderr.end(resolve)),
		]).then(() => process.exit(code));
	});

	let triedToStop = false;
	function onInterrupt() {
		if (triedToStop) {
			process.exit(1);
		} else {
			triedToStop = true;
			socket.end(() => {
				process.exit(1);
			});
		}
	}

	process.on('SIGINT', onInterrupt);
	process.stdin.on('keypress', (_str, key) => {
		if (key.sequence === '\x03' || (key.name === 'c' && (key.ctrl || key.meta))) {
			onInterrupt();
		}
	});

	rpc.registerMethod('question', (r: { message: string; defaultValue: string; singleKey?: boolean }) => {
		return new Promise((resolve) => {
			if (r.singleKey) {
				console.log(r.message);

				const onKeyPress = (str: string | undefined) => {
					if (str) {
						process.stdout.write('\x08');
						process.stdin.off('keypress', onKeyPress);
						resolve(str === '\n' || str === '\r' ? 'Enter' : (str?.toUpperCase() || ''));
					}
				};

				process.stdin.on('keypress', onKeyPress);
			} else {
				rl.question(`${r.message} [${r.defaultValue}] `, resolve);
			}
		});
	});

	rpc.registerMethod('confirm', (r: { message: string; defaultValue: boolean }) => {
		return new Promise((resolve) => {
			rl.question(`${r.message} [${r.defaultValue ? 'Y/n' : 'y/N'}] `, (answer) => {
				resolve(answer === '' ? r.defaultValue : answer.toLowerCase()[0] === 'y');
			});
		});
	});

	const opts: IStartOptions = {
		cwd: process.cwd(),
		args,
		forceNew: flagConfig[Flags.NoCache],
		printOnly: flagConfig[Flags.Print],
		save: flagConfig[Flags.Save],
		once: flagConfig[Flags.Once],
	};

	rpc.callMethod('start', opts);
});

const waitingMessage = setInterval(() => {
	console.log('> Waiting for VS Code to connect...');
}, 2000);

const pipeName = `copilot-dbg.${process.pid}-${randomBytes(4).toString('hex')}.sock`;
const pipePath = path.join(process.platform === 'win32' ? '\\\\.\\pipe\\' : tmpdir(), pipeName);

server.listen(pipePath, () => {
	openVscodeUri(remoteCommand, callbackUrl + (process.platform === 'win32' ? `/${pipeName}` : pipePath)).then(
		() => {
			// no-op
		},
		error => {
			console.error('Failed to open the activation URI:', error);
			process.exit(1);
		}
	);
});
