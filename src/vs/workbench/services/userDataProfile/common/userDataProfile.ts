/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUndefined } from 'vs/base/common/types';
import { Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IUserDataProfile, IUserDataProfileOptions, IUserDataProfileUpdateOptions } from 'vs/platform/userDataProfile/common/userDataProfile';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { URI } from 'vs/base/common/uri';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { ITreeItem, ITreeItemCheckboxState, ITreeItemLabel } from 'vs/workbench/common/views';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';

export interface DidChangeUserDataProfileEvent {
	readonly preserveData: boolean;
	readonly previous: IUserDataProfile;
	readonly profile: IUserDataProfile;
	join(promise: Promise<void>): void;
}

export const IUserDataProfileService = createDecorator<IUserDataProfileService>('IUserDataProfileService');
export interface IUserDataProfileService {
	readonly _serviceBrand: undefined;
	readonly onDidUpdateCurrentProfile: Event<void>;
	readonly onDidChangeCurrentProfile: Event<DidChangeUserDataProfileEvent>;
	readonly currentProfile: IUserDataProfile;
	updateCurrentProfile(currentProfile: IUserDataProfile, preserveData: boolean): Promise<void>;
	getShortName(profile: IUserDataProfile): string;
}

export const IUserDataProfileManagementService = createDecorator<IUserDataProfileManagementService>('IUserDataProfileManagementService');
export interface IUserDataProfileManagementService {
	readonly _serviceBrand: undefined;

	createAndEnterProfile(name: string, options?: IUserDataProfileOptions, fromExisting?: boolean): Promise<IUserDataProfile>;
	createAndEnterTransientProfile(): Promise<IUserDataProfile>;
	removeProfile(profile: IUserDataProfile): Promise<void>;
	updateProfile(profile: IUserDataProfile, updateOptions: IUserDataProfileUpdateOptions): Promise<void>;
	switchProfile(profile: IUserDataProfile): Promise<void>;

}

export interface IUserDataProfileTemplate {
	readonly settings?: string;
	readonly keybindings?: string;
	readonly tasks?: string;
	readonly snippets?: string;
	readonly globalState?: string;
	readonly extensions?: string;
}

export function isUserDataProfileTemplate(thing: unknown): thing is IUserDataProfileTemplate {
	const candidate = thing as IUserDataProfileTemplate | undefined;

	return !!(candidate && typeof candidate === 'object'
		&& (isUndefined(candidate.settings) || typeof candidate.settings === 'string')
		&& (isUndefined(candidate.globalState) || typeof candidate.globalState === 'string')
		&& (isUndefined(candidate.extensions) || typeof candidate.extensions === 'string'));
}

export type ProfileCreationOptions = { readonly skipComments: boolean };

export const IUserDataProfileImportExportService = createDecorator<IUserDataProfileImportExportService>('IUserDataProfileImportExportService');
export interface IUserDataProfileImportExportService {
	readonly _serviceBrand: undefined;

	registerProfileContentHandler(id: string, profileContentHandler: IUserDataProfileContentHandler): IDisposable;
	unregisterProfileContentHandler(id: string): void;

	exportProfile(): Promise<void>;
	importProfile(uri: URI): Promise<void>;
	setProfile(profile: IUserDataProfileTemplate): Promise<void>;
}

export const enum ProfileResourceType {
	Settings = 'settings',
	Keybindings = 'keybindings',
	Snippets = 'snippets',
	Tasks = 'tasks',
	Extensions = 'extensions',
	GlobalState = 'globalState',
}

export interface IProfileResource {
	getContent(profile: IUserDataProfile): Promise<string>;
	apply(content: string, profile: IUserDataProfile): Promise<void>;
}

export interface IProfileResourceTreeItem extends ITreeItem {
	readonly type: ProfileResourceType;
	checkbox: ITreeItemCheckboxState;
	readonly label: ITreeItemLabel;
	getChildren(): Promise<IProfileResourceChildTreeItem[] | undefined>;
	getContent(): Promise<string>;
}

export interface IProfileResourceChildTreeItem extends ITreeItem {
	parent: IProfileResourceTreeItem;
}

export interface IUserDataProfileContentHandler {
	readonly name: string;
	readonly extensionId?: string;
	saveProfile(name: string, content: string, token: CancellationToken): Promise<URI | null>;
	readProfile(uri: URI, token: CancellationToken): Promise<string | null>;
}

export const defaultUserDataProfileIcon = registerIcon('defaultProfile-icon', Codicon.settings, localize('defaultProfileIcon', 'Icon for Default Profile.'));

export const ManageProfilesSubMenu = new MenuId('Profiles');
export const MANAGE_PROFILES_ACTION_ID = 'workbench.profiles.actions.manage';
export const PROFILES_TTILE = { value: localize('profiles', "Profiles"), original: 'Profiles' };
export const PROFILES_CATEGORY = { ...PROFILES_TTILE };
export const PROFILE_EXTENSION = 'code-profile';
export const PROFILE_FILTER = [{ name: localize('profile', "Profile"), extensions: [PROFILE_EXTENSION] }];
export const PROFILES_ENABLEMENT_CONTEXT = new RawContextKey<boolean>('profiles.enabled', true);
export const CURRENT_PROFILE_CONTEXT = new RawContextKey<string>('currentProfile', '');
export const IS_CURRENT_PROFILE_TRANSIENT_CONTEXT = new RawContextKey<boolean>('isCurrentProfileTransient', false);
export const HAS_PROFILES_CONTEXT = new RawContextKey<boolean>('hasProfiles', false);
export const IS_PROFILE_IMPORT_EXPORT_IN_PROGRESS_CONTEXT = new RawContextKey<boolean>('isProfileImportExportInProgress', false);
