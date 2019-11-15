/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';

export const enum AuthTokenStatus {
	Inactive = 'Inactive',
	Active = 'Active',
	SigningIn = 'SigningIn'
}

export const IAuthTokenService = createDecorator<IAuthTokenService>('IAuthTokenService');

export interface IAuthTokenService {
	_serviceBrand: undefined;

	readonly status: AuthTokenStatus;
	readonly onDidChangeStatus: Event<AuthTokenStatus>;
	readonly _onDidGetCallback: Emitter<URI>;

	getToken(): Promise<string | undefined>;
	refreshToken(): Promise<void>;
	login(callbackUri?: URI): Promise<void>;
	logout(): Promise<void>;
}
