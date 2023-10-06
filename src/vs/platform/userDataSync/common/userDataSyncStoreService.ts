/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { getErrorMessage, isCancellationError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { isWeb } from 'vs/base/common/platform';
import { ConfigurationSyncStore } from 'vs/base/common/product';
import { joinPath, relativePath } from 'vs/base/common/resources';
import { isObject, isString } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IHeaders, IRequestContext, IRequestOptions } from 'vs/base/parts/request/common/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IProductService } from 'vs/platform/product/common/productService';
import { asJson, asText, asTextOrError, hasNoContent, IRequestService, isSuccess, isSuccess as isSuccessContext } from 'vs/platform/request/common/request';
import { getServiceMachineId } from 'vs/platform/externalServices/common/serviceMachineId';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { HEADER_EXECUTION_ID, HEADER_OPERATION_ID, IAuthenticationProvider, IResourceRefHandle, IUserData, IUserDataManifest, IUserDataSyncLogService, IUserDataSyncStore, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, ServerResource, SYNC_SERVICE_URL_TYPE, UserDataSyncErrorCode, UserDataSyncStoreError, UserDataSyncStoreType } from 'vs/platform/userDataSync/common/userDataSync';
import { VSBufferReadableStream } from 'vs/base/common/buffer';

const CONFIGURATION_SYNC_STORE_KEY = 'configurationSync.store';
const SYNC_PREVIOUS_STORE = 'sync.previous.store';
const DONOT_MAKE_REQUESTS_UNTIL_KEY = 'sync.donot-make-requests-until';
const USER_SESSION_ID_KEY = 'sync.user-session-id';
const MACHINE_SESSION_ID_KEY = 'sync.machine-session-id';
const REQUEST_SESSION_LIMIT = 100;
const REQUEST_SESSION_INTERVAL = 1000 * 60 * 5; /* 5 minutes */

type UserDataSyncStore = IUserDataSyncStore & { defaultType: UserDataSyncStoreType };

export abstract class AbstractUserDataSyncStoreManagementService extends Disposable implements IUserDataSyncStoreManagementService {

	_serviceBrand: any;

	private readonly _onDidChangeUserDataSyncStore = this._register(new Emitter<void>());
	readonly onDidChangeUserDataSyncStore = this._onDidChangeUserDataSyncStore.event;
	private _userDataSyncStore: UserDataSyncStore | undefined;
	get userDataSyncStore(): UserDataSyncStore | undefined { return this._userDataSyncStore; }

	protected get userDataSyncStoreType(): UserDataSyncStoreType | undefined {
		return this.storageService.get(SYNC_SERVICE_URL_TYPE, StorageScope.APPLICATION) as UserDataSyncStoreType;
	}
	protected set userDataSyncStoreType(type: UserDataSyncStoreType | undefined) {
		this.storageService.store(SYNC_SERVICE_URL_TYPE, type, StorageScope.APPLICATION, isWeb ? StorageTarget.USER /* sync in web */ : StorageTarget.MACHINE);
	}

	constructor(
		@IProductService protected readonly productService: IProductService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IStorageService protected readonly storageService: IStorageService,
	) {
		super();
		this.updateUserDataSyncStore();
		const disposable = this._register(new DisposableStore());
		this._register(Event.filter(storageService.onDidChangeValue(StorageScope.APPLICATION, SYNC_SERVICE_URL_TYPE, disposable), () => this.userDataSyncStoreType !== this.userDataSyncStore?.type, disposable)(() => this.updateUserDataSyncStore()));
	}

	protected updateUserDataSyncStore(): void {
		this._userDataSyncStore = this.toUserDataSyncStore(this.productService[CONFIGURATION_SYNC_STORE_KEY]);
		this._onDidChangeUserDataSyncStore.fire();
	}

