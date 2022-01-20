/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { generateUuid } from 'vs/base/common/uuid';
import { ServerParsedArgs } from 'vs/server/node/serverEnvironmentService';

const connectionTokenRegex = /^[0-9A-Za-z-]+$/;

export class ServerConnectionToken {
	constructor(
		public readonly value: string,
		public readonly isMandatory: boolean,
	) {
	}
}

export class ServerConnectionTokenParseError {
	constructor(
		public readonly message: string
	) {}
}

export function parseConnectionToken(args: ServerParsedArgs): ServerConnectionToken | ServerConnectionTokenParseError {
	const withoutConnectionToken = args['without-connection-token'];
	const connectionToken = args['connection-token'];
	const connectionTokenFile = args['connection-token-file'];
	const compatibility = (args['compatibility'] === '1.63');

	if (withoutConnectionToken) {
		if (typeof connectionToken !== 'undefined' || typeof connectionTokenFile !== 'undefined') {
			return new ServerConnectionTokenParseError(`Please do not use the argument '--connection-token' or '--connection-token-file' at the same time as '--without-connection-token'.`);
		}
		return new ServerConnectionToken('without-connection-token' /* to be implemented @alexd */, false);
	}

	if (typeof connectionTokenFile !== 'undefined') {
		if (typeof connectionToken !== 'undefined') {
			return new ServerConnectionTokenParseError(`Please do not use the argument '--connection-token' at the same time as '--connection-token-file'.`);
		}

		let rawConnectionToken: string;
		try {
			rawConnectionToken = fs.readFileSync(connectionTokenFile).toString().replace(/\r?\n$/, '');
		} catch (e) {
			return new ServerConnectionTokenParseError(`Unable to read the connection token file at '${connectionTokenFile}'.`);
		}

		if (!connectionTokenRegex.test(rawConnectionToken)) {
			return new ServerConnectionTokenParseError(`The connection token defined in '${connectionTokenFile} does not adhere to the characters 0-9, a-z, A-Z or -.`);
		}

		return new ServerConnectionToken(rawConnectionToken, true);
	}

	if (typeof connectionToken !== 'undefined') {
		if (!connectionTokenRegex.test(connectionToken)) {
			return new ServerConnectionTokenParseError(`The connection token '${connectionToken} does not adhere to the characters 0-9, a-z, A-Z or -.`);
		}

		if (compatibility) {
			// TODO: Remove this case soon
			return new ServerConnectionToken(connectionToken, false);
		}

		return new ServerConnectionToken(connectionToken, true);
	}

	if (compatibility) {
		// TODO: Remove this case soon
		console.log(`Breaking change in the next release: Please use one of the following arguments: '--connection-token', '--connection-token-file' or '--without-connection-token'.`);
		return new ServerConnectionToken(generateUuid(), false);
	}

	// TODO: fixme
	return new ServerConnectionToken(generateUuid(), false);
	// return new ServerConnectionTokenParseError(`Please use one of the following arguments: '--connection-token', '--connection-token-file' or '--without-connection-token'.`);
}
