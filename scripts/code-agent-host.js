/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const cp = require('child_process');
const path = require('path');
const minimist = require('minimist');

async function main() {
	const args = minimist(process.argv.slice(2), {
		boolean: ['help', 'enable-mock-agent', 'quiet', 'without-connection-token'],
		string: ['port', 'log', 'connection-token', 'connection-token-file'],
	});

	if (args.help) {
		console.log(
			'Usage: ./scripts/code-agent-host.sh [options]\n' +
			'\n' +
			'Options:\n' +
			'  --port <number>                Port to listen on (default: 8081, or VSCODE_AGENT_HOST_PORT env)\n' +
			'  --connection-token <token>      A secret that must be included with all requests\n' +
			'  --connection-token-file <path>  Path to a file containing the connection token\n' +
			'  --without-connection-token      Run without a connection token\n' +
			'  --enable-mock-agent            Enable the mock agent for testing\n' +
			'  --quiet                        Suppress logging output\n' +
			'  --log <level>                  Log level to use (trace, debug, info, warning, error, off)\n' +
			'  --help                         Show this help message',
		);
		return;
	}

	const port = args.port || process.env['VSCODE_AGENT_HOST_PORT'] || '8081';

	/** @type {string[]} */
	const serverArgs = ['--port', String(port)];
	if (args['enable-mock-agent']) {
		serverArgs.push('--enable-mock-agent');
	}
	if (args.quiet) {
		serverArgs.push('--quiet');
	}
	if (args.log) {
		serverArgs.push('--log', String(args.log));
	}
	if (args['connection-token']) {
		serverArgs.push('--connection-token', String(args['connection-token']));
	}
	if (args['connection-token-file']) {
		serverArgs.push('--connection-token-file', String(args['connection-token-file']));
	}
	if (args['without-connection-token']) {
		serverArgs.push('--without-connection-token');
	}

	const addr = await startServer(serverArgs);
	console.log(`Agent Host server listening on ${addr}`);
}

function startServer(programArgs) {
	return new Promise((resolve, reject) => {
		const env = { ...process.env };
		const entryPoint = path.join(
			__dirname,
			'..',
			'out',
			'vs',
			'platform',
			'agentHost',
			'node',
			'agentHostServerMain.js',
		);

		console.log(
			`Starting agent host server: ${entryPoint} ${programArgs.join(' ')}`,
		);
		const proc = cp.spawn(process.execPath, [entryPoint, ...programArgs], {
			env,
			stdio: [process.stdin, null, process.stderr],
		});
		proc.stdout.on('data', (data) => {
			const text = data.toString();
			process.stdout.write(text);
			const m = text.match(/READY:(\d+)/);
			if (m) {
				resolve(`ws://127.0.0.1:${m[1]}`);
			}
		});

		proc.on('exit', (code) => process.exit(code));

		process.on('exit', () => proc.kill());
		process.on('SIGINT', () => {
			proc.kill();
			process.exit(128 + 2);
		});
		process.on('SIGTERM', () => {
			proc.kill();
			process.exit(128 + 15);
		});
	});
}

main();