	protected toUserDataSyncStore(configurationSyncStore: ConfigurationSyncStore & { web?: ConfigurationSyncStore } | undefined): UserDataSyncStore | undefined {
		if (!configurationSyncStore) {
			return undefined;
		}
		// Check for web overrides for backward compatibility while reading previous store
		configurationSyncStore = isWeb && configurationSyncStore.web ? { ...configurationSyncStore, ...configurationSyncStore.web } : configurationSyncStore;
		if (isString(configurationSyncStore.url)
			&& isObject(configurationSyncStore.authenticationProviders)
			&& Object.keys(configurationSyncStore.authenticationProviders).every(authenticationProviderId => Array.isArray(configurationSyncStore!.authenticationProviders![authenticationProviderId].scopes))
		) {
			const syncStore = configurationSyncStore as ConfigurationSyncStore;
			const canSwitch = !!syncStore.canSwitch;
			const defaultType: UserDataSyncStoreType = syncStore.url === syncStore.insidersUrl ? 'insiders' : 'stable';
			const type: UserDataSyncStoreType = (canSwitch ? this.userDataSyncStoreType : undefined) || defaultType;
			const url = type === 'insiders' ? syncStore.insidersUrl
				: type === 'stable' ? syncStore.stableUrl
					: syncStore.url;
			return {
				url: URI.parse(url),
				type,
				defaultType,
				defaultUrl: URI.parse(syncStore.url),
				stableUrl: URI.parse(syncStore.stableUrl),
				insidersUrl: URI.parse(syncStore.insidersUrl),
				canSwitch,
				authenticationProviders: Object.keys(syncStore.authenticationProviders).reduce<IAuthenticationProvider[]>((result, id) => {
					result.push({ id, scopes: syncStore!.authenticationProviders[id].scopes });
					return result;
				}, [])
			};
		}
		return undefined;
	}

	abstract switch(type: UserDataSyncStoreType): Promise<void>;
	abstract getPreviousUserDataSyncStore(): Promise<IUserDataSyncStore | undefined>;

}

export class UserDataSyncStoreManagementService extends AbstractUserDataSyncStoreManagementService implements IUserDataSyncStoreManagementService {

	private readonly previousConfigurationSyncStore: ConfigurationSyncStore | undefined;

	constructor(
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
	) {
		super(productService, configurationService, storageService);

		const previousConfigurationSyncStore = this.storageService.get(SYNC_PREVIOUS_STORE, StorageScope.APPLICATION);
		if (previousConfigurationSyncStore) {
			this.previousConfigurationSyncStore = JSON.parse(previousConfigurationSyncStore);
		}

		const syncStore = this.productService[CONFIGURATION_SYNC_STORE_KEY];
		if (syncStore) {
			this.storageService.store(SYNC_PREVIOUS_STORE, JSON.stringify(syncStore), StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(SYNC_PREVIOUS_STORE, StorageScope.APPLICATION);
		}
	}

	async switch(type: UserDataSyncStoreType): Promise<void> {
		if (type !== this.userDataSyncStoreType) {
			this.userDataSyncStoreType = type;
			this.updateUserDataSyncStore();
		}
	}

	async getPreviousUserDataSyncStore(): Promise<IUserDataSyncStore | undefined> {
		return this.toUserDataSyncStore(this.previousConfigurationSyncStore);
	}
}

export class UserDataSyncStoreClient extends Disposable {

	private userDataSyncStoreUrl: URI | undefined;

	private authToken: { token: string; type: string } | undefined;
	private readonly commonHeadersPromise: Promise<{ [key: string]: string }>;
	private readonly session: RequestsSession;

	private _onTokenFailed = this._register(new Emitter<UserDataSyncErrorCode>());
	readonly onTokenFailed = this._onTokenFailed.event;

	private _onTokenSucceed: Emitter<void> = this._register(new Emitter<void>());
	readonly onTokenSucceed: Event<void> = this._onTokenSucceed.event;

