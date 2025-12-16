/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../base/common/arrays.js';
import { VSBufferReadableStream } from '../../../base/common/buffer.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { Event } from '../../../base/common/event.js';
import { FormattingOptions } from '../../../base/common/jsonFormatter.js';
import { IJSONSchema } from '../../../base/common/jsonSchema.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { IExtUri } from '../../../base/common/resources.js';
import { isObject, isString } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { IHeaders } from '../../../base/parts/request/common/request.js';
import { localize } from '../../../nls.js';
import { allSettings, ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry, IRegisteredConfigurationPropertySchema, getAllConfigurationProperties, parseScope } from '../../configuration/common/configurationRegistry.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { EXTENSION_IDENTIFIER_PATTERN, IExtensionIdentifier } from '../../extensionManagement/common/extensionManagement.js';
import { IExtensionManifest } from '../../extensions/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../jsonschemas/common/jsonContributionRegistry.js';
import { ILogService } from '../../log/common/log.js';
import { Registry } from '../../registry/common/platform.js';
import { IUserDataProfile, UseDefaultProfileFlags } from '../../userDataProfile/common/userDataProfile.js';
import { IUserDataSyncMachine } from './userDataSyncMachines.js';

export function getDisallowedIgnoredSettings(): string[] {
	const allSettings = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
	return Object.keys(allSettings).filter(setting => !!allSettings[setting].disallowSyncIgnore);
}

export function getDefaultIgnoredSettings(excludeExtensions: boolean = false): string[] {
	const allSettings = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
	const ignoredSettings = getIgnoredSettings(allSettings, excludeExtensions);
	const disallowedSettings = getDisallowedIgnoredSettings();
	return distinct([...ignoredSettings, ...disallowedSettings]);
}

export function getIgnoredSettingsForExtension(manifest: IExtensionManifest): string[] {
	if (!manifest.contributes?.configuration) {
		return [];
	}
	const configurations = Array.isArray(manifest.contributes.configuration) ? manifest.contributes.configuration : [manifest.contributes.configuration];
	if (!configurations.length) {
		return [];
	}
	const properties = getAllConfigurationProperties(configurations);
	return getIgnoredSettings(properties, false);
}

function getIgnoredSettings(properties: IStringDictionary<IRegisteredConfigurationPropertySchema>, excludeExtensions: boolean): string[] {
	const ignoredSettings = new Set<string>();
	for (const key in properties) {
		if (excludeExtensions && !!properties[key].source) {
			continue;
		}
		const scope = isString(properties[key].scope) ? parseScope(properties[key].scope) : properties[key].scope;
		if (properties[key].ignoreSync
			|| scope === ConfigurationScope.MACHINE
			|| scope === ConfigurationScope.MACHINE_OVERRIDABLE
		) {
			ignoredSettings.add(key);
		}
	}
	return [...ignoredSettings.values()];
}

export const USER_DATA_SYNC_CONFIGURATION_SCOPE = 'settingsSync';

export interface IUserDataSyncConfiguration {
	keybindingsPerPlatform?: boolean;
	ignoredExtensions?: string[];
	ignoredSettings?: string[];
}

export const CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM = 'settingsSync.keybindingsPerPlatform';

