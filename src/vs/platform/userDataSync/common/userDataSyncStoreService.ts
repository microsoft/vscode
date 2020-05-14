/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, } from 'vs/base/common/lifecycle';
import { IUserData, IUserDataSyncStoreService, UserDataSyncErrorCode, IUserDataSyncStore, getUserDataSyncStore, SyncResource, UserDataSyncStoreError, IUserDataSyncLogService, IUserDataManifest, IResourceRefHandle } from 'vs/platform/userDataSync/common/userDataSync';
import { IRequestService, asText, isSuccess, asJson } from 'vs/platform/request/common/request';
import { joinPath, relativePath } from 'vs/base/common/resources';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IHeaders, IRequestOptions, IRequestContext } from 'vs/base/parts/request/common/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IAuthenticationTokenService } from 'vs/platform/authentication/common/authentication';
import { IProductService } from 'vs/platform/product/common/productService';
import { getServiceMachineId } from 'vs/platform/serviceMachineId/common/serviceMachineId';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { assign } from 'vs/base/common/objects';
import { generateUuid } from 'vs/base/common/uuid';
import { isWeb } from 'vs/base/common/platform';

const USER_SESSION_ID_KEY = 'sync.user-session-id';
const MACHINE_SESSION_ID_KEY = 'sync.machine-session-id';

export class UserDataSyncStoreService extends Disposable implements IUserDataSyncStoreService {

	_serviceBrand: any;

	readonly userDataSyncStore: IUserDataSyncStore | undefined;
	private readonly commonHeadersPromise: Promise<{ [key: string]: string; }>;

	constructor(
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@IAuthenticationTokenService private readonly authTokenService: IAuthenticationTokenService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.userDataSyncStore = getUserDataSyncStore(productService, configurationService);
		this.commonHeadersPromise = getServiceMachineId(environmentService, fileService, storageService)
			.then(uuid => {
				const headers: IHeaders = {
					'X-Client-Name': `${productService.applicationName}${isWeb ? '-web' : ''}`,
					'X-Client-Version': productService.version,
					'X-Machine-Id': uuid
				};
				return headers;
			});
	}

