/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { IStringDictionary } from 'vs/base/common/collections';
import { Event } from 'vs/base/common/event';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IExtUri, isEqualOrParent, joinPath } from 'vs/base/common/resources';
import { isObject, isString } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IHeaders } from 'vs/base/parts/request/common/request';
import { localize } from 'vs/nls';
import { allSettings, ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { EXTENSION_IDENTIFIER_PATTERN, IExtensionIdentifier } from 'vs/platform/extensionManagement/common/extensionManagement';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { Registry } from 'vs/platform/registry/common/platform';

export const CONFIGURATION_SYNC_STORE_KEY = 'configurationSync.store';

export function getDisallowedIgnoredSettings(): string[] {
	const allSettings = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
	return Object.keys(allSettings).filter(setting => !!allSettings[setting].disallowSyncIgnore);
}

export function getDefaultIgnoredSettings(): string[] {
	const allSettings = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
	const ignoreSyncSettings = Object.keys(allSettings).filter(setting => !!allSettings[setting].ignoreSync);
	const machineSettings = Object.keys(allSettings).filter(setting => allSettings[setting].scope === ConfigurationScope.MACHINE || allSettings[setting].scope === ConfigurationScope.MACHINE_OVERRIDABLE);
	const disallowedSettings = getDisallowedIgnoredSettings();
	return distinct([CONFIGURATION_SYNC_STORE_KEY, ...ignoreSyncSettings, ...machineSettings, ...disallowedSettings]);
}

export const USER_DATA_SYNC_CONFIGURATION_SCOPE = 'settingsSync';

export interface IUserDataSyncConfiguration {
	keybindingsPerPlatform?: boolean;
	ignoredExtensions?: string[];
	ignoredSettings?: string[];
}

export function registerConfiguration(): IDisposable {
	const ignoredSettingsSchemaId = 'vscode://schemas/ignoredSettings';
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	configurationRegistry.registerConfiguration({
		id: 'settingsSync',
		order: 30,
		title: localize('settings sync', "Settings Sync"),
		type: 'object',
		properties: {
			'settingsSync.keybindingsPerPlatform': {
				type: 'boolean',
				description: localize('settingsSync.keybindingsPerPlatform', "Synchronize keybindings for each platform."),
				default: true,
				scope: ConfigurationScope.APPLICATION,
				tags: ['sync', 'usesOnlineServices']
			},
			'settingsSync.ignoredExtensions': {
				'type': 'array',
				markdownDescription: localize('settingsSync.ignoredExtensions', "List of extensions to be ignored while synchronizing. The identifier of an extension is always `${publisher}.${name}`. For example: `vscode.csharp`."),
				items: [{
					type: 'string',
					pattern: EXTENSION_IDENTIFIER_PATTERN,
					errorMessage: localize('app.extension.identifier.errorMessage', "Expected format '${publisher}.${name}'. Example: 'vscode.csharp'.")
				}],
				'default': [],
				'scope': ConfigurationScope.APPLICATION,
				uniqueItems: true,
				disallowSyncIgnore: true,
				tags: ['sync', 'usesOnlineServices']
			},
			'settingsSync.ignoredSettings': {
				'type': 'array',
				description: localize('settingsSync.ignoredSettings', "Configure settings to be ignored while synchronizing."),
				'default': [],
				'scope': ConfigurationScope.APPLICATION,
				$ref: ignoredSettingsSchemaId,
				additionalProperties: true,
				uniqueItems: true,
				disallowSyncIgnore: true,
				tags: ['sync', 'usesOnlineServices']
			}
		}
	});
	const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
	const registerIgnoredSettingsSchema = () => {
		const disallowedIgnoredSettings = getDisallowedIgnoredSettings();
		const defaultIgnoredSettings = getDefaultIgnoredSettings().filter(s => s !== CONFIGURATION_SYNC_STORE_KEY);
		const settings = Object.keys(allSettings.properties).filter(setting => defaultIgnoredSettings.indexOf(setting) === -1);
		const ignoredSettings = defaultIgnoredSettings.filter(setting => disallowedIgnoredSettings.indexOf(setting) === -1);
		const ignoredSettingsSchema: IJSONSchema = {
			items: {
				type: 'string',
				enum: [...settings, ...ignoredSettings.map(setting => `-${setting}`)]
			},
		};
		jsonRegistry.registerSchema(ignoredSettingsSchemaId, ignoredSettingsSchema);
	};
	return configurationRegistry.onDidUpdateConfiguration(() => registerIgnoredSettingsSchema());
}

// #region User Data Sync Store

export interface IUserData {
	ref: string;
	content: string | null;
}

export type IAuthenticationProvider = { id: string; scopes: string[] };

export interface IUserDataSyncStore {
	readonly url: URI;
	readonly type: UserDataSyncStoreType;
	readonly defaultUrl: URI;
	readonly stableUrl: URI;
	readonly insidersUrl: URI;
	readonly canSwitch: boolean;
	readonly authenticationProviders: IAuthenticationProvider[];
}

export function isAuthenticationProvider(thing: any): thing is IAuthenticationProvider {
	return thing
		&& isObject(thing)
		&& isString(thing.id)
		&& Array.isArray(thing.scopes);
}

export const enum SyncResource {
	Settings = 'settings',
	Keybindings = 'keybindings',
	Snippets = 'snippets',
	Tasks = 'tasks',
	Extensions = 'extensions',
	GlobalState = 'globalState',
}
export const ALL_SYNC_RESOURCES: SyncResource[] = [SyncResource.Settings, SyncResource.Keybindings, SyncResource.Snippets, SyncResource.Tasks, SyncResource.Extensions, SyncResource.GlobalState];

export function getLastSyncResourceUri(syncResource: SyncResource, environmentService: IEnvironmentService, extUri: IExtUri): URI {
	return extUri.joinPath(environmentService.userDataSyncHome, syncResource, `lastSync${syncResource}.json`);
}

export type IUserDataResourceManifest = Record<ServerResource, string>;

export interface IUserDataCollectionManifest {
	[collectionId: string]: {
		readonly latest: IUserDataResourceManifest;
	};
}

export interface IUserDataManifest {
	readonly latest?: IUserDataResourceManifest;
	readonly session: string;
	readonly ref: string;
	readonly collections?: IUserDataCollectionManifest;
}

export interface IResourceRefHandle {
	ref: string;
	created: number;
}

export type ServerResource = SyncResource | 'machines' | 'editSessions';
export type UserDataSyncStoreType = 'insiders' | 'stable';

export const IUserDataSyncStoreManagementService = createDecorator<IUserDataSyncStoreManagementService>('IUserDataSyncStoreManagementService');
export interface IUserDataSyncStoreManagementService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeUserDataSyncStore: Event<void>;
	readonly userDataSyncStore: IUserDataSyncStore | undefined;
	switch(type: UserDataSyncStoreType): Promise<void>;
	getPreviousUserDataSyncStore(): Promise<IUserDataSyncStore | undefined>;
}