export function registerConfiguration(): IDisposable {
	const ignoredSettingsSchemaId = 'vscode://schemas/ignoredSettings';
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	configurationRegistry.registerConfiguration({
		id: 'settingsSync',
		order: 30,
		title: localize('settings sync', "Settings Sync"),
		type: 'object',
		properties: {
			[CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM]: {
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
		const defaultIgnoredSettings = getDefaultIgnoredSettings();
		const settings = Object.keys(allSettings.properties).filter(setting => !defaultIgnoredSettings.includes(setting));
		const ignoredSettings = defaultIgnoredSettings.filter(setting => !disallowedIgnoredSettings.includes(setting));
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

export const NON_EXISTING_RESOURCE_REF = '0';

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
	Prompts = 'prompts',
	Tasks = 'tasks',
	Mcp = 'mcp',
	Extensions = 'extensions',
	GlobalState = 'globalState',
	Profiles = 'profiles',
	WorkspaceState = 'workspaceState',
}
export const ALL_SYNC_RESOURCES: SyncResource[] = [SyncResource.Settings, SyncResource.Keybindings, SyncResource.Snippets, SyncResource.Prompts, SyncResource.Tasks, SyncResource.Extensions, SyncResource.GlobalState, SyncResource.Profiles, SyncResource.Mcp];

export function getPathSegments(collection: string | undefined, ...paths: string[]): string[] {
	return collection ? [collection, ...paths] : paths;
}

export function getLastSyncResourceUri(collection: string | undefined, syncResource: SyncResource, environmentService: IEnvironmentService, extUri: IExtUri): URI {
	return extUri.joinPath(environmentService.userDataSyncHome, ...getPathSegments(collection, syncResource, `lastSync${syncResource}.json`));
}

export type IUserDataResourceManifest = Record<ServerResource, string>;

export interface IUserDataCollectionManifest {
	[collectionId: string]: {
		readonly latest?: IUserDataResourceManifest;
	};
}

export interface IUserDataManifest {
	readonly latest?: IUserDataResourceManifest;
	readonly session: string;
	readonly ref: string;
	readonly collections?: IUserDataCollectionManifest;
}

export function isUserDataManifest(thing: any): thing is IUserDataManifest {
	return thing
		&& isString(thing.session)
		&& isString(thing.ref)
		&& (isObject(thing.latest) || thing.latest === undefined)
		&& (isObject(thing.collections) || thing.collections === undefined);
}

export interface IUserDataSyncActivityData {
	resources?: {
		[resourceId: string]: { created: number; content: string }[];
	};
	collections?: {
		[collectionId: string]: {
			resources?: {
				[resourceId: string]: { created: number; content: string }[];
			} | undefined;
		};
	};
}

export interface IUserDataSyncLatestData {
	resources?: IStringDictionary<IUserData>;
	collections?: {
		[collectionId: string]: {
			resources?: IStringDictionary<IUserData>;
		};
	};
}

export interface IResourceRefHandle {
	ref: string;
	created: number;
}

export type ServerResource = SyncResource | 'machines' | 'editSessions' | 'workspaceState';
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

	readonly onTokenFailed: Event<UserDataSyncErrorCode>;
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

	getLatestData(headers?: IHeaders): Promise<IUserDataSyncLatestData | null>;
	getActivityData(): Promise<VSBufferReadableStream>;

	clear(): Promise<void>;
}

export const IUserDataSyncLocalStoreService = createDecorator<IUserDataSyncLocalStoreService>('IUserDataSyncLocalStoreService');
export interface IUserDataSyncLocalStoreService {
	readonly _serviceBrand: undefined;
	writeResource(resource: ServerResource, content: string, cTime: Date, collection?: string, root?: URI): Promise<void>;
	getAllResourceRefs(resource: ServerResource, collection?: string, root?: URI): Promise<IResourceRefHandle[]>;
	resolveResourceContent(resource: ServerResource, ref: string, collection?: string, root?: URI): Promise<string | null>;
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
	Forbidden = 'Forbidden', /* 403 */
	NotFound = 'NotFound', /* 404 */
	MethodNotFound = 'MethodNotFound', /* 405 */
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
	LocalTooManyProfiles = 'LocalTooManyProfiles',
	LocalTooManyRequests = 'LocalTooManyRequests',
	LocalPreconditionFailed = 'LocalPreconditionFailed',
	LocalInvalidContent = 'LocalInvalidContent',
	LocalError = 'LocalError',
	IncompatibleLocalContent = 'IncompatibleLocalContent',
	IncompatibleRemoteContent = 'IncompatibleRemoteContent',

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

export interface ISyncUserDataProfile {
	readonly id: string;
	readonly collection: string;
	readonly name: string;
	readonly icon?: string;
	readonly useDefaultFlags?: UseDefaultProfileFlags;
}

export type ISyncExtension = ILocalSyncExtension | IRemoteSyncExtension;

export interface ILocalSyncExtension {
	identifier: IExtensionIdentifier;
	pinned: boolean;
	version: string;
	preRelease: boolean;
	disabled?: boolean;
	installed?: boolean;
	isApplicationScoped?: boolean;
	state?: IStringDictionary<any>;
}

export interface IRemoteSyncExtension {
	identifier: IExtensionIdentifier;
	version: string;
	pinned?: boolean;
	preRelease?: boolean;
	disabled?: boolean;
	installed?: boolean;
	isApplicationScoped?: boolean;
	state?: IStringDictionary<any>;
}

export interface IStorageValue {
	version: number;
	value: string;
}

export interface IGlobalState {
	storage: IStringDictionary<IStorageValue>;
}

export interface IWorkspaceState {
	folders: IWorkspaceStateFolder[];
	storage: IStringDictionary<string>;
	version: number;
}

export interface IWorkspaceStateFolder {
	resourceUri: string;
	workspaceFolderIdentity: string;
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

export interface IUserDataSyncResource {
	readonly syncResource: SyncResource;
	readonly profile: IUserDataProfile;
}

export interface IUserDataSyncResourceConflicts extends IUserDataSyncResource {
	readonly conflicts: IResourcePreview[];
}

export interface IUserDataSyncResourcePreview extends IUserDataSyncResource {
	readonly isLastSyncFromCurrentMachine: boolean;
	readonly resourcePreviews: IResourcePreview[];
}

export interface IUserDataSyncResourceError extends IUserDataSyncResource {
	readonly error: UserDataSyncError;
}

export interface IUserDataSyncResourceInitializer {
	initialize(userData: IUserData): Promise<void>;
}

export interface IUserDataSynchroniser {

	readonly resource: SyncResource;
	readonly status: SyncStatus;
	readonly onDidChangeStatus: Event<SyncStatus>;

	readonly conflicts: IUserDataSyncResourceConflicts;
	readonly onDidChangeConflicts: Event<IUserDataSyncResourceConflicts>;

	readonly onDidChangeLocal: Event<void>;

	sync(refOrUserData: string | IUserData | null, preview: boolean, userDataSyncConfiguration: IUserDataSyncConfiguration, headers: IHeaders): Promise<IUserDataSyncResourcePreview | null>;
	accept(resource: URI, content?: string | null): Promise<IUserDataSyncResourcePreview | null>;
	apply(force: boolean, headers: IHeaders): Promise<IUserDataSyncResourcePreview | null>;
	stop(): Promise<void>;

	hasPreviouslySynced(): Promise<boolean>;
	hasLocalData(): Promise<boolean>;
	resetLocal(): Promise<void>;

	resolveContent(resource: URI): Promise<string | null>;
	replace(content: string): Promise<boolean>;
}

//#endregion

// #region keys synced only in web

export const SYNC_SERVICE_URL_TYPE = 'sync.store.url.type';
export function getEnablementKey(resource: SyncResource) { return `sync.enable.${resource}`; }

// #endregion

// #region User Data Sync Services
export const IUserDataSyncEnablementService = createDecorator<IUserDataSyncEnablementService>('IUserDataSyncEnablementService');
export interface IUserDataSyncEnablementService {
	_serviceBrand: undefined;

	readonly onDidChangeEnablement: Event<boolean>;
	isEnabled(): boolean;
	canToggleEnablement(): boolean;
	setEnablement(enabled: boolean): void;

	readonly onDidChangeResourceEnablement: Event<[SyncResource, boolean]>;
	isResourceEnabled(resource: SyncResource, defaultValue?: boolean): boolean;
	setResourceEnablement(resource: SyncResource, enabled: boolean): void;

	getResourceSyncStateVersion(resource: SyncResource): string | undefined;

	/**
	 * Checks if resource enabled was explicitly configured before,
	 * ignoring its default enablement value used in {@link isResourceEnabled}.
	 */
	isResourceEnablementConfigured(resource: SyncResource): boolean;
}

export interface IUserDataSyncTask {
	readonly manifest: IUserDataManifest | null;
	run(): Promise<void>;
	stop(): Promise<void>;
}

export interface IUserDataManualSyncTask {
	readonly id: string;
	merge(): Promise<void>;
	apply(): Promise<void>;
	stop(): Promise<void>;
}

export const IUserDataSyncService = createDecorator<IUserDataSyncService>('IUserDataSyncService');
export interface IUserDataSyncService {
	_serviceBrand: undefined;

	readonly status: SyncStatus;
	readonly onDidChangeStatus: Event<SyncStatus>;

	readonly conflicts: IUserDataSyncResourceConflicts[];
	readonly onDidChangeConflicts: Event<IUserDataSyncResourceConflicts[]>;

	readonly onDidChangeLocal: Event<SyncResource>;
	readonly onSyncErrors: Event<IUserDataSyncResourceError[]>;

	readonly lastSyncTime: number | undefined;
	readonly onDidChangeLastSyncTime: Event<number>;

	readonly onDidResetRemote: Event<void>;
	readonly onDidResetLocal: Event<void>;

	createSyncTask(manifest: IUserDataManifest | null, disableCache?: boolean): Promise<IUserDataSyncTask>;
	createManualSyncTask(): Promise<IUserDataManualSyncTask>;
	resolveContent(resource: URI): Promise<string | null>;
	accept(syncResource: IUserDataSyncResource, resource: URI, content: string | null | undefined, apply: boolean | { force: boolean }): Promise<void>;

	reset(): Promise<void>;
	resetRemote(): Promise<void>;
	cleanUpRemoteData(): Promise<void>;
	resetLocal(): Promise<void>;
	hasLocalData(): Promise<boolean>;
	hasPreviouslySynced(): Promise<boolean>;

	replace(syncResourceHandle: ISyncResourceHandle): Promise<void>;

	saveRemoteActivityData(location: URI): Promise<void>;
	extractActivityData(activityDataResource: URI, location: URI): Promise<void>;
}

export const IUserDataSyncResourceProviderService = createDecorator<IUserDataSyncResourceProviderService>('IUserDataSyncResourceProviderService');
export interface IUserDataSyncResourceProviderService {
	_serviceBrand: undefined;
	getRemoteSyncedProfiles(): Promise<ISyncUserDataProfile[]>;
	getLocalSyncedProfiles(location?: URI): Promise<ISyncUserDataProfile[]>;
	getRemoteSyncResourceHandles(syncResource: SyncResource, profile?: ISyncUserDataProfile): Promise<ISyncResourceHandle[]>;
	getLocalSyncResourceHandles(syncResource: SyncResource, profile?: ISyncUserDataProfile, location?: URI): Promise<ISyncResourceHandle[]>;
	getAssociatedResources(syncResourceHandle: ISyncResourceHandle): Promise<{ resource: URI; comparableResource: URI }[]>;
	getMachineId(syncResourceHandle: ISyncResourceHandle): Promise<string | undefined>;
	getLocalSyncedMachines(location?: URI): Promise<IUserDataSyncMachine[]>;
	resolveContent(resource: URI): Promise<string | null>;
	resolveUserDataSyncResource(syncResourceHandle: ISyncResourceHandle): IUserDataSyncResource | undefined;
}

export type SyncOptions = { immediately?: boolean; skipIfSyncedRecently?: boolean; disableCache?: boolean };

export const IUserDataAutoSyncService = createDecorator<IUserDataAutoSyncService>('IUserDataAutoSyncService');
export interface IUserDataAutoSyncService {
	_serviceBrand: undefined;
	readonly onError: Event<UserDataSyncError>;
	turnOn(): Promise<void>;
	turnOff(everywhere: boolean): Promise<void>;
	triggerSync(sources: string[], options?: SyncOptions): Promise<void>;
}

export const IUserDataSyncUtilService = createDecorator<IUserDataSyncUtilService>('IUserDataSyncUtilService');
export interface IUserDataSyncUtilService {
	readonly _serviceBrand: undefined;
	resolveUserBindings(userbindings: string[]): Promise<IStringDictionary<string>>;
	resolveFormattingOptions(resource: URI): Promise<FormattingOptions>;
	resolveDefaultCoreIgnoredSettings(): Promise<string[]>;
}

export const IUserDataSyncLogService = createDecorator<IUserDataSyncLogService>('IUserDataSyncLogService');
export interface IUserDataSyncLogService extends ILogService { }

export interface IConflictSetting {
	key: string;
	localValue: any | undefined;
	remoteValue: any | undefined;
}

//#endregion

export const USER_DATA_SYNC_LOG_ID = 'userDataSync';
export const USER_DATA_SYNC_SCHEME = 'vscode-userdata-sync';
export const PREVIEW_DIR_NAME = 'preview';
