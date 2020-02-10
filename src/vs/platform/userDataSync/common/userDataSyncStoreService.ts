/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, } from 'vs/base/common/lifecycle';
import { IUserData, IUserDataSyncStoreService, UserDataSyncErrorCode, IUserDataSyncStore, getUserDataSyncStore, IUserDataAuthTokenService, SyncSource, UserDataSyncStoreError, IUserDataSyncLogService, IUserDataManifest } from 'vs/platform/userDataSync/common/userDataSync';
import { IRequestService, asText, isSuccess, asJson } from 'vs/platform/request/common/request';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IHeaders, IRequestOptions, IRequestContext } from 'vs/base/parts/request/common/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class UserDataSyncStoreService extends Disposable implements IUserDataSyncStoreService {

	_serviceBrand: any;

	readonly userDataSyncStore: IUserDataSyncStore | undefined;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@IUserDataAuthTokenService private readonly authTokenService: IUserDataAuthTokenService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
	) {
		super();
		this.userDataSyncStore = getUserDataSyncStore(configurationService);
	}

	async read(key: string, oldValue: IUserData | null, source?: SyncSource): Promise<IUserData> {
		if (!this.userDataSyncStore) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(URI.parse(this.userDataSyncStore.url), 'resource', key, 'latest').toString();
		const headers: IHeaders = {};
		// Disable caching as they are cached by synchronisers
		headers['Cache-Control'] = 'no-cache';
		if (oldValue) {
			headers['If-None-Match'] = oldValue.ref;
		}

		const context = await this.request({ type: 'GET', url, headers }, source, CancellationToken.None);

		if (context.res.statusCode === 304) {
			// There is no new value. Hence return the old value.
			return oldValue!;
		}

		if (!isSuccess(context)) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, UserDataSyncErrorCode.Unknown, source);
		}

		const ref = context.res.headers['etag'];
		if (!ref) {
			throw new UserDataSyncStoreError('Server did not return the ref', UserDataSyncErrorCode.NoRef, source);
		}
		const content = await asText(context);
		return { ref, content };
	}

	async write(key: string, data: string, ref: string | null, source?: SyncSource): Promise<string> {
		if (!this.userDataSyncStore) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(URI.parse(this.userDataSyncStore.url), 'resource', key).toString();
		const headers: IHeaders = { 'Content-Type': 'text/plain' };
		if (ref) {
			headers['If-Match'] = ref;
		}

		const context = await this.request({ type: 'POST', url, data, headers }, source, CancellationToken.None);

		if (!isSuccess(context)) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, UserDataSyncErrorCode.Unknown, source);
		}

		const newRef = context.res.headers['etag'];
		if (!newRef) {
			throw new UserDataSyncStoreError('Server did not return the ref', UserDataSyncErrorCode.NoRef, source);
		}
		return newRef;
	}

	async manifest(): Promise<IUserDataManifest | null> {
		if (!this.userDataSyncStore) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(URI.parse(this.userDataSyncStore.url), 'resource', 'latest').toString();
		const headers: IHeaders = { 'Content-Type': 'application/json' };

		const context = await this.request({ type: 'GET', url, headers }, undefined, CancellationToken.None);
		if (!isSuccess(context)) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, UserDataSyncErrorCode.Unknown);
		}

		return asJson(context);
	}

	async clear(): Promise<void> {
		if (!this.userDataSyncStore) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(URI.parse(this.userDataSyncStore.url), 'resource').toString();
		const headers: IHeaders = { 'Content-Type': 'text/plain' };

		const context = await this.request({ type: 'DELETE', url, headers }, undefined, CancellationToken.None);

		if (!isSuccess(context)) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, UserDataSyncErrorCode.Unknown);
		}
	}

	private async request(options: IRequestOptions, source: SyncSource | undefined, token: CancellationToken): Promise<IRequestContext> {
		const authToken = await this.authTokenService.getToken();
		if (!authToken) {
			throw new UserDataSyncStoreError('No Auth Token Available', UserDataSyncErrorCode.Unauthorized, source);
		}
		options.headers = options.headers || {};
		options.headers['authorization'] = `Bearer ${authToken}`;

		this.logService.trace('Sending request to server', { url: options.url, type: options.type, headers: { ...options.headers, ...{ authorization: undefined } } });

		let context;
		try {
			context = await this.requestService.request(options, token);
			this.logService.trace('Request finished', { url: options.url, status: context.res.statusCode });
		} catch (e) {
			throw new UserDataSyncStoreError(`Connection refused for the request '${options.url?.toString()}'.`, UserDataSyncErrorCode.ConnectionRefused, source);
		}

		if (context.res.statusCode === 401) {
			throw new UserDataSyncStoreError(`Request '${options.url?.toString()}' failed because of Unauthorized (401).`, UserDataSyncErrorCode.Unauthorized, source);
		}

		if (context.res.statusCode === 403) {
			throw new UserDataSyncStoreError(`Request '${options.url?.toString()}' is Forbidden (403).`, UserDataSyncErrorCode.Forbidden, source);
		}

		if (context.res.statusCode === 412) {
			throw new UserDataSyncStoreError(`${options.type} request '${options.url?.toString()}' failed because of Precondition Failed (412). There is new data exists for this resource. Make the request again with latest data.`, UserDataSyncErrorCode.Rejected, source);
		}

		if (context.res.statusCode === 413) {
			throw new UserDataSyncStoreError(`${options.type} request '${options.url?.toString()}' failed because of too large payload (413).`, UserDataSyncErrorCode.TooLarge, source);
		}

		return context;
	}

}