export const IUserDataSyncStoreService = createDecorator<IUserDataSyncStoreService>('IUserDataSyncStoreService');
export interface IUserDataSyncStoreService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeDonotMakeRequestsUntil: Event<void>;
	readonly donotMakeRequestsUntil: Date | undefined;

	readonly onTokenFailed: Event<void>;
	readonly onTokenSucceed: Event<void>;
	setAuthToken(token: string, type: string): void;

	manifest(oldValue: IUserDataManifest | null, headers?: IHeaders): Promise<IUserDataManifest | null>;
	readResource(resource: ServerResource, oldValue: IUserData | null, collection?: string, headers?: IHeaders): Promise<IUserData>;
	writeResource(resource: ServerResource, content: string, ref: string | null, collection?: string, headers?: IHeaders): Promise<string>;
	deleteResource(resource: ServerResource, ref: string | null, collection?: string): Promise<void>;
	getAllResourceRefs(resource: ServerResource, collection?: string): Promise<IResourceRefHandle[]>;
	resolveResourceContent(resource: ServerResource, ref: string, collection?: string, headers?: IHeaders): Promise<string | null>;

	getAllCollections(headers?: IHeaders): Promise<string[]>;
	createCollection(headers?: IHeaders): Promise<string>;
	deleteCollection(collection?: string, headers?: IHeaders): Promise<void>;

	clear(): Promise<void>;
}

export const IUserDataSyncBackupStoreService = createDecorator<IUserDataSyncBackupStoreService>('IUserDataSyncBackupStoreService');
export interface IUserDataSyncBackupStoreService {
	readonly _serviceBrand: undefined;
	backup(resource: SyncResource, content: string): Promise<void>;
	getAllRefs(resource: SyncResource): Promise<IResourceRefHandle[]>;
	resolveContent(resource: SyncResource, ref?: string): Promise<string | null>;
}