	private _donotMakeRequestsUntil: Date | undefined = undefined;
	get donotMakeRequestsUntil() { return this._donotMakeRequestsUntil; }
	private _onDidChangeDonotMakeRequestsUntil = this._register(new Emitter<void>());
	readonly onDidChangeDonotMakeRequestsUntil = this._onDidChangeDonotMakeRequestsUntil.event;

	constructor(
		userDataSyncStoreUrl: URI | undefined,
		@IProductService productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.updateUserDataSyncStoreUrl(userDataSyncStoreUrl);
		this.commonHeadersPromise = getServiceMachineId(environmentService, fileService, storageService)
			.then(uuid => {
				const headers: IHeaders = {
					'X-Client-Name': `${productService.applicationName}${isWeb ? '-web' : ''}`,
					'X-Client-Version': productService.version,
				};
				if (productService.commit) {
					headers['X-Client-Commit'] = productService.commit;
				}
				return headers;
			});

		/* A requests session that limits requests per sessions */
		this.session = new RequestsSession(REQUEST_SESSION_LIMIT, REQUEST_SESSION_INTERVAL, this.requestService, this.logService);
		this.initDonotMakeRequestsUntil();
		this._register(toDisposable(() => {
			if (this.resetDonotMakeRequestsUntilPromise) {
				this.resetDonotMakeRequestsUntilPromise.cancel();
				this.resetDonotMakeRequestsUntilPromise = undefined;
			}
		}));
	}

	setAuthToken(token: string, type: string): void {
		this.authToken = { token, type };
	}

	protected updateUserDataSyncStoreUrl(userDataSyncStoreUrl: URI | undefined): void {
		this.userDataSyncStoreUrl = userDataSyncStoreUrl ? joinPath(userDataSyncStoreUrl, 'v1') : undefined;
	}

	private initDonotMakeRequestsUntil(): void {
		const donotMakeRequestsUntil = this.storageService.getNumber(DONOT_MAKE_REQUESTS_UNTIL_KEY, StorageScope.APPLICATION);
		if (donotMakeRequestsUntil && Date.now() < donotMakeRequestsUntil) {
			this.setDonotMakeRequestsUntil(new Date(donotMakeRequestsUntil));
		}
	}

	private resetDonotMakeRequestsUntilPromise: CancelablePromise<void> | undefined = undefined;
	private setDonotMakeRequestsUntil(donotMakeRequestsUntil: Date | undefined): void {
		if (this._donotMakeRequestsUntil?.getTime() !== donotMakeRequestsUntil?.getTime()) {
			this._donotMakeRequestsUntil = donotMakeRequestsUntil;

			if (this.resetDonotMakeRequestsUntilPromise) {
				this.resetDonotMakeRequestsUntilPromise.cancel();
				this.resetDonotMakeRequestsUntilPromise = undefined;
			}

			if (this._donotMakeRequestsUntil) {
				this.storageService.store(DONOT_MAKE_REQUESTS_UNTIL_KEY, this._donotMakeRequestsUntil.getTime(), StorageScope.APPLICATION, StorageTarget.MACHINE);
				this.resetDonotMakeRequestsUntilPromise = createCancelablePromise(token => timeout(this._donotMakeRequestsUntil!.getTime() - Date.now(), token).then(() => this.setDonotMakeRequestsUntil(undefined)));
				this.resetDonotMakeRequestsUntilPromise.then(null, e => null /* ignore error */);
			} else {
				this.storageService.remove(DONOT_MAKE_REQUESTS_UNTIL_KEY, StorageScope.APPLICATION);
			}

			this._onDidChangeDonotMakeRequestsUntil.fire();
		}
	}

	// #region Collection

	async getAllCollections(headers: IHeaders = {}): Promise<string[]> {
		if (!this.userDataSyncStoreUrl) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.userDataSyncStoreUrl, 'collection').toString();
		headers = { ...headers };
		headers['Content-Type'] = 'application/json';

		const context = await this.request(url, { type: 'GET', headers }, [], CancellationToken.None);

