/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISignService } from 'vs/platform/sign/common/sign';

export class SignService implements ISignService {
	_serviceBrand: any;

	private vsda(): Promise<typeof import('vsda')> {
		return import('vsda');
	}

	async sign(value: string): Promise<string> {
		try {
			const vsda = await this.vsda();
			const signer = new vsda.signer();
			if (signer) {
				return signer.sign(value);
			}
		} catch (e) {
			console.error('signer.sign: ' + e);
		}

		return value;
	}
}
