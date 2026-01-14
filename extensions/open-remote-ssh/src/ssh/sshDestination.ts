/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export default class SSHDestination {
	constructor(
		public readonly hostname: string,
		public readonly user?: string,
		public readonly port?: number
	) {
	}

	static parse(dest: string): SSHDestination {
		let user: string | undefined;
		const atPos = dest.lastIndexOf('@');
		if (atPos !== -1) {
			user = dest.substring(0, atPos);
		}

		let port: number | undefined;
		const colonPos = dest.lastIndexOf(':');
		if (colonPos !== -1) {
			port = parseInt(dest.substring(colonPos + 1), 10);
		}

		const start = atPos !== -1 ? atPos + 1 : 0;
		const end = colonPos !== -1 ? colonPos : dest.length;
		const hostname = dest.substring(start, end);

		return new SSHDestination(hostname, user, port);
	}

	toString(): string {
		let result = this.hostname;
		if (this.user) {
			result = `${this.user}@` + result;
		}
		if (this.port) {
			result = result + `:${this.port}`;
		}
		return result;
	}

	// vscode.uri implementation lowercases the authority, so when reopen or restore
	// a remote session from the recently openend list the connection fails
	static parseEncoded(dest: string): SSHDestination {
		try {
			const data = JSON.parse(Buffer.from(dest, 'hex').toString());
			return new SSHDestination(data.hostName, data.user, data.port);
		} catch {
		}
		return SSHDestination.parse(dest.replace(/\\x([0-9a-f]{2})/g, (_, charCode) => String.fromCharCode(parseInt(charCode, 16))));
	}

	toEncodedString(): string {
		return this.toString().replace(/[A-Z]/g, (ch) => `\\x${ch.charCodeAt(0).toString(16).toLowerCase()}`);
	}
}