		return (await asJson<{ id: string }[]>(context))?.map(({ id }) => id) || [];
	}

	async createCollection(headers: IHeaders = {}): Promise<string> {
		if (!this.userDataSyncStoreUrl) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.userDataSyncStoreUrl, 'collection').toString();
		headers = { ...headers };
		headers['Content-Type'] = Mimes.text;

		const context = await this.request(url, { type: 'POST', headers }, [], CancellationToken.None);
		const collectionId = await asTextOrError(context);
		if (!collectionId) {
			throw new UserDataSyncStoreError('Server did not return the collection id', url, UserDataSyncErrorCode.NoCollection, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
		}
		return collectionId;
	}

	async deleteCollection(collection?: string, headers: IHeaders = {}): Promise<void> {
		if (!this.userDataSyncStoreUrl) {
			throw new Error('No settings sync store url configured.');
		}

		const url = collection ? joinPath(this.userDataSyncStoreUrl, 'collection', collection).toString() : joinPath(this.userDataSyncStoreUrl, 'collection').toString();
		headers = { ...headers };

		await this.request(url, { type: 'DELETE', headers }, [], CancellationToken.None);
	}

	// #endregion

	// #region Resource

	async getAllResourceRefs(resource: ServerResource, collection?: string): Promise<IResourceRefHandle[]> {
		if (!this.userDataSyncStoreUrl) {
			throw new Error('No settings sync store url configured.');
		}

		const uri = this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource);
		const headers: IHeaders = {};

		const context = await this.request(uri.toString(), { type: 'GET', headers }, [], CancellationToken.None);

