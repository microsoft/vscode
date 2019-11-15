/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, } from 'vs/base/common/lifecycle';
import { IUserData, IUserDataSyncStoreService, UserDataSyncStoreErrorCode, UserDataSyncStoreError } from 'vs/platform/userDataSync/common/userDataSync';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRequestService, asText, isSuccess } from 'vs/platform/request/common/request';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IHeaders, IRequestOptions, IRequestContext } from 'vs/base/parts/request/common/request';
import { IAuthTokenService } from 'vs/platform/auth/common/auth';

export class UserDataSyncStoreService extends Disposable implements IUserDataSyncStoreService {

	_serviceBrand: any;

	get enabled(): boolean { return !!this.productService.settingsSyncStoreUrl; }

	constructor(
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
		@IAuthTokenService private readonly authTokenService: IAuthTokenService,
	) {
		super();
	}

	async read(key: string, oldValue: IUserData | null): Promise<IUserData> {
		if (!this.enabled) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(URI.parse(this.productService.settingsSyncStoreUrl!), 'resource', key, 'latest').toString();
		const headers: IHeaders = {};
		if (oldValue) {
			headers['If-None-Match'] = oldValue.ref;
		}

		const context = await this.request({ type: 'GET', url, headers }, CancellationToken.None);

		if (context.res.statusCode === 304) {
			// There is no new value. Hence return the old value.
			return oldValue!;
		}

		if (!isSuccess(context)) {
			throw new Error('Server returned ' + context.res.statusCode);
		}

		const ref = context.res.headers['etag'];
		if (!ref) {
			throw new Error('Server did not return the ref');
		}
		const content = await asText(context);
		return { ref, content };
	}

	async write(key: string, data: string, ref: string | null): Promise<string> {
		if (!this.enabled) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(URI.parse(this.productService.settingsSyncStoreUrl!), 'resource', key).toString();
		const headers: IHeaders = { 'Content-Type': 'text/plain' };
		if (ref) {
			headers['If-Match'] = ref;
		}

		const context = await this.request({ type: 'POST', url, data, headers }, CancellationToken.None);

		if (context.res.statusCode === 412) {
			// There is a new value. Throw Rejected Error
			throw new UserDataSyncStoreError('New data exists', UserDataSyncStoreErrorCode.Rejected);
		}

		if (!isSuccess(context)) {
			throw new Error('Server returned ' + context.res.statusCode);
		}

		const newRef = context.res.headers['etag'];
		if (!newRef) {
			throw new Error('Server did not return the ref');
		}
		return newRef;
	}

	private async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		const authToken = await this.authTokenService.getToken();
		if (!authToken) {
			throw new Error('No Auth Token Available.');
		}
		options.headers = options.headers || {};
		options.headers['authorization'] = `Bearer ${authToken}`;

		const context = await this.requestService.request(options, token);

		if (context.res.statusCode === 401) {
			this.authTokenService.refreshToken();
			// Throw Unauthorized Error
			throw new UserDataSyncStoreError('Unauthorized', UserDataSyncStoreErrorCode.Unauthroized);
		}

		return context;

	}

}
