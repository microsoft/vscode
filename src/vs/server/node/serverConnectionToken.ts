/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { generateUuid } from 'vs/base/common/uuid';
import { ServerParsedArgs } from 'vs/server/node/serverEnvironmentService';

const connectionTokenRegex = /^[0-9A-Za-z-]+$/;

export const enum ServerConnectionTokenType {
	None,
	Optional,// TODO: Remove this soon
	Mandatory
}

export class NoneServerConnectionToken {
	public readonly type = ServerConnectionTokenType.None;

	public validate(connectionToken: any): boolean {
		return true;
	}
}

export class OptionalServerConnectionToken {
	public readonly type = ServerConnectionTokenType.Optional;

	constructor(public readonly value: string) {
	}

	public validate(connectionToken: any): boolean {
		return (connectionToken === this.value);
	}
}

export class MandatoryServerConnectionToken {
	public readonly type = ServerConnectionTokenType.Mandatory;

	constructor(public readonly value: string) {
	}

	public validate(connectionToken: any): boolean {
		return (connectionToken === this.value);
	}
}

export type ServerConnectionToken = NoneServerConnectionToken | OptionalServerConnectionToken | MandatoryServerConnectionToken;

export class ServerConnectionTokenParseError {
	constructor(
		public readonly message: string
	) { }
}

export function parseServerConnectionToken(args: ServerParsedArgs): ServerConnectionToken | ServerConnectionTokenParseError {
	const withoutConnectionToken = args['without-connection-token'];
	const connectionToken = args['connection-token'];
	const connectionTokenFile = args['connection-token-file'];
	const compatibility = (args['compatibility'] === '1.63');

	if (withoutConnectionToken) {
		if (typeof connectionToken !== 'undefined' || typeof connectionTokenFile !== 'undefined') {
			return new ServerConnectionTokenParseError(`Please do not use the argument '--connection-token' or '--connection-token-file' at the same time as '--without-connection-token'.`);
		}
		return new NoneServerConnectionToken();
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

		return new MandatoryServerConnectionToken(rawConnectionToken);
	}

	if (typeof connectionToken !== 'undefined') {
		if (!connectionTokenRegex.test(connectionToken)) {
			return new ServerConnectionTokenParseError(`The connection token '${connectionToken} does not adhere to the characters 0-9, a-z, A-Z or -.`);
		}

		if (compatibility) {
			// TODO: Remove this case soon
			return new OptionalServerConnectionToken(connectionToken);
		}

		return new MandatoryServerConnectionToken(connectionToken);
	}

	if (compatibility) {
		// TODO: Remove this case soon
		console.log(`Breaking change in the next release: Please use one of the following arguments: '--connection-token', '--connection-token-file' or '--without-connection-token'.`);
		return new OptionalServerConnectionToken(generateUuid());
	}

	return new MandatoryServerConnectionToken(generateUuid());
}