		const result = await asJson<{ url: string; created: number }[]>(context) || [];
		return result.map(({ url, created }) => ({ ref: relativePath(uri, uri.with({ path: url }))!, created: created * 1000 /* Server returns in seconds */ }));
	}

	async resolveResourceContent(resource: ServerResource, ref: string, collection?: string, headers: IHeaders = {}): Promise<string | null> {
		if (!this.userDataSyncStoreUrl) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource), ref).toString();
		headers = { ...headers };
		headers['Cache-Control'] = 'no-cache';

		const context = await this.request(url, { type: 'GET', headers }, [], CancellationToken.None);
		const content = await asTextOrError(context);
		return content;
	}

	async deleteResource(resource: ServerResource, ref: string | null, collection?: string): Promise<void> {
		if (!this.userDataSyncStoreUrl) {
			throw new Error('No settings sync store url configured.');
		}

		const url = ref !== null ? joinPath(this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource), ref).toString() : this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource).toString();
		const headers: IHeaders = {};

		await this.request(url, { type: 'DELETE', headers }, [], CancellationToken.None);
	}

	async deleteResources(): Promise<void> {
		if (!this.userDataSyncStoreUrl) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.userDataSyncStoreUrl, 'resource').toString();
		const headers: IHeaders = { 'Content-Type': Mimes.text };

		await this.request(url, { type: 'DELETE', headers }, [], CancellationToken.None);
	}

	async readResource(resource: ServerResource, oldValue: IUserData | null, collection?: string, headers: IHeaders = {}): Promise<IUserData> {
		if (!this.userDataSyncStoreUrl) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource), 'latest').toString();
		headers = { ...headers };
		// Disable caching as they are cached by synchronisers
		headers['Cache-Control'] = 'no-cache';
		if (oldValue) {
			headers['If-None-Match'] = oldValue.ref;
		}

		const context = await this.request(url, { type: 'GET', headers }, [304], CancellationToken.None);

		let userData: IUserData | null = null;
		if (context.res.statusCode === 304) {
			userData = oldValue;
		}

		if (userData === null) {
			const ref = context.res.headers['etag'];
			if (!ref) {
				throw new UserDataSyncStoreError('Server did not return the ref', url, UserDataSyncErrorCode.NoRef, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
			}

			const content = await asTextOrError(context);
			if (!content && context.res.statusCode === 304) {
				throw new UserDataSyncStoreError('Empty response', url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
			}

			userData = { ref, content };
		}

		return userData;
	}

	async writeResource(resource: ServerResource, data: string, ref: string | null, collection?: string, headers: IHeaders = {}): Promise<string> {
		if (!this.userDataSyncStoreUrl) {
			throw new Error('No settings sync store url configured.');
		}

		const url = this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource).toString();
		headers = { ...headers };
		headers['Content-Type'] = Mimes.text;
		if (ref) {
			headers['If-Match'] = ref;
		}

		const context = await this.request(url, { type: 'POST', data, headers }, [], CancellationToken.None);

		const newRef = context.res.headers['etag'];
		if (!newRef) {
			throw new UserDataSyncStoreError('Server did not return the ref', url, UserDataSyncErrorCode.NoRef, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
		}
		return newRef;
	}

	// #endregion

	async manifest(oldValue: IUserDataManifest | null, headers: IHeaders = {}): Promise<IUserDataManifest | null> {
		if (!this.userDataSyncStoreUrl) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.userDataSyncStoreUrl, 'manifest').toString();
		headers = { ...headers };
		headers['Content-Type'] = 'application/json';
		if (oldValue) {
			headers['If-None-Match'] = oldValue.ref;
		}

		const context = await this.request(url, { type: 'GET', headers }, [304], CancellationToken.None);

		let manifest: IUserDataManifest | null = null;
		if (context.res.statusCode === 304) {
			manifest = oldValue;
		}

		if (!manifest) {
			const ref = context.res.headers['etag'];
			if (!ref) {
				throw new UserDataSyncStoreError('Server did not return the ref', url, UserDataSyncErrorCode.NoRef, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
			}

			const content = await asTextOrError(context);
			if (!content && context.res.statusCode === 304) {
				throw new UserDataSyncStoreError('Empty response', url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
			}

			if (content) {
				manifest = { ...JSON.parse(content), ref };
			}
		}

		const currentSessionId = this.storageService.get(USER_SESSION_ID_KEY, StorageScope.APPLICATION);

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
			this.storageService.store(USER_SESSION_ID_KEY, manifest.session, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		return manifest;
	}

	async clear(): Promise<void> {
		if (!this.userDataSyncStoreUrl) {
			throw new Error('No settings sync store url configured.');
		}

		await this.deleteCollection();
		await this.deleteResources();

		// clear cached session.
		this.clearSession();
	}

	async getActivityData(): Promise<VSBufferReadableStream> {
		if (!this.userDataSyncStoreUrl) {
			throw new Error('No settings sync store url configured.');
		}

		const url = joinPath(this.userDataSyncStoreUrl, 'download').toString();
		const headers: IHeaders = {};

		const context = await this.request(url, { type: 'GET', headers }, [], CancellationToken.None);

		if (!isSuccess(context)) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
		}

		if (hasNoContent(context)) {
			throw new UserDataSyncStoreError('Empty response', url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
		}

		return context.stream;
	}

	private getResourceUrl(userDataSyncStoreUrl: URI, collection: string | undefined, resource: ServerResource): URI {
		return collection ? joinPath(userDataSyncStoreUrl, 'collection', collection, 'resource', resource) : joinPath(userDataSyncStoreUrl, 'resource', resource);
	}

	private clearSession(): void {
		this.storageService.remove(USER_SESSION_ID_KEY, StorageScope.APPLICATION);
		this.storageService.remove(MACHINE_SESSION_ID_KEY, StorageScope.APPLICATION);
	}

	private async request(url: string, options: IRequestOptions, successCodes: number[], token: CancellationToken): Promise<IRequestContext> {
		if (!this.authToken) {
			throw new UserDataSyncStoreError('No Auth Token Available', url, UserDataSyncErrorCode.Unauthorized, undefined, undefined);
		}

		if (this._donotMakeRequestsUntil && Date.now() < this._donotMakeRequestsUntil.getTime()) {
			throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too many requests (429).`, url, UserDataSyncErrorCode.TooManyRequestsAndRetryAfter, undefined, undefined);
		}
		this.setDonotMakeRequestsUntil(undefined);

		const commonHeaders = await this.commonHeadersPromise;
		options.headers = {
			...(options.headers || {}),
			...commonHeaders,
			'X-Account-Type': this.authToken.type,
			'authorization': `Bearer ${this.authToken.token}`,
		};

		// Add session headers
		this.addSessionHeaders(options.headers);

		this.logService.trace('Sending request to server', { url, type: options.type, headers: { ...options.headers, ...{ authorization: undefined } } });

		let context;
		try {
			context = await this.session.request(url, options, token);
		} catch (e) {
			if (!(e instanceof UserDataSyncStoreError)) {
				let code = UserDataSyncErrorCode.RequestFailed;
				const errorMessage = getErrorMessage(e).toLowerCase();

				// Request timed out
				if (errorMessage.includes('xhr timeout')) {
					code = UserDataSyncErrorCode.RequestTimeout;
				}

				// Request protocol not supported
				else if (errorMessage.includes('protocol') && errorMessage.includes('not supported')) {
					code = UserDataSyncErrorCode.RequestProtocolNotSupported;
				}

				// Request path not escaped
				else if (errorMessage.includes('request path contains unescaped characters')) {
					code = UserDataSyncErrorCode.RequestPathNotEscaped;
				}

				// Request header not an object
				else if (errorMessage.includes('headers must be an object')) {
					code = UserDataSyncErrorCode.RequestHeadersNotObject;
				}

				// Request canceled
				else if (isCancellationError(e)) {
					code = UserDataSyncErrorCode.RequestCanceled;
				}

				e = new UserDataSyncStoreError(`Connection refused for the request '${url}'.`, url, code, undefined, undefined);
			}
			this.logService.info('Request failed', url);
			throw e;
		}

		const operationId = context.res.headers[HEADER_OPERATION_ID];
		const requestInfo = { url, status: context.res.statusCode, 'execution-id': options.headers[HEADER_EXECUTION_ID], 'operation-id': operationId };
		const isSuccess = isSuccessContext(context) || (context.res.statusCode && successCodes.includes(context.res.statusCode));
		let failureMessage = '';
		if (isSuccess) {
			this.logService.trace('Request succeeded', requestInfo);
		} else {
			failureMessage = await asText(context) || '';
			this.logService.info('Request failed', requestInfo, failureMessage);
		}

		if (context.res.statusCode === 401 || context.res.statusCode === 403) {
			this.authToken = undefined;
			if (context.res.statusCode === 401) {
				this._onTokenFailed.fire(UserDataSyncErrorCode.Unauthorized);
				throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of Unauthorized (401).`, url, UserDataSyncErrorCode.Unauthorized, context.res.statusCode, operationId);
			}
			if (context.res.statusCode === 403) {
				this._onTokenFailed.fire(UserDataSyncErrorCode.Forbidden);
				throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the access is forbidden (403).`, url, UserDataSyncErrorCode.Forbidden, context.res.statusCode, operationId);
			}
		}

		this._onTokenSucceed.fire();

		if (context.res.statusCode === 404) {
			throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the requested resource is not found (404).`, url, UserDataSyncErrorCode.NotFound, context.res.statusCode, operationId);
		}

		if (context.res.statusCode === 405) {
			throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the requested endpoint is not found (405). ${failureMessage}`, url, UserDataSyncErrorCode.MethodNotFound, context.res.statusCode, operationId);
		}

		if (context.res.statusCode === 409) {
			throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of Conflict (409). There is new data for this resource. Make the request again with latest data.`, url, UserDataSyncErrorCode.Conflict, context.res.statusCode, operationId);
		}

		if (context.res.statusCode === 410) {
			throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the requested resource is not longer available (410).`, url, UserDataSyncErrorCode.Gone, context.res.statusCode, operationId);
		}

		if (context.res.statusCode === 412) {
			throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of Precondition Failed (412). There is new data for this resource. Make the request again with latest data.`, url, UserDataSyncErrorCode.PreconditionFailed, context.res.statusCode, operationId);
		}

		if (context.res.statusCode === 413) {
			throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too large payload (413).`, url, UserDataSyncErrorCode.TooLarge, context.res.statusCode, operationId);
		}

		if (context.res.statusCode === 426) {
			throw new UserDataSyncStoreError(`${options.type} request '${url}' failed with status Upgrade Required (426). Please upgrade the client and try again.`, url, UserDataSyncErrorCode.UpgradeRequired, context.res.statusCode, operationId);
		}

		if (context.res.statusCode === 429) {
			const retryAfter = context.res.headers['retry-after'];
			if (retryAfter) {
				this.setDonotMakeRequestsUntil(new Date(Date.now() + (parseInt(retryAfter) * 1000)));
				throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too many requests (429).`, url, UserDataSyncErrorCode.TooManyRequestsAndRetryAfter, context.res.statusCode, operationId);
			} else {
				throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too many requests (429).`, url, UserDataSyncErrorCode.TooManyRequests, context.res.statusCode, operationId);
			}
		}

		if (!isSuccess) {
			throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, url, UserDataSyncErrorCode.Unknown, context.res.statusCode, operationId);
		}

		return context;
	}

	private addSessionHeaders(headers: IHeaders): void {
		let machineSessionId = this.storageService.get(MACHINE_SESSION_ID_KEY, StorageScope.APPLICATION);
		if (machineSessionId === undefined) {
			machineSessionId = generateUuid();
			this.storageService.store(MACHINE_SESSION_ID_KEY, machineSessionId, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		headers['X-Machine-Session-Id'] = machineSessionId;

		const userSessionId = this.storageService.get(USER_SESSION_ID_KEY, StorageScope.APPLICATION);
		if (userSessionId !== undefined) {
			headers['X-User-Session-Id'] = userSessionId;
		}
	}

}

export class UserDataSyncStoreService extends UserDataSyncStoreClient implements IUserDataSyncStoreService {

	_serviceBrand: any;

	constructor(
		@IUserDataSyncStoreManagementService userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		@IProductService productService: IProductService,
		@IRequestService requestService: IRequestService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IStorageService storageService: IStorageService,
	) {
		super(userDataSyncStoreManagementService.userDataSyncStore?.url, productService, requestService, logService, environmentService, fileService, storageService);
		this._register(userDataSyncStoreManagementService.onDidChangeUserDataSyncStore(() => this.updateUserDataSyncStoreUrl(userDataSyncStoreManagementService.userDataSyncStore?.url)));
	}

}

export class RequestsSession {

	private requests: string[] = [];
	private startTime: Date | undefined = undefined;

	constructor(
		private readonly limit: number,
		private readonly interval: number, /* in ms */
		private readonly requestService: IRequestService,
		private readonly logService: IUserDataSyncLogService,
	) { }

	request(url: string, options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		if (this.isExpired()) {
			this.reset();
		}

		options.url = url;

		if (this.requests.length >= this.limit) {
			this.logService.info('Too many requests', ...this.requests);
			throw new UserDataSyncStoreError(`Too many requests. Only ${this.limit} requests allowed in ${this.interval / (1000 * 60)} minutes.`, url, UserDataSyncErrorCode.LocalTooManyRequests, undefined, undefined);
		}

		this.startTime = this.startTime || new Date();
		this.requests.push(url);

		return this.requestService.request(options, token);
	}

	private isExpired(): boolean {
		return this.startTime !== undefined && new Date().getTime() - this.startTime.getTime() > this.interval;
	}

	private reset(): void {
		this.requests = [];
		this.startTime = undefined;
	}

}