//#endregion

// #region User Data Sync Headers

export const HEADER_OPERATION_ID = 'x-operation-id';
export const HEADER_EXECUTION_ID = 'X-Execution-Id';

export function createSyncHeaders(executionId: string): IHeaders {
	const headers: IHeaders = {};
	headers[HEADER_EXECUTION_ID] = executionId;
	return headers;
}

//#endregion

// #region User Data Sync Error

export const enum UserDataSyncErrorCode {
	// Client Errors (>= 400 )
	Unauthorized = 'Unauthorized', /* 401 */
	Conflict = 'Conflict', /* 409 */
	Gone = 'Gone', /* 410 */
	PreconditionFailed = 'PreconditionFailed', /* 412 */
	TooLarge = 'TooLarge', /* 413 */
	UpgradeRequired = 'UpgradeRequired', /* 426 */
	PreconditionRequired = 'PreconditionRequired', /* 428 */
	TooManyRequests = 'RemoteTooManyRequests', /* 429 */
	TooManyRequestsAndRetryAfter = 'TooManyRequestsAndRetryAfter', /* 429 + Retry-After */

	// Local Errors
	RequestFailed = 'RequestFailed',
	RequestCanceled = 'RequestCanceled',
	RequestTimeout = 'RequestTimeout',
	RequestProtocolNotSupported = 'RequestProtocolNotSupported',
	RequestPathNotEscaped = 'RequestPathNotEscaped',
	RequestHeadersNotObject = 'RequestHeadersNotObject',
	NoCollection = 'NoCollection',
	NoRef = 'NoRef',
	EmptyResponse = 'EmptyResponse',
	TurnedOff = 'TurnedOff',
	SessionExpired = 'SessionExpired',
	ServiceChanged = 'ServiceChanged',
	DefaultServiceChanged = 'DefaultServiceChanged',
	LocalTooManyRequests = 'LocalTooManyRequests',
	LocalPreconditionFailed = 'LocalPreconditionFailed',
	LocalInvalidContent = 'LocalInvalidContent',
	LocalError = 'LocalError',
	IncompatibleLocalContent = 'IncompatibleLocalContent',
	IncompatibleRemoteContent = 'IncompatibleRemoteContent',
	UnresolvedConflicts = 'UnresolvedConflicts',

	Unknown = 'Unknown',
}

export class UserDataSyncError extends Error {

	constructor(
		message: string,
		readonly code: UserDataSyncErrorCode,
		readonly resource?: SyncResource,
		readonly operationId?: string
	) {
		super(message);
		this.name = `${this.code} (UserDataSyncError) syncResource:${this.resource || 'unknown'} operationId:${this.operationId || 'unknown'}`;
	}

}

export class UserDataSyncStoreError extends UserDataSyncError {
	constructor(message: string, readonly url: string, code: UserDataSyncErrorCode, readonly serverCode: number | undefined, operationId: string | undefined) {
		super(message, code, undefined, operationId);
	}
}

export class UserDataAutoSyncError extends UserDataSyncError {
	constructor(message: string, code: UserDataSyncErrorCode) {
		super(message, code);
	}
}

export namespace UserDataSyncError {

	export function toUserDataSyncError(error: Error): UserDataSyncError {
		if (error instanceof UserDataSyncError) {
			return error;
		}
		const match = /^(.+) \(UserDataSyncError\) syncResource:(.+) operationId:(.+)$/.exec(error.name);
		if (match && match[1]) {
			const syncResource = match[2] === 'unknown' ? undefined : match[2] as SyncResource;
			const operationId = match[3] === 'unknown' ? undefined : match[3];
			return new UserDataSyncError(error.message, <UserDataSyncErrorCode>match[1], syncResource, operationId);
		}
		return new UserDataSyncError(error.message, UserDataSyncErrorCode.Unknown);
	}

}

//#endregion

// #region User Data Synchroniser

export interface ISyncExtension {
	identifier: IExtensionIdentifier;
	preRelease?: boolean;
	version?: string;
	disabled?: boolean;
	installed?: boolean;
	state?: IStringDictionary<any>;
}

export interface ISyncExtensionWithVersion extends ISyncExtension {
	version: string;
}

export interface IStorageValue {
	version: number;
	value: string;
}

