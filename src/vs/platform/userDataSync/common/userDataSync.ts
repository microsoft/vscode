/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IExtensionIdentifier, EXTENSION_IDENTIFIER_PATTERN } from 'vs/platform/extensionManagement/common/extensionManagement';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, allSettings } from 'vs/platform/configuration/common/configurationRegistry';
import { localize } from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ILogService } from 'vs/platform/log/common/log';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStringDictionary } from 'vs/base/common/collections';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import { URI } from 'vs/base/common/uri';
import { joinPath, dirname, basename, isEqualOrParent } from 'vs/base/common/resources';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IProductService } from 'vs/platform/product/common/productService';
import { distinct } from 'vs/base/common/arrays';

export const CONFIGURATION_SYNC_STORE_KEY = 'configurationSync.store';

export interface ISyncConfiguration {
	sync: {
		enable: boolean,
		enableSettings: boolean,
		enableKeybindings: boolean,
		enableUIState: boolean,
		enableExtensions: boolean,
		keybindingsPerPlatform: boolean,
		ignoredExtensions: string[],
		ignoredSettings: string[]
	}
}

export function getDisallowedIgnoredSettings(): string[] {
	const allSettings = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
	return Object.keys(allSettings).filter(setting => !!allSettings[setting].disallowSyncIgnore);
}

export function getDefaultIgnoredSettings(): string[] {
	const allSettings = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
	const machineSettings = Object.keys(allSettings).filter(setting => allSettings[setting].scope === ConfigurationScope.MACHINE || allSettings[setting].scope === ConfigurationScope.MACHINE_OVERRIDABLE);
	const disallowedSettings = getDisallowedIgnoredSettings();
	return distinct([CONFIGURATION_SYNC_STORE_KEY, ...machineSettings, ...disallowedSettings]);
}

