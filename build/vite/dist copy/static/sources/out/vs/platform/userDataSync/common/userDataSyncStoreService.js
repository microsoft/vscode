/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { createCancelablePromise, timeout } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { Mimes } from '../../../base/common/mime.js';
import { isWeb } from '../../../base/common/platform.js';
import { joinPath, relativePath } from '../../../base/common/resources.js';
import { isObject, isString } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, asText, asTextOrError, hasNoContent, IRequestService, isSuccess, isSuccess as isSuccessContext } from '../../request/common/request.js';
import { getServiceMachineId } from '../../externalServices/common/serviceMachineId.js';
import { IStorageService } from '../../storage/common/storage.js';
import { HEADER_EXECUTION_ID, HEADER_OPERATION_ID, IUserDataSyncLogService, IUserDataSyncStoreManagementService, SYNC_SERVICE_URL_TYPE, UserDataSyncStoreError } from './userDataSync.js';
const CONFIGURATION_SYNC_STORE_KEY = 'configurationSync.store';
const SYNC_PREVIOUS_STORE = 'sync.previous.store';
const DONOT_MAKE_REQUESTS_UNTIL_KEY = 'sync.donot-make-requests-until';
const USER_SESSION_ID_KEY = 'sync.user-session-id';
const MACHINE_SESSION_ID_KEY = 'sync.machine-session-id';
const REQUEST_SESSION_LIMIT = 100;
const REQUEST_SESSION_INTERVAL = 1000 * 60 * 5; /* 5 minutes */
let AbstractUserDataSyncStoreManagementService = class AbstractUserDataSyncStoreManagementService extends Disposable {
    get userDataSyncStore() { return this._userDataSyncStore; }
    get userDataSyncStoreType() {
        return this.storageService.get(SYNC_SERVICE_URL_TYPE, -1 /* StorageScope.APPLICATION */);
    }
    set userDataSyncStoreType(type) {
        this.storageService.store(SYNC_SERVICE_URL_TYPE, type, -1 /* StorageScope.APPLICATION */, isWeb ? 0 /* StorageTarget.USER */ : 1 /* StorageTarget.MACHINE */);
    }
    constructor(productService, configurationService, storageService) {
        super();
        this.productService = productService;
        this.configurationService = configurationService;
        this.storageService = storageService;
        this._onDidChangeUserDataSyncStore = this._register(new Emitter());
        this.onDidChangeUserDataSyncStore = this._onDidChangeUserDataSyncStore.event;
        this.updateUserDataSyncStore();
        const disposable = this._register(new DisposableStore());
        this._register(Event.filter(storageService.onDidChangeValue(-1 /* StorageScope.APPLICATION */, SYNC_SERVICE_URL_TYPE, disposable), () => this.userDataSyncStoreType !== this.userDataSyncStore?.type, disposable)(() => this.updateUserDataSyncStore()));
    }
    updateUserDataSyncStore() {
        this._userDataSyncStore = this.toUserDataSyncStore(this.productService[CONFIGURATION_SYNC_STORE_KEY]);
        this._onDidChangeUserDataSyncStore.fire();
    }
    toUserDataSyncStore(configurationSyncStore) {
        if (!configurationSyncStore) {
            return undefined;
        }
        // Check for web overrides for backward compatibility while reading previous store
        configurationSyncStore = isWeb && configurationSyncStore.web ? { ...configurationSyncStore, ...configurationSyncStore.web } : configurationSyncStore;
        if (isString(configurationSyncStore.url)
            && isObject(configurationSyncStore.authenticationProviders)
            && Object.keys(configurationSyncStore.authenticationProviders).every(authenticationProviderId => Array.isArray(configurationSyncStore.authenticationProviders[authenticationProviderId].scopes))) {
            const syncStore = configurationSyncStore;
            const canSwitch = !!syncStore.canSwitch;
            const defaultType = syncStore.url === syncStore.insidersUrl ? 'insiders' : 'stable';
            const type = (canSwitch ? this.userDataSyncStoreType : undefined) || defaultType;
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
                authenticationProviders: Object.keys(syncStore.authenticationProviders).reduce((result, id) => {
                    result.push({ id, scopes: syncStore.authenticationProviders[id].scopes });
                    return result;
                }, [])
            };
        }
        return undefined;
    }
};
AbstractUserDataSyncStoreManagementService = __decorate([
    __param(0, IProductService),
    __param(1, IConfigurationService),
    __param(2, IStorageService)
], AbstractUserDataSyncStoreManagementService);
export { AbstractUserDataSyncStoreManagementService };
let UserDataSyncStoreManagementService = class UserDataSyncStoreManagementService extends AbstractUserDataSyncStoreManagementService {
    constructor(productService, configurationService, storageService) {
        super(productService, configurationService, storageService);
        const previousConfigurationSyncStore = this.storageService.get(SYNC_PREVIOUS_STORE, -1 /* StorageScope.APPLICATION */);
        if (previousConfigurationSyncStore) {
            this.previousConfigurationSyncStore = JSON.parse(previousConfigurationSyncStore);
        }
        const syncStore = this.productService[CONFIGURATION_SYNC_STORE_KEY];
        if (syncStore) {
            this.storageService.store(SYNC_PREVIOUS_STORE, JSON.stringify(syncStore), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(SYNC_PREVIOUS_STORE, -1 /* StorageScope.APPLICATION */);
        }
    }
    async switch(type) {
        if (type !== this.userDataSyncStoreType) {
            this.userDataSyncStoreType = type;
            this.updateUserDataSyncStore();
        }
    }
    async getPreviousUserDataSyncStore() {
        return this.toUserDataSyncStore(this.previousConfigurationSyncStore);
    }
};
UserDataSyncStoreManagementService = __decorate([
    __param(0, IProductService),
    __param(1, IConfigurationService),
    __param(2, IStorageService)
], UserDataSyncStoreManagementService);
export { UserDataSyncStoreManagementService };
let UserDataSyncStoreClient = class UserDataSyncStoreClient extends Disposable {
    get donotMakeRequestsUntil() { return this._donotMakeRequestsUntil; }
    constructor(userDataSyncStoreUrl, productService, requestService, logService, environmentService, fileService, storageService) {
        super();
        this.requestService = requestService;
        this.logService = logService;
        this.storageService = storageService;
        this._onTokenFailed = this._register(new Emitter());
        this.onTokenFailed = this._onTokenFailed.event;
        this._onTokenSucceed = this._register(new Emitter());
        this.onTokenSucceed = this._onTokenSucceed.event;
        this._donotMakeRequestsUntil = undefined;
        this._onDidChangeDonotMakeRequestsUntil = this._register(new Emitter());
        this.onDidChangeDonotMakeRequestsUntil = this._onDidChangeDonotMakeRequestsUntil.event;
        this.resetDonotMakeRequestsUntilPromise = undefined;
        this.updateUserDataSyncStoreUrl(userDataSyncStoreUrl);
        this.commonHeadersPromise = getServiceMachineId(environmentService, fileService, storageService)
            .then(uuid => {
            const headers = {
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
    setAuthToken(token, type) {
        this.authToken = { token, type };
    }
    updateUserDataSyncStoreUrl(userDataSyncStoreUrl) {
        this.userDataSyncStoreUrl = userDataSyncStoreUrl ? joinPath(userDataSyncStoreUrl, 'v1') : undefined;
    }
    initDonotMakeRequestsUntil() {
        const donotMakeRequestsUntil = this.storageService.getNumber(DONOT_MAKE_REQUESTS_UNTIL_KEY, -1 /* StorageScope.APPLICATION */);
        if (donotMakeRequestsUntil && Date.now() < donotMakeRequestsUntil) {
            this.setDonotMakeRequestsUntil(new Date(donotMakeRequestsUntil));
        }
    }
    setDonotMakeRequestsUntil(donotMakeRequestsUntil) {
        if (this._donotMakeRequestsUntil?.getTime() !== donotMakeRequestsUntil?.getTime()) {
            this._donotMakeRequestsUntil = donotMakeRequestsUntil;
            if (this.resetDonotMakeRequestsUntilPromise) {
                this.resetDonotMakeRequestsUntilPromise.cancel();
                this.resetDonotMakeRequestsUntilPromise = undefined;
            }
            if (this._donotMakeRequestsUntil) {
                this.storageService.store(DONOT_MAKE_REQUESTS_UNTIL_KEY, this._donotMakeRequestsUntil.getTime(), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
                this.resetDonotMakeRequestsUntilPromise = createCancelablePromise(token => timeout(this._donotMakeRequestsUntil.getTime() - Date.now(), token).then(() => this.setDonotMakeRequestsUntil(undefined)));
                this.resetDonotMakeRequestsUntilPromise.then(null, e => null /* ignore error */);
            }
            else {
                this.storageService.remove(DONOT_MAKE_REQUESTS_UNTIL_KEY, -1 /* StorageScope.APPLICATION */);
            }
            this._onDidChangeDonotMakeRequestsUntil.fire();
        }
    }
    // #region Collection
    async getAllCollections(headers = {}) {
        if (!this.userDataSyncStoreUrl) {
            throw new Error('No settings sync store url configured.');
        }
        const url = joinPath(this.userDataSyncStoreUrl, 'collection').toString();
        headers = { ...headers };
        headers['Content-Type'] = 'application/json';
        const context = await this.request(url, { type: 'GET', headers, callSite: 'userDataSync.getAllCollections' }, [], CancellationToken.None);
        return (await asJson(context))?.map(({ id }) => id) || [];
    }
    async createCollection(headers = {}) {
        if (!this.userDataSyncStoreUrl) {
            throw new Error('No settings sync store url configured.');
        }
        const url = joinPath(this.userDataSyncStoreUrl, 'collection').toString();
        headers = { ...headers };
        headers['Content-Type'] = Mimes.text;
        const context = await this.request(url, { type: 'POST', headers, callSite: 'userDataSync.createCollection' }, [], CancellationToken.None);
        const collectionId = await asTextOrError(context);
        if (!collectionId) {
            throw new UserDataSyncStoreError('Server did not return the collection id', url, "NoCollection" /* UserDataSyncErrorCode.NoCollection */, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
        }
        return collectionId;
    }
    async deleteCollection(collection, headers = {}) {
        if (!this.userDataSyncStoreUrl) {
            throw new Error('No settings sync store url configured.');
        }
        const url = collection ? joinPath(this.userDataSyncStoreUrl, 'collection', collection).toString() : joinPath(this.userDataSyncStoreUrl, 'collection').toString();
        headers = { ...headers };
        await this.request(url, { type: 'DELETE', headers, callSite: 'userDataSync.deleteCollection' }, [], CancellationToken.None);
    }
    // #endregion
    // #region Resource
    async getAllResourceRefs(resource, collection) {
        if (!this.userDataSyncStoreUrl) {
            throw new Error('No settings sync store url configured.');
        }
        const uri = this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource);
        const headers = {};
        const context = await this.request(uri.toString(), { type: 'GET', headers, callSite: 'userDataSync.getAllResourceRefs' }, [], CancellationToken.None);
        const result = await asJson(context) || [];
        return result.map(({ url, created }) => ({ ref: relativePath(uri, uri.with({ path: url })), created: created * 1000 /* Server returns in seconds */ }));
    }
    async resolveResourceContent(resource, ref, collection, headers = {}) {
        if (!this.userDataSyncStoreUrl) {
            throw new Error('No settings sync store url configured.');
        }
        const url = joinPath(this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource), ref).toString();
        headers = { ...headers };
        headers['Cache-Control'] = 'no-cache';
        const context = await this.request(url, { type: 'GET', headers, callSite: 'userDataSync.resolveResourceContent' }, [], CancellationToken.None);
        const content = await asTextOrError(context);
        return content;
    }
    async deleteResource(resource, ref, collection) {
        if (!this.userDataSyncStoreUrl) {
            throw new Error('No settings sync store url configured.');
        }
        const url = ref !== null ? joinPath(this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource), ref).toString() : this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource).toString();
        const headers = {};
        await this.request(url, { type: 'DELETE', headers, callSite: 'userDataSync.deleteResource' }, [], CancellationToken.None);
    }
    async deleteResources() {
        if (!this.userDataSyncStoreUrl) {
            throw new Error('No settings sync store url configured.');
        }
        const url = joinPath(this.userDataSyncStoreUrl, 'resource').toString();
        const headers = { 'Content-Type': Mimes.text };
        await this.request(url, { type: 'DELETE', headers, callSite: 'userDataSync.deleteResources' }, [], CancellationToken.None);
    }
    async readResource(resource, oldValue, collection, headers = {}) {
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
        const context = await this.request(url, { type: 'GET', headers, callSite: 'userDataSync.readResource' }, [304], CancellationToken.None);
        let userData = null;
        if (context.res.statusCode === 304) {
            userData = oldValue;
        }
        if (userData === null) {
            const ref = context.res.headers['etag'];
            if (!ref) {
                throw new UserDataSyncStoreError('Server did not return the ref', url, "NoRef" /* UserDataSyncErrorCode.NoRef */, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
            }
            const content = await asTextOrError(context);
            if (!content && context.res.statusCode === 304) {
                throw new UserDataSyncStoreError('Empty response', url, "EmptyResponse" /* UserDataSyncErrorCode.EmptyResponse */, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
            }
            userData = { ref, content };
        }
        return userData;
    }
    async writeResource(resource, data, ref, collection, headers = {}) {
        if (!this.userDataSyncStoreUrl) {
            throw new Error('No settings sync store url configured.');
        }
        const url = this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource).toString();
        headers = { ...headers };
        headers['Content-Type'] = Mimes.text;
        if (ref) {
            headers['If-Match'] = ref;
        }
        const context = await this.request(url, { type: 'POST', data, headers, callSite: 'userDataSync.writeResource' }, [], CancellationToken.None);
        const newRef = context.res.headers['etag'];
        if (!newRef) {
            throw new UserDataSyncStoreError('Server did not return the ref', url, "NoRef" /* UserDataSyncErrorCode.NoRef */, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
        }
        return newRef;
    }
    // #endregion
    async manifest(oldValue, headers = {}) {
        if (!this.userDataSyncStoreUrl) {
            throw new Error('No settings sync store url configured.');
        }
        const url = joinPath(this.userDataSyncStoreUrl, 'manifest').toString();
        headers = { ...headers };
        headers['Content-Type'] = 'application/json';
        if (oldValue) {
            headers['If-None-Match'] = oldValue.ref;
        }
        const context = await this.request(url, { type: 'GET', headers, callSite: 'userDataSync.manifest' }, [304], CancellationToken.None);
        let manifest = null;
        if (context.res.statusCode === 304) {
            manifest = oldValue;
        }
        if (!manifest) {
            const ref = context.res.headers['etag'];
            if (!ref) {
                throw new UserDataSyncStoreError('Server did not return the ref', url, "NoRef" /* UserDataSyncErrorCode.NoRef */, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
            }
            const content = await asTextOrError(context);
            if (!content && context.res.statusCode === 304) {
                throw new UserDataSyncStoreError('Empty response', url, "EmptyResponse" /* UserDataSyncErrorCode.EmptyResponse */, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
            }
            if (content) {
                manifest = { ...JSON.parse(content), ref };
            }
        }
        const currentSessionId = this.storageService.get(USER_SESSION_ID_KEY, -1 /* StorageScope.APPLICATION */);
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
            this.storageService.store(USER_SESSION_ID_KEY, manifest.session, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
        return manifest;
    }
    async clear() {
        if (!this.userDataSyncStoreUrl) {
            throw new Error('No settings sync store url configured.');
        }
        await this.deleteCollection();
        await this.deleteResources();
        // clear cached session.
        this.clearSession();
    }
    async getLatestData(headers = {}) {
        if (!this.userDataSyncStoreUrl) {
            throw new Error('No settings sync store url configured.');
        }
        const url = joinPath(this.userDataSyncStoreUrl, 'download', 'latest').toString();
        headers = { ...headers };
        headers['Content-Type'] = 'application/json';
        const context = await this.request(url, { type: 'GET', headers, callSite: 'userDataSync.getLatestData' }, [], CancellationToken.None);
        if (!isSuccess(context)) {
            throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, url, "EmptyResponse" /* UserDataSyncErrorCode.EmptyResponse */, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
        }
        const serverData = await asJson(context);
        if (!serverData) {
            return null;
        }
        const result = {};
        if (serverData.resources) {
            result.resources = {};
            for (const resource in serverData.resources) {
                const [resourceData] = serverData.resources[resource];
                result.resources[resource] = {
                    content: resourceData.content,
                    ref: resourceData.ref
                };
            }
        }
        if (serverData.collections) {
            result.collections = {};
            for (const collection in serverData.collections) {
                const resources = {};
                result.collections[collection] = { resources };
                for (const resource in serverData.collections[collection].resources) {
                    const [resourceData] = serverData.collections[collection].resources[resource];
                    resources[resource] = {
                        content: resourceData.content,
                        ref: resourceData.ref
                    };
                }
            }
        }
        return result;
    }
    async getActivityData() {
        if (!this.userDataSyncStoreUrl) {
            throw new Error('No settings sync store url configured.');
        }
        const url = joinPath(this.userDataSyncStoreUrl, 'download').toString();
        const headers = {};
        const context = await this.request(url, { type: 'GET', headers, callSite: 'userDataSync.getActivityData' }, [], CancellationToken.None);
        if (!isSuccess(context)) {
            throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, url, "EmptyResponse" /* UserDataSyncErrorCode.EmptyResponse */, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
        }
        if (hasNoContent(context)) {
            throw new UserDataSyncStoreError('Empty response', url, "EmptyResponse" /* UserDataSyncErrorCode.EmptyResponse */, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
        }
        return context.stream;
    }
    getResourceUrl(userDataSyncStoreUrl, collection, resource) {
        return collection ? joinPath(userDataSyncStoreUrl, 'collection', collection, 'resource', resource) : joinPath(userDataSyncStoreUrl, 'resource', resource);
    }
    clearSession() {
        this.storageService.remove(USER_SESSION_ID_KEY, -1 /* StorageScope.APPLICATION */);
        this.storageService.remove(MACHINE_SESSION_ID_KEY, -1 /* StorageScope.APPLICATION */);
    }
    async request(url, options, successCodes, token) {
        if (!this.authToken) {
            throw new UserDataSyncStoreError('No Auth Token Available', url, "Unauthorized" /* UserDataSyncErrorCode.Unauthorized */, undefined, undefined);
        }
        if (this._donotMakeRequestsUntil && Date.now() < this._donotMakeRequestsUntil.getTime()) {
            throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too many requests (429).`, url, "TooManyRequestsAndRetryAfter" /* UserDataSyncErrorCode.TooManyRequestsAndRetryAfter */, undefined, undefined);
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
        }
        catch (e) {
            if (!(e instanceof UserDataSyncStoreError)) {
                let code = "RequestFailed" /* UserDataSyncErrorCode.RequestFailed */;
                const errorMessage = getErrorMessage(e).toLowerCase();
                // Request timed out
                if (errorMessage.includes('xhr timeout')) {
                    code = "RequestTimeout" /* UserDataSyncErrorCode.RequestTimeout */;
                }
                // Request protocol not supported
                else if (errorMessage.includes('protocol') && errorMessage.includes('not supported')) {
                    code = "RequestProtocolNotSupported" /* UserDataSyncErrorCode.RequestProtocolNotSupported */;
                }
                // Request path not escaped
                else if (errorMessage.includes('request path contains unescaped characters')) {
                    code = "RequestPathNotEscaped" /* UserDataSyncErrorCode.RequestPathNotEscaped */;
                }
                // Request header not an object
                else if (errorMessage.includes('headers must be an object')) {
                    code = "RequestHeadersNotObject" /* UserDataSyncErrorCode.RequestHeadersNotObject */;
                }
                // Request canceled
                else if (isCancellationError(e)) {
                    code = "RequestCanceled" /* UserDataSyncErrorCode.RequestCanceled */;
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
        }
        else {
            failureMessage = await asText(context) || '';
            this.logService.info('Request failed', requestInfo, failureMessage);
        }
        if (context.res.statusCode === 401 || context.res.statusCode === 403) {
            this.authToken = undefined;
            if (context.res.statusCode === 401) {
                this._onTokenFailed.fire("Unauthorized" /* UserDataSyncErrorCode.Unauthorized */);
                throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of Unauthorized (401).`, url, "Unauthorized" /* UserDataSyncErrorCode.Unauthorized */, context.res.statusCode, operationId);
            }
            if (context.res.statusCode === 403) {
                this._onTokenFailed.fire("Forbidden" /* UserDataSyncErrorCode.Forbidden */);
                throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the access is forbidden (403).`, url, "Forbidden" /* UserDataSyncErrorCode.Forbidden */, context.res.statusCode, operationId);
            }
        }
        this._onTokenSucceed.fire();
        if (context.res.statusCode === 404) {
            throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the requested resource is not found (404).`, url, "NotFound" /* UserDataSyncErrorCode.NotFound */, context.res.statusCode, operationId);
        }
        if (context.res.statusCode === 405) {
            throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the requested endpoint is not found (405). ${failureMessage}`, url, "MethodNotFound" /* UserDataSyncErrorCode.MethodNotFound */, context.res.statusCode, operationId);
        }
        if (context.res.statusCode === 409) {
            throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of Conflict (409). There is new data for this resource. Make the request again with latest data.`, url, "Conflict" /* UserDataSyncErrorCode.Conflict */, context.res.statusCode, operationId);
        }
        if (context.res.statusCode === 410) {
            throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the requested resource is not longer available (410).`, url, "Gone" /* UserDataSyncErrorCode.Gone */, context.res.statusCode, operationId);
        }
        if (context.res.statusCode === 412) {
            throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of Precondition Failed (412). There is new data for this resource. Make the request again with latest data.`, url, "PreconditionFailed" /* UserDataSyncErrorCode.PreconditionFailed */, context.res.statusCode, operationId);
        }
        if (context.res.statusCode === 413) {
            throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too large payload (413).`, url, "TooLarge" /* UserDataSyncErrorCode.TooLarge */, context.res.statusCode, operationId);
        }
        if (context.res.statusCode === 426) {
            throw new UserDataSyncStoreError(`${options.type} request '${url}' failed with status Upgrade Required (426). Please upgrade the client and try again.`, url, "UpgradeRequired" /* UserDataSyncErrorCode.UpgradeRequired */, context.res.statusCode, operationId);
        }
        if (context.res.statusCode === 429) {
            const retryAfter = context.res.headers['retry-after'];
            if (retryAfter) {
                this.setDonotMakeRequestsUntil(new Date(Date.now() + (parseInt(retryAfter) * 1000)));
                throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too many requests (429).`, url, "TooManyRequestsAndRetryAfter" /* UserDataSyncErrorCode.TooManyRequestsAndRetryAfter */, context.res.statusCode, operationId);
            }
            else {
                throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too many requests (429).`, url, "RemoteTooManyRequests" /* UserDataSyncErrorCode.TooManyRequests */, context.res.statusCode, operationId);
            }
        }
        if (!isSuccess) {
            throw new UserDataSyncStoreError('Server returned ' + context.res.statusCode, url, "Unknown" /* UserDataSyncErrorCode.Unknown */, context.res.statusCode, operationId);
        }
        return context;
    }
    addSessionHeaders(headers) {
        let machineSessionId = this.storageService.get(MACHINE_SESSION_ID_KEY, -1 /* StorageScope.APPLICATION */);
        if (machineSessionId === undefined) {
            machineSessionId = generateUuid();
            this.storageService.store(MACHINE_SESSION_ID_KEY, machineSessionId, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
        headers['X-Machine-Session-Id'] = machineSessionId;
        const userSessionId = this.storageService.get(USER_SESSION_ID_KEY, -1 /* StorageScope.APPLICATION */);
        if (userSessionId !== undefined) {
            headers['X-User-Session-Id'] = userSessionId;
        }
    }
};
UserDataSyncStoreClient = __decorate([
    __param(1, IProductService),
    __param(2, IRequestService),
    __param(3, IUserDataSyncLogService),
    __param(4, IEnvironmentService),
    __param(5, IFileService),
    __param(6, IStorageService)
], UserDataSyncStoreClient);
export { UserDataSyncStoreClient };
let UserDataSyncStoreService = class UserDataSyncStoreService extends UserDataSyncStoreClient {
    constructor(userDataSyncStoreManagementService, productService, requestService, logService, environmentService, fileService, storageService) {
        super(userDataSyncStoreManagementService.userDataSyncStore?.url, productService, requestService, logService, environmentService, fileService, storageService);
        this._register(userDataSyncStoreManagementService.onDidChangeUserDataSyncStore(() => this.updateUserDataSyncStoreUrl(userDataSyncStoreManagementService.userDataSyncStore?.url)));
    }
};
UserDataSyncStoreService = __decorate([
    __param(0, IUserDataSyncStoreManagementService),
    __param(1, IProductService),
    __param(2, IRequestService),
    __param(3, IUserDataSyncLogService),
    __param(4, IEnvironmentService),
    __param(5, IFileService),
    __param(6, IStorageService)
], UserDataSyncStoreService);
export { UserDataSyncStoreService };
export class RequestsSession {
    constructor(limit, interval, /* in ms */ requestService, logService) {
        this.limit = limit;
        this.interval = interval;
        this.requestService = requestService;
        this.logService = logService;
        this.requests = [];
        this.startTime = undefined;
    }
    request(url, options, token) {
        if (this.isExpired()) {
            this.reset();
        }
        options.url = url;
        if (this.requests.length >= this.limit) {
            this.logService.info('Too many requests', ...this.requests);
            throw new UserDataSyncStoreError(`Too many requests. Only ${this.limit} requests allowed in ${this.interval / (1000 * 60)} minutes.`, url, "LocalTooManyRequests" /* UserDataSyncErrorCode.LocalTooManyRequests */, undefined, undefined);
        }
        this.startTime = this.startTime || new Date();
        this.requests.push(url);
        return this.requestService.request(options, token);
    }
    isExpired() {
        return this.startTime !== undefined && new Date().getTime() - this.startTime.getTime() > this.interval;
    }
    reset() {
        this.requests = [];
        this.startTime = undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNwRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZUFBZSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDdEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDckQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXpELE9BQU8sRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNuRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRTVELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2QkFB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