/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';

export async function findAvailablePort(excluding: Array<number>, maxTries: number): Promise<number> {
	const portmin = 41952;
	const portmax = 65536;
	const nextPort = findAvailablePort;

	return new Promise((resolve, reject) => {
		let candidate = 0;
		do {
			candidate = Math.floor(Math.random() * (portmax - portmin) + portmin);
		} while (excluding.includes(candidate));

		const test = net.createServer();

		test.once('error', function (err) {
			if (maxTries < 1) {
				reject(err);
			}

			resolve(nextPort(excluding, maxTries - 1));
		});

		test.once('listening', function () {
			test.once('close', function () {
				excluding.push(candidate);
				resolve(candidate);
			});
			test.close();
		});

		test.listen(candidate, 'localhost');
	});
}
