/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISignService } from 'vs/platform/sign/common/sign';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class SignService implements ISignService {

	_serviceBrand: ServiceIdentifier<ISignService>;

	async sign(value: string): Promise<string> {
		return Promise.resolve((<any>self).WORKBENCH_WEB_CONFIGURATION.connectionAuthToken);
	}
}