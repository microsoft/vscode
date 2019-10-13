/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';

export const enum AuthTokenStatus {
	Disabled = 'Disabled',
	Inactive = 'Inactive',
	Active = 'Active'
}

export const IAuthTokenService = createDecorator<IAuthTokenService>('IAuthTokenService');

export interface IAuthTokenService {
	_serviceBrand: undefined;

	readonly status: AuthTokenStatus;
	readonly onDidChangeStatus: Event<AuthTokenStatus>;

	getToken(): Promise<string | null>;
	updateToken(token: string): Promise<void>;
	refreshToken(): Promise<void>;
	deleteToken(): Promise<void>;

}

