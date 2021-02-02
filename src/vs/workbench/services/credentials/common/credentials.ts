/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ICredentialsService = createDecorator<ICredentialsService>('credentialsService');

export interface ICredentialsProvider {
	getPassword(service: string, account: string): Promise<string | null>;
	setPassword(service: string, account: string, password: string): Promise<void>;
	deletePassword(service: string, account: string): Promise<boolean>;
	findPassword(service: string): Promise<string | null>;
	findCredentials(service: string): Promise<Array<{ account: string, password: string }>>;
}

export interface ICredentialsChangeEvent {
	service: string
	account: string;
}

export interface ICredentialsService extends ICredentialsProvider {
	readonly _serviceBrand: undefined;
	readonly onDidChangePassword: Event<ICredentialsChangeEvent>;
}
