/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { generateUuid } from 'vs/base/common/uuid';
import { ServerParsedArgs } from 'vs/server/serverEnvironmentService';

const connectionTokenRegex = /^[0-9A-Za-z-]+$/;

export function parseConnectionToken(args: ServerParsedArgs): { connectionToken: string; connectionTokenIsMandatory: boolean; } {

	let connectionToken = args['connection-token'];
	const connectionTokenFile = args['connection-token-file'];
	const compatibility = args['compatibility'] === '1.63';

	if (args['without-connection-token']) {
		if (connectionToken || connectionTokenFile) {
			console.warn(`Please do not use the argument '--connection-token' or '--connection-token-file' at the same time as '--without-connection-token'.`);
			process.exit(1);
		}
		return { connectionToken: 'without-connection-token' /* to be implemented @alexd */, connectionTokenIsMandatory: false };
	}

	if (connectionTokenFile) {
		if (connectionToken) {
			console.warn(`Please do not use the argument '--connection-token' at the same time as '--connection-token-file'.`);
			process.exit(1);
		}
		try {
			let rawConnectionToken = fs.readFileSync(connectionTokenFile).toString();
			rawConnectionToken = rawConnectionToken.replace(/\r?\n$/, '');
			if (!connectionTokenRegex.test(rawConnectionToken)) {
				console.warn(`The connection token defined in '${connectionTokenFile} does not adhere to the characters 0-9, a-z, A-Z or -.`);
				process.exit(1);
			}
			return { connectionToken: rawConnectionToken, connectionTokenIsMandatory: true };
		} catch (e) {
			console.warn(`Unable to read the connection token file at '${connectionTokenFile}'.`);
			process.exit(1);
		}

	} else {
		if (connectionToken !== undefined && !connectionTokenRegex.test(connectionToken)) {
			console.warn(`The connection token '${connectionToken}' does not adhere to the characters 0-9, a-z, A-Z or -.`);
			process.exit(1);
		} else if (connectionToken === undefined) {
			connectionToken = generateUuid();
			console.log(`Connection token: ${connectionToken}`);
			if (compatibility) {
				console.log(`Connection token or will made mandatory in the next release. To run without connection token, use '--without-connection-token'.`);
			}
		}
		return { connectionToken, connectionTokenIsMandatory: !compatibility };
	}
}
