/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { IExtensionIdentifier } from 'vs/platform/extensionManagement/common/extensionManagement';
import { Schemas } from 'vs/base/common/network';

export interface IUserLoginProvider {

	readonly loggedIn: boolean;

	readonly onDidChange: Event<void>;

	login(): Promise<void>;

	logout(): Promise<void>;

}

export interface IUserIdentity {
	identity: string;
	title: string;
	iconText?: string;
}

export const IUserIdentityService = createDecorator<IUserIdentityService>('IUserIdentityService');

export interface IUserIdentityService {

	_serviceBrand: any;

	readonly onDidRegisterUserIdentities: Event<IUserIdentity[]>;

	readonly onDidDeregisterUserIdentities: Event<IUserIdentity[]>;

	readonly onDidRegisterUserLoginProvider: Event<string>;

	readonly onDidDeregisterUserLoginProvider: Event<string>;

	registerUserIdentities(userIdentities: IUserIdentity[]): void;

	deregisterUserIdentities(identities: string[]): void;

	registerUserLoginProvider(identity: string, userLoginProvider: IUserLoginProvider): void;

	deregisterUserLoginProvider(identity: string): void;

	getUserIndetities(): ReadonlyArray<IUserIdentity>;

	getUserIdentity(identity: string): IUserIdentity | null;

	getUserLoginProvider(identity: string): IUserLoginProvider | null;
}

export interface IUserDataProvider {

	userDataScheme: string;

}

export const IUserDataProviderService = createDecorator<IUserDataProviderService>('IUserDataProviderService');

export interface IUserDataProviderService {

	_serviceBrand: any;

	registerUserDataProvider(identity: string, userDataProvider: IUserDataProvider): void;

	deregisterAll(): void;

	getUserDataProvider(identity: string): IUserDataProvider | null;

}

export const IUserDataSyncService = createDecorator<IUserDataSyncService>('IUserDataSyncService');


export const USER_DATA_SETTINGS_RESOURCE = URI.file('settings.json').with({ scheme: Schemas.userData });
export const USER_DATA_KEYBINDINGS_RESOURCE = URI.file('keybindings.json').with({ scheme: Schemas.userData });
export const USER_DATA_SNIPPETS_RESOURCE = URI.file('snippets').with({ scheme: Schemas.userData });
export const USER_DATA_EXTENSIONS_RESOURCE = URI.file('extensions.json').with({ scheme: Schemas.userData });

export interface IUserDataExtension {
	identifier: IExtensionIdentifier;
	version?: string;
}

export interface IUserDataSyncService {

	_serviceBrand: any;

	synchronise(): Promise<void>;

	getExtensions(): Promise<IUserDataExtension[]>;

}