export function registerConfiguration(): IDisposable {
	const ignoredSettingsSchemaId = 'vscode://schemas/ignoredSettings';
	const ignoredExtensionsSchemaId = 'vscode://schemas/ignoredExtensions';
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	configurationRegistry.registerConfiguration({
		id: 'sync',
		order: 30,
		title: localize('sync', "Sync"),
		type: 'object',
		properties: {
			'sync.keybindingsPerPlatform': {
				type: 'boolean',
				description: localize('sync.keybindingsPerPlatform', "Synchronize keybindings per platform."),
				default: true,
				scope: ConfigurationScope.APPLICATION,
				tags: ['sync', 'usesOnlineServices']
			},
			'sync.ignoredExtensions': {
				'type': 'array',
				'description': localize('sync.ignoredExtensions', "List of extensions to be ignored while synchronizing. The identifier of an extension is always ${publisher}.${name}. For example: vscode.csharp."),
				$ref: ignoredExtensionsSchemaId,
				'default': [],
				'scope': ConfigurationScope.APPLICATION,
				uniqueItems: true,
				disallowSyncIgnore: true,
				tags: ['sync', 'usesOnlineServices']
			},
			'sync.ignoredSettings': {
				'type': 'array',
				description: localize('sync.ignoredSettings', "Configure settings to be ignored while synchronizing."),
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
	jsonRegistry.registerSchema(ignoredExtensionsSchemaId, {
		type: 'string',
		pattern: EXTENSION_IDENTIFIER_PATTERN,
		errorMessage: localize('app.extension.identifier.errorMessage', "Expected format '${publisher}.${name}'. Example: 'vscode.csharp'.")
	});
	return configurationRegistry.onDidUpdateConfiguration(() => registerIgnoredSettingsSchema());
}

// #region User Data Sync Store

export interface IUserData {
	ref: string;
	content: string | null;
}

export interface IUserDataSyncStore {
	url: URI;
	authenticationProviderId: string;
}

export function getUserDataSyncStore(productService: IProductService, configurationService: IConfigurationService): IUserDataSyncStore | undefined {
	const value = productService[CONFIGURATION_SYNC_STORE_KEY] || configurationService.getValue<{ url: string, authenticationProviderId: string }>(CONFIGURATION_SYNC_STORE_KEY);
	if (value && value.url && value.authenticationProviderId) {
		return {
			url: joinPath(URI.parse(value.url), 'v1'),
			authenticationProviderId: value.authenticationProviderId
		};
	}
	return undefined;
}

export const enum SyncResource {
	Settings = 'settings',
	Keybindings = 'keybindings',
	Extensions = 'extensions',
	GlobalState = 'globalState'
}
export const ALL_SYNC_RESOURCES: SyncResource[] = [SyncResource.Settings, SyncResource.Keybindings, SyncResource.Extensions, SyncResource.GlobalState];

export interface IUserDataManifest {
	latest?: Record<SyncResource, string>
	session: string;
}

export interface IResourceRefHandle {
	ref: string;
	created: number;
}

export const IUserDataSyncStoreService = createDecorator<IUserDataSyncStoreService>('IUserDataSyncStoreService');
export interface IUserDataSyncStoreService {
	_serviceBrand: undefined;
	readonly userDataSyncStore: IUserDataSyncStore | undefined;
	read(resource: SyncResource, oldValue: IUserData | null): Promise<IUserData>;
	write(resource: SyncResource, content: string, ref: string | null): Promise<string>;
	manifest(): Promise<IUserDataManifest | null>;
	clear(): Promise<void>;
	getAllRefs(resource: SyncResource): Promise<IResourceRefHandle[]>;
	resolveContent(resource: SyncResource, ref: string): Promise<string | null>;
	delete(resource: SyncResource): Promise<void>;
}

export const IUserDataSyncBackupStoreService = createDecorator<IUserDataSyncBackupStoreService>('IUserDataSyncBackupStoreService');
export interface IUserDataSyncBackupStoreService {
	_serviceBrand: undefined;
	backup(resource: SyncResource, content: string): Promise<void>;
	getAllRefs(resource: SyncResource): Promise<IResourceRefHandle[]>;
	resolveContent(resource: SyncResource, ref?: string): Promise<string | null>;
}

//#endregion

// #region User Data Sync Error

export enum UserDataSyncErrorCode {
	// Server Errors
	Unauthorized = 'Unauthorized',
	Forbidden = 'Forbidden',
	ConnectionRefused = 'ConnectionRefused',
	RemotePreconditionFailed = 'RemotePreconditionFailed',
	TooLarge = 'TooLarge',
	NoRef = 'NoRef',
	TurnedOff = 'TurnedOff',
	SessionExpired = 'SessionExpired',

	// Local Errors
	LocalPreconditionFailed = 'LocalPreconditionFailed',
	LocalInvalidContent = 'LocalInvalidContent',
	LocalError = 'LocalError',
	Incompatible = 'Incompatible',

	Unknown = 'Unknown',
}

export class UserDataSyncError extends Error {

	constructor(message: string, public readonly code: UserDataSyncErrorCode, public readonly resource?: SyncResource) {
		super(message);
		this.name = `${this.code} (UserDataSyncError) ${this.resource}`;
	}

	static toUserDataSyncError(error: Error): UserDataSyncError {
		if (error instanceof UserDataSyncStoreError) {
			return error;
		}
		const match = /^(.+) \(UserDataSyncError\) (.+)?$/.exec(error.name);
		if (match && match[1]) {
			return new UserDataSyncError(error.message, <UserDataSyncErrorCode>match[1], <SyncResource>match[2]);
		}
		return new UserDataSyncError(error.message, UserDataSyncErrorCode.Unknown);
	}

}

export class UserDataSyncStoreError extends UserDataSyncError { }

//#endregion

// #region User Data Synchroniser

export interface ISyncExtension {
	identifier: IExtensionIdentifier;
	version?: string;
	disabled?: boolean;
}

export interface IGlobalState {
	argv: IStringDictionary<any>;
	storage: IStringDictionary<any>;
}

export const enum SyncStatus {
	Uninitialized = 'uninitialized',
	Idle = 'idle',
	Syncing = 'syncing',
	HasConflicts = 'hasConflicts',
}

export type Conflict = { remote: URI, local: URI };

export interface IUserDataSynchroniser {

	readonly resource: SyncResource;
	readonly status: SyncStatus;
	readonly onDidChangeStatus: Event<SyncStatus>;
	readonly conflicts: Conflict[];
	readonly onDidChangeConflicts: Event<Conflict[]>;
	readonly onDidChangeLocal: Event<void>;

	pull(): Promise<void>;
	push(): Promise<void>;
	sync(ref?: string): Promise<void>;
	stop(): Promise<void>;

	hasPreviouslySynced(): Promise<boolean>
	hasLocalData(): Promise<boolean>;
	resetLocal(): Promise<void>;

	getConflictContent(conflictResource: URI): Promise<string | null>;
	acceptConflict(conflictResource: URI, content: string): Promise<void>;

	getRemoteContent(ref?: string, fragment?: string): Promise<string | null>;
	getLocalBackupContent(ref?: string, fragment?: string): Promise<string | null>;
}

//#endregion

// #region User Data Sync Services

export const IUserDataSyncEnablementService = createDecorator<IUserDataSyncEnablementService>('IUserDataSyncEnablementService');
export interface IUserDataSyncEnablementService {
	_serviceBrand: any;

	readonly onDidChangeEnablement: Event<boolean>;
	readonly onDidChangeResourceEnablement: Event<[SyncResource, boolean]>;

	isEnabled(): boolean;
	setEnablement(enabled: boolean): void;

	isResourceEnabled(resource: SyncResource): boolean;
	setResourceEnablement(resource: SyncResource, enabled: boolean): void;
}

export type SyncResourceConflicts = { syncResource: SyncResource, conflicts: Conflict[] };

export const IUserDataSyncService = createDecorator<IUserDataSyncService>('IUserDataSyncService');
export interface IUserDataSyncService {
	_serviceBrand: any;

	readonly status: SyncStatus;
	readonly onDidChangeStatus: Event<SyncStatus>;

	readonly conflicts: SyncResourceConflicts[];
	readonly onDidChangeConflicts: Event<SyncResourceConflicts[]>;

	readonly onDidChangeLocal: Event<SyncResource>;
	readonly onSyncErrors: Event<[SyncResource, UserDataSyncError][]>;

	readonly lastSyncTime: number | undefined;
	readonly onDidChangeLastSyncTime: Event<number>;

	pull(): Promise<void>;
	sync(): Promise<void>;
	stop(): Promise<void>;
	reset(): Promise<void>;
	resetLocal(): Promise<void>;

	isFirstTimeSyncWithMerge(): Promise<boolean>;
	resolveContent(resource: URI): Promise<string | null>;
	acceptConflict(conflictResource: URI, content: string): Promise<void>;
}

export const IUserDataAutoSyncService = createDecorator<IUserDataAutoSyncService>('IUserDataAutoSyncService');
export interface IUserDataAutoSyncService {
	_serviceBrand: any;
	readonly onError: Event<UserDataSyncError>;
	triggerAutoSync(sources: string[]): Promise<void>;
}

export const IUserDataSyncUtilService = createDecorator<IUserDataSyncUtilService>('IUserDataSyncUtilService');
export interface IUserDataSyncUtilService {
	_serviceBrand: undefined;
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
export const CONTEXT_SYNC_STATE = new RawContextKey<string>('syncStatus', SyncStatus.Uninitialized);
export const CONTEXT_SYNC_ENABLEMENT = new RawContextKey<boolean>('syncEnabled', false);

export function toRemoteBackupSyncResource(resource: SyncResource, ref?: string): URI {
	return URI.from({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote-backup', path: `/${resource}/${ref ? ref : 'latest'}` });
}
export function toLocalBackupSyncResource(resource: SyncResource, ref?: string): URI {
	return URI.from({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local-backup', path: `/${resource}/${ref ? ref : 'latest'}` });
}
export function resolveBackupSyncResource(resource: URI): { remote: boolean, resource: SyncResource, path: string } | null {
	if (resource.scheme === USER_DATA_SYNC_SCHEME
		&& resource.authority === 'remote-backup' || resource.authority === 'local-backup') {
		const resourceKey: SyncResource = basename(dirname(resource)) as SyncResource;
		const path = resource.path.substring(resourceKey.length + 1);
		if (resourceKey && path) {
			const remote = resource.authority === 'remote-backup';
			return { remote, resource: resourceKey, path };
		}
	}
	return null;
}

export const PREVIEW_DIR_NAME = 'preview';
export function getSyncResourceFromLocalPreview(localPreview: URI, environmentService: IEnvironmentService): SyncResource | undefined {
	if (localPreview.scheme === USER_DATA_SYNC_SCHEME) {
		return undefined;
	}
	localPreview = localPreview.with({ scheme: environmentService.userDataSyncHome.scheme });
	return ALL_SYNC_RESOURCES.filter(syncResource => isEqualOrParent(localPreview, joinPath(environmentService.userDataSyncHome, syncResource, PREVIEW_DIR_NAME)))[0];
}
export function getSyncResourceFromRemotePreview(remotePreview: URI, environmentService: IEnvironmentService): SyncResource | undefined {
	if (remotePreview.scheme !== USER_DATA_SYNC_SCHEME) {
		return undefined;
	}
	remotePreview = remotePreview.with({ scheme: environmentService.userDataSyncHome.scheme });
	return ALL_SYNC_RESOURCES.filter(syncResource => isEqualOrParent(remotePreview, joinPath(environmentService.userDataSyncHome, syncResource, PREVIEW_DIR_NAME)))[0];
}
