/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export const ICredentialsService = createDecorator<ICredentialsService>('ICredentialsService');

export interface ICredentialsService {

	_serviceBrand: ServiceIdentifier<any>;

	getPassword(service: string, account: string): Promise<string | null>;
	setPassword(service: string, account: string, password: string): Promise<void>;
	deletePassword(service: string, account: string): Promise<boolean>;
	findPassword(service: string): Promise<string | null>;
}
