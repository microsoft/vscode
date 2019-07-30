/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISignService } from 'vs/platform/sign/common/sign';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class SignService implements ISignService {

	_serviceBrand: ServiceIdentifier<ISignService>;

	private readonly _tkn: string | null;

	constructor(token: string | undefined) {
		if (typeof token !== 'undefined') {
			this._tkn = token;
		} else {
			this._tkn = SignService._readTokenFromURL();
		}
	}

	private static _readTokenFromURL(): string | null {
		if (!document.location.hash) {
			return null;
		}
		const m = document.location.hash.match(/[#&]tkn=([^&]+)/);
		if (!m) {
			return null;
		}
		return m[1];
	}

	async sign(value: string): Promise<string> {
		return Promise.resolve(this._tkn || '');
	}
}
