/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IExtensionIdentifier } from 'vs/platform/extensionManagement/common/extensionManagement';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IStringDictionary } from 'vs/base/common/collections';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { localize } from 'vs/nls';

export function registerConfiguration() {
	Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
		.registerConfiguration({
			id: 'userConfiguration',
			order: 30,
			title: localize('userConfiguration', "User Configuration"),
			type: 'object',
			properties: {
				'userConfiguration.enableSync': {
					type: 'boolean',
					description: localize('userConfiguration.enableSync', "When enabled, synchronises User Configuration: Settings, Keybindings, Extensions & Snippets."),
					default: true,
					scope: ConfigurationScope.APPLICATION
				},
				'userConfiguration.syncExtensions': {
					type: 'boolean',
					description: localize('userConfiguration.syncExtensions', "When enabled extensions are synchronised while synchronising user configuration."),
					default: true,
					scope: ConfigurationScope.APPLICATION,
				},
				'userConfiguration.ignoreSettings': {
					'type': 'object',
					description: localize('userConfiguration.ignoreSettings', "Configure settings to be ignored while syncing"),
					'default': {
						'userConfiguration.enableSync': true,
						'userConfiguration.syncExtensions': true,
						'userConfiguration.ignoreSettings': true
					},
					'scope': ConfigurationScope.APPLICATION,
					'additionalProperties': {
						'anyOf': [
							{
								'type': 'boolean',
								'description': localize('ignoredSetting', "Id of the stting to be ignored. Set to true or false to enable or disable."),
							}
						]
					}
				}
			}
		});
}

export interface IUserData {
	ref: string;
	content: string | null;
}

export enum UserDataSyncStoreErrorCode {
	Rejected = 'Rejected',
	Unknown = 'Unknown'
}

export class UserDataSyncStoreError extends Error {

	constructor(message: string, public readonly code: UserDataSyncStoreErrorCode) {
		super(message);
	}

}

export const IUserDataSyncStoreService = createDecorator<IUserDataSyncStoreService>('IUserDataSyncStoreService');

export interface IUserDataSyncStoreService {
	_serviceBrand: undefined;

	readonly enabled: boolean;

	readonly loggedIn: boolean;
	readonly onDidChangeLoggedIn: Event<boolean>;
	login(): Promise<void>;
	logout(): Promise<void>;

	read(key: string, oldValue: IUserData | null): Promise<IUserData>;
	write(key: string, content: string, ref: string | null): Promise<string>;
}

export interface ISyncExtension {
	identifier: IExtensionIdentifier;
	version?: string;
	enabled: boolean;
}

export const enum SyncSource {
	Settings = 1,
	Extensions
}

export const enum SyncStatus {
	Uninitialized = 'uninitialized',
	Idle = 'idle',
	Syncing = 'syncing',
	HasConflicts = 'hasConflicts',
}

export interface ISynchroniser {

	readonly status: SyncStatus;
	readonly onDidChangeStatus: Event<SyncStatus>;
	readonly onDidChangeLocal: Event<void>;

	sync(_continue?: boolean): Promise<boolean>;
}

export const IUserDataSyncService = createDecorator<IUserDataSyncService>('IUserDataSyncService');

export interface IUserDataSyncService extends ISynchroniser {
	_serviceBrand: any;
	readonly conflictsSource: SyncSource | null;

	getRemoteExtensions(): Promise<ISyncExtension[]>;
	removeExtension(identifier: IExtensionIdentifier): Promise<void>;
}

export const ISettingsMergeService = createDecorator<ISettingsMergeService>('ISettingsMergeService');

export interface ISettingsMergeService {

	_serviceBrand: undefined;

	merge(localContent: string, remoteContent: string, baseContent: string | null, ignoredSettings: IStringDictionary<boolean>): Promise<{ mergeContent: string, hasChanges: boolean, hasConflicts: boolean }>;

	computeRemoteContent(localContent: string, remoteContent: string, ignoredSettings: IStringDictionary<boolean>): Promise<string>;

}

export const CONTEXT_SYNC_STATE = new RawContextKey<string>('syncStatus', SyncStatus.Uninitialized);