export interface IGlobalState {
	storage: IStringDictionary<IStorageValue>;
}

export const enum SyncStatus {
	Uninitialized = 'uninitialized',
	Idle = 'idle',
	Syncing = 'syncing',
	HasConflicts = 'hasConflicts',
}

export interface ISyncResourceHandle {
	created: number;
	uri: URI;
}

export interface IRemoteUserData {
	ref: string;
	syncData: ISyncData | null;
}

export interface ISyncData {
	version: number;
	machineId?: string;
	content: string;
}

export const enum Change {
	None,
	Added,
	Modified,
	Deleted,
}

export const enum MergeState {
	Preview = 'preview',
	Conflict = 'conflict',
	Accepted = 'accepted',
}

export interface IResourcePreview {
	readonly baseResource: URI;
	readonly remoteResource: URI;
	readonly localResource: URI;
	readonly previewResource: URI;
	readonly acceptedResource: URI;
	readonly localChange: Change;
	readonly remoteChange: Change;
	readonly mergeState: MergeState;
}

export interface ISyncResourcePreview {
	readonly isLastSyncFromCurrentMachine: boolean;
	readonly resourcePreviews: IResourcePreview[];
}

export interface IUserDataInitializer {
	initialize(userData: IUserData): Promise<void>;
}

export interface IUserDataSynchroniser {

	readonly resource: SyncResource;
	readonly status: SyncStatus;
	readonly onDidChangeStatus: Event<SyncStatus>;

	readonly conflicts: IResourcePreview[];
	readonly onDidChangeConflicts: Event<IResourcePreview[]>;

	readonly onDidChangeLocal: Event<void>;

	sync(manifest: IUserDataManifest | null, headers: IHeaders): Promise<void>;
	replace(uri: URI): Promise<boolean>;
	stop(): Promise<void>;

	preview(manifest: IUserDataManifest | null, userDataSyncConfiguration: IUserDataSyncConfiguration, headers: IHeaders): Promise<ISyncResourcePreview | null>;
	accept(resource: URI, content?: string | null): Promise<ISyncResourcePreview | null>;
	merge(resource: URI): Promise<ISyncResourcePreview | null>;
	discard(resource: URI): Promise<ISyncResourcePreview | null>;
	apply(force: boolean, headers: IHeaders): Promise<ISyncResourcePreview | null>;

	hasPreviouslySynced(): Promise<boolean>;
	hasLocalData(): Promise<boolean>;
	resetLocal(): Promise<void>;

	resolveContent(resource: URI): Promise<string | null>;
	getRemoteSyncResourceHandles(): Promise<ISyncResourceHandle[]>;
	getLocalSyncResourceHandles(): Promise<ISyncResourceHandle[]>;
	getAssociatedResources(syncResourceHandle: ISyncResourceHandle): Promise<{ resource: URI; comparableResource: URI }[]>;
	getMachineId(syncResourceHandle: ISyncResourceHandle): Promise<string | undefined>;
}

//#endregion

// #region keys synced only in web

export const SYNC_SERVICE_URL_TYPE = 'sync.store.url.type';
export function getEnablementKey(resource: SyncResource) { return `sync.enable.${resource}`; }

// #endregion

// #region User Data Sync Services
export const IUserDataSyncEnablementService = createDecorator<IUserDataSyncEnablementService>('IUserDataSyncEnablementService');
export interface IUserDataSyncEnablementService {
	_serviceBrand: any;

	readonly onDidChangeEnablement: Event<boolean>;
	isEnabled(): boolean;
	canToggleEnablement(): boolean;
	setEnablement(enabled: boolean): void;

	readonly onDidChangeResourceEnablement: Event<[SyncResource, boolean]>;
	isResourceEnabled(resource: SyncResource): boolean;
	setResourceEnablement(resource: SyncResource, enabled: boolean): void;

	getResourceSyncStateVersion(resource: SyncResource): string | undefined;
}

export interface ISyncTask {
	readonly manifest: IUserDataManifest | null;
	run(): Promise<void>;
	stop(): Promise<void>;
}