	async getAllRefs(resource: SyncResource): Promise<IResourceRefHandle[]> {
		if (!this.userDataSyncStore) {
			throw new Error('No settings sync store url configured.');
		}

		const uri = joinPath(this.userDataSyncStore.url, 'resource', resource);
		const headers: IHeaders = {};

		const context = await this.request({ type: 'GET', url: uri.toString(), headers }, undefined, CancellationToken.None);

		if (!isSuccess(context)) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, UserDataSyncErrorCode.Unknown, undefined);
		}

		const result = await asJson<{ url: string, created: number }[]>(context) || [];
		return result.map(({ url, created }) => ({ ref: relativePath(uri, uri.with({ path: url }))!, created: created * 1000 /* Server returns in seconds */ }));
	}

	async resolveContent(resource: SyncResource, ref: string): Promise<string | null> {
		if (!this.userDataSyncStore) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.userDataSyncStore.url, 'resource', resource, ref).toString();
		const headers: IHeaders = {};
		headers['Cache-Control'] = 'no-cache';

		const context = await this.request({ type: 'GET', url, headers }, undefined, CancellationToken.None);

		if (!isSuccess(context)) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, UserDataSyncErrorCode.Unknown, undefined);
		}

		const content = await asText(context);
		return content;
	}

	async delete(resource: SyncResource): Promise<void> {
		if (!this.userDataSyncStore) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.userDataSyncStore.url, 'resource', resource).toString();
		const headers: IHeaders = {};

		const context = await this.request({ type: 'DELETE', url, headers }, undefined, CancellationToken.None);

		if (!isSuccess(context)) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, UserDataSyncErrorCode.Unknown, undefined);
		}
	}

	async read(resource: SyncResource, oldValue: IUserData | null): Promise<IUserData> {
		if (!this.userDataSyncStore) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.userDataSyncStore.url, 'resource', resource, 'latest').toString();
		const headers: IHeaders = {};
		// Disable caching as they are cached by synchronisers
		headers['Cache-Control'] = 'no-cache';
		if (oldValue) {
			headers['If-None-Match'] = oldValue.ref;
		}

		const context = await this.request({ type: 'GET', url, headers }, resource, CancellationToken.None);

		if (context.res.statusCode === 304) {
			// There is no new value. Hence return the old value.
			return oldValue!;
		}

		if (!isSuccess(context)) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, UserDataSyncErrorCode.Unknown, resource);
		}

		const ref = context.res.headers['etag'];
		if (!ref) {
			throw new UserDataSyncStoreError('Server did not return the ref', UserDataSyncErrorCode.NoRef, resource);
		}
		const content = await asText(context);
		return { ref, content };
	}

	async write(resource: SyncResource, data: string, ref: string | null): Promise<string> {
		if (!this.userDataSyncStore) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.userDataSyncStore.url, 'resource', resource).toString();
		const headers: IHeaders = { 'Content-Type': 'text/plain' };
		if (ref) {
			headers['If-Match'] = ref;
		}

		const context = await this.request({ type: 'POST', url, data, headers }, resource, CancellationToken.None);

		if (!isSuccess(context)) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, UserDataSyncErrorCode.Unknown, resource);
		}

		const newRef = context.res.headers['etag'];
		if (!newRef) {
			throw new UserDataSyncStoreError('Server did not return the ref', UserDataSyncErrorCode.NoRef, resource);
		}
		return newRef;
	}

	async manifest(): Promise<IUserDataManifest | null> {
		if (!this.userDataSyncStore) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.userDataSyncStore.url, 'manifest').toString();
		const headers: IHeaders = { 'Content-Type': 'application/json' };

		const context = await this.request({ type: 'GET', url, headers }, undefined, CancellationToken.None);
		if (!isSuccess(context)) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, UserDataSyncErrorCode.Unknown);
		}

		const manifest = await asJson<IUserDataManifest>(context);
		const currentSessionId = this.storageService.get(USER_SESSION_ID_KEY, StorageScope.GLOBAL);

		if (currentSessionId && manifest && currentSessionId !== manifest.session) {
			// Server session is different from client session so clear cached session.
			this.clearSession();
		}

		if (manifest === null && currentSessionId) {
			// server session is cleared so clear cached session.
			this.clearSession();
		}

		if (manifest) {
			// update session
			this.storageService.store(USER_SESSION_ID_KEY, manifest.session, StorageScope.GLOBAL);
		}

		return manifest;
	}

	async clear(): Promise<void> {
		if (!this.userDataSyncStore) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.userDataSyncStore.url, 'resource').toString();
		const headers: IHeaders = { 'Content-Type': 'text/plain' };

		const context = await this.request({ type: 'DELETE', url, headers }, undefined, CancellationToken.None);

		if (!isSuccess(context)) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, UserDataSyncErrorCode.Unknown);
		}

		// clear cached session.
		this.clearSession();
	}

	private clearSession(): void {
		this.storageService.remove(USER_SESSION_ID_KEY, StorageScope.GLOBAL);
		this.storageService.remove(MACHINE_SESSION_ID_KEY, StorageScope.GLOBAL);
	}

	private async request(options: IRequestOptions, source: SyncResource | undefined, token: CancellationToken): Promise<IRequestContext> {
		const authToken = await this.authTokenService.getToken();
		if (!authToken) {
			throw new UserDataSyncStoreError('No Auth Token Available', UserDataSyncErrorCode.Unauthorized, source);
		}

		const commonHeaders = await this.commonHeadersPromise;
		options.headers = assign(options.headers || {}, commonHeaders, {
			'X-Account-Type': authToken.authenticationProviderId,
			'authorization': `Bearer ${authToken.token}`,
		});

		// Add session headers
		this.addSessionHeaders(options.headers);

		this.logService.trace('Sending request to server', { url: options.url, type: options.type, headers: { ...options.headers, ...{ authorization: undefined } } });

		let context;
		try {
			context = await this.requestService.request(options, token);
			this.logService.trace('Request finished', { url: options.url, status: context.res.statusCode });
		} catch (e) {
			throw new UserDataSyncStoreError(`Connection refused for the request '${options.url?.toString()}'.`, UserDataSyncErrorCode.ConnectionRefused, source);
		}

		if (context.res.statusCode === 401) {
			this.authTokenService.sendTokenFailed();
			throw new UserDataSyncStoreError(`Request '${options.url?.toString()}' failed because of Unauthorized (401).`, UserDataSyncErrorCode.Unauthorized, source);
		}

		if (context.res.statusCode === 403) {
			throw new UserDataSyncStoreError(`Request '${options.url?.toString()}' is Forbidden (403).`, UserDataSyncErrorCode.Forbidden, source);
		}

		if (context.res.statusCode === 412) {
			throw new UserDataSyncStoreError(`${options.type} request '${options.url?.toString()}' failed because of Precondition Failed (412). There is new data exists for this resource. Make the request again with latest data.`, UserDataSyncErrorCode.RemotePreconditionFailed, source);
		}

		if (context.res.statusCode === 413) {
			throw new UserDataSyncStoreError(`${options.type} request '${options.url?.toString()}' failed because of too large payload (413).`, UserDataSyncErrorCode.TooLarge, source);
		}

		return context;
	}

	private addSessionHeaders(headers: IHeaders): void {
		let machineSessionId = this.storageService.get(MACHINE_SESSION_ID_KEY, StorageScope.GLOBAL);
		if (machineSessionId === undefined) {
			machineSessionId = generateUuid();
			this.storageService.store(MACHINE_SESSION_ID_KEY, machineSessionId, StorageScope.GLOBAL);
		}
		headers['X-Machine-Session-Id'] = machineSessionId;

		const userSessionId = this.storageService.get(USER_SESSION_ID_KEY, StorageScope.GLOBAL);
		if (userSessionId !== undefined) {
			headers['X-User-Session-Id'] = userSessionId;
		}
	}

}
