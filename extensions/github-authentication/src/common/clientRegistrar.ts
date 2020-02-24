/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';

export interface ClientDetails {
	id?: string;
	secret?: string;
}

export interface ClientConfig {
	OSS: ClientDetails;
	INSIDERS: ClientDetails;
	STABLE: ClientDetails;
	EXPLORATION: ClientDetails;

	VSO: ClientDetails;
	VSO_PPE: ClientDetails;
	VSO_DEV: ClientDetails;
}

export class Registrar {
	private _config: ClientConfig;

	constructor() {
		try {
			this._config = require('./config.json') as ClientConfig;
		} catch (e) {
			this._config = {
				OSS: {},
				INSIDERS: {},
				STABLE: {},
				EXPLORATION: {},
				VSO: {},
				VSO_PPE: {},
				VSO_DEV: {}
			};
		}
	}
	getClientDetails(callbackUri: Uri): ClientDetails {
		let details: ClientDetails | undefined;
		switch (callbackUri.scheme) {
			case 'code-oss':
				details = this._config.OSS;
				break;

			case 'vscode-insiders':
				details = this._config.INSIDERS;
				break;

			case 'vscode':
				details = this._config.STABLE;
				break;

			case 'vscode-exploration':
				details = this._config.EXPLORATION;
				break;

			case 'https':
				switch (callbackUri.authority) {
					case 'online.visualstudio.com':
						details = this._config.VSO;
						break;
					case 'online-ppe.core.vsengsaas.visualstudio.com':
						details = this._config.VSO_PPE;
						break;
					case 'online.dev.core.vsengsaas.visualstudio.com':
						details = this._config.VSO_DEV;
						break;
				}

			default:
				throw new Error(`Unrecognized callback ${callbackUri}`);
		}

		if (!details.id || !details.secret) {
			throw new Error(`No client configuration available for ${callbackUri}`);
		}

		return details;
	}
}

const ClientRegistrar = new Registrar();
export default ClientRegistrar;