export interface IManualSyncTask extends IDisposable {
	readonly id: string;
	readonly status: SyncStatus;
	readonly manifest: IUserDataManifest | null;
	readonly onSynchronizeResources: Event<[SyncResource, URI[]][]>;
	preview(): Promise<[SyncResource, ISyncResourcePreview][]>;
	accept(resource: URI, content?: string | null): Promise<[SyncResource, ISyncResourcePreview][]>;
	merge(resource?: URI): Promise<[SyncResource, ISyncResourcePreview][]>;
	discard(resource: URI): Promise<[SyncResource, ISyncResourcePreview][]>;
	discardConflicts(): Promise<[SyncResource, ISyncResourcePreview][]>;
	apply(): Promise<[SyncResource, ISyncResourcePreview][]>;
	pull(): Promise<void>;
	push(): Promise<void>;
	stop(): Promise<void>;
}

export const IUserDataSyncService = createDecorator<IUserDataSyncService>('IUserDataSyncService');
export interface IUserDataSyncService {
	_serviceBrand: any;

	readonly status: SyncStatus;
	readonly onDidChangeStatus: Event<SyncStatus>;

	readonly conflicts: [SyncResource, IResourcePreview[]][];
	readonly onDidChangeConflicts: Event<[SyncResource, IResourcePreview[]][]>;

	readonly onDidChangeLocal: Event<SyncResource>;
	readonly onSyncErrors: Event<[SyncResource, UserDataSyncError][]>;

	readonly lastSyncTime: number | undefined;
	readonly onDidChangeLastSyncTime: Event<number>;

	readonly onDidResetRemote: Event<void>;
	readonly onDidResetLocal: Event<void>;

	createSyncTask(manifest: IUserDataManifest | null, disableCache?: boolean): Promise<ISyncTask>;
	createManualSyncTask(): Promise<IManualSyncTask>;

	replace(uri: URI): Promise<void>;
	reset(): Promise<void>;
	resetRemote(): Promise<void>;
	resetLocal(): Promise<void>;

	hasLocalData(): Promise<boolean>;
	hasPreviouslySynced(): Promise<boolean>;
	resolveContent(resource: URI): Promise<string | null>;
	accept(resource: SyncResource, conflictResource: URI, content: string | null | undefined, apply: boolean): Promise<void>;

	getLocalSyncResourceHandles(resource: SyncResource): Promise<ISyncResourceHandle[]>;
	getRemoteSyncResourceHandles(resource: SyncResource): Promise<ISyncResourceHandle[]>;
	getAssociatedResources(resource: SyncResource, syncResourceHandle: ISyncResourceHandle): Promise<{ resource: URI; comparableResource: URI }[]>;
	getMachineId(resource: SyncResource, syncResourceHandle: ISyncResourceHandle): Promise<string | undefined>;
}

export const IUserDataAutoSyncService = createDecorator<IUserDataAutoSyncService>('IUserDataAutoSyncService');
export interface IUserDataAutoSyncService {
	_serviceBrand: any;
	readonly onError: Event<UserDataSyncError>;
	turnOn(): Promise<void>;
	turnOff(everywhere: boolean): Promise<void>;
	triggerSync(sources: string[], hasToLimitSync: boolean, disableCache: boolean): Promise<void>;
}

export const IUserDataSyncUtilService = createDecorator<IUserDataSyncUtilService>('IUserDataSyncUtilService');
export interface IUserDataSyncUtilService {
	readonly _serviceBrand: undefined;
	resolveUserBindings(userbindings: string[]): Promise<IStringDictionary<string>>;
	resolveFormattingOptions(resource: URI): Promise<FormattingOptions>;
	resolveDefaultIgnoredSettings(): Promise<string[]>;
}

export const IUserDataSyncLogService = createDecorator<IUserDataSyncLogService>('IUserDataSyncLogService');
export interface IUserDataSyncLogService extends ILogService { }

export interface IConflictSetting {
	key: string;
	localValue: any | undefined;
	remoteValue: any | undefined;
}

//#endregion

export const USER_DATA_SYNC_SCHEME = 'vscode-userdata-sync';
export const PREVIEW_DIR_NAME = 'preview';
export function getSyncResourceFromLocalPreview(localPreview: URI, environmentService: IEnvironmentService): SyncResource | undefined {
	if (localPreview.scheme === USER_DATA_SYNC_SCHEME) {
		return undefined;
	}
	localPreview = localPreview.with({ scheme: environmentService.userDataSyncHome.scheme });
	return ALL_SYNC_RESOURCES.filter(syncResource => isEqualOrParent(localPreview, joinPath(environmentService.userDataSyncHome, syncResource, PREVIEW_DIR_NAME)))[0];
}
