/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ClientDetails {
	id?: string;
	secret?: string;
}

export interface ClientConfig {
	OSS: ClientDetails;
	INSIDERS: ClientDetails;
}

export class Registrar {
	private _config: ClientConfig;

	constructor() {
		try {
			this._config = require('./config.json') as ClientConfig;
		} catch (e) {
			this._config = {
				OSS: {},
				INSIDERS: {}
			};
		}
	}
	getClientDetails(product: string): ClientDetails {
		let details: ClientDetails | undefined;
		switch (product) {
			case 'code-oss':
				details = this._config.OSS;
				break;

			case 'vscode-insiders':
				details = this._config.INSIDERS;
				break;

			default:
				throw new Error(`Unrecognized product ${product}`);
		}

		if (!details.id || !details.secret) {
			throw new Error(`No client configuration available for ${product}`);
		}

		return details;
	}
}

const ClientRegistrar = new Registrar();
export default ClientRegistrar;
