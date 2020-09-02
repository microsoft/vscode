/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';

function fatal(err: any): void {
	console.error(err);
	process.exit(1);
}

async function main(argv: string[]): Promise<void> {
	if (!process.env['GITPOD_REMOTE_CLI_IPC']) {
		return fatal('Missing pipe');
	}
	if (argv[2] === '--preview' && argv[3]) {
		try {
			await new Promise<void>((resolve, reject) => {
				const req = http.request({
					socketPath: process.env['GITPOD_REMOTE_CLI_IPC'],
					method: 'POST',
				}, res => {
					const chunks: string[] = [];
					res.setEncoding('utf8');
					res.on('data', d => chunks.push(d));
					res.on('end', () => {
						const result = chunks.join('');
						if (res.statusCode !== 200) {
							reject(new Error(`Bad status code: ${res.statusCode}: ${result}`));
						} else {
							resolve(undefined);
						}
					});
				});
				req.on('error', err => reject(err));
				req.write(JSON.stringify({
					type: 'preview',
					url: argv[3]
				}));
				req.end();
			});
		} catch (e) {
			fatal(e);
		}
	}
}

main(process.argv);
