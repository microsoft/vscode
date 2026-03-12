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
		boolean: ['help', 'no-launch'],
		string: ['port'],
	});

	if (args.help) {
		console.log(
			'Usage: ./scripts/code-agent-host.sh [options]\n' +
				'\n' +
				'Options:\n' +
				'  --port <number>   Port to listen on (default: 8081, or VSCODE_AGENT_HOST_PORT env)\n' +
				'  --no-launch       Start server without additional actions\n' +
				'  --help            Show this help message',
		);
		return;
	}

	const port = args.port || process.env['VSCODE_AGENT_HOST_PORT'] || '8081';
	const addr = await startServer(['--port', String(port)]);
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
