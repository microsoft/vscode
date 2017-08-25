/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ICredentialsService = createDecorator<ICredentialsService>('credentialsService');

export interface ICredentialsService {

	_serviceBrand: any;

	readSecret(service: string, account: string): TPromise<string | undefined>;

	writeSecret(service: string, account: string, secret: string): TPromise<void>;

	deleteSecret(service: string, account: string): TPromise<boolean>;

}