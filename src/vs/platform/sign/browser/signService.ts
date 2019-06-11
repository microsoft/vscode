/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISignService } from 'vs/platform/sign/common/sign';

export class SignService implements ISignService {
	_serviceBrand: any;

	async sign(value: string): Promise<string> {
		return Promise.resolve((<any>self).CONNECTION_AUTH_TOKEN);
	}
}