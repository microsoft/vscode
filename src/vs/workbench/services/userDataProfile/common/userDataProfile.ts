/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUndefined } from 'vs/base/common/types';
import { Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IUserDataProfile, UseDefaultProfileFlags } from 'vs/platform/userDataProfile/common/userDataProfile';

export interface DidChangeUserDataProfileEvent {
	readonly preserveData: boolean;
	readonly previous: IUserDataProfile;
	readonly profile: IUserDataProfile;
	join(promise: Promise<void>): void;
}

export const IUserDataProfileService = createDecorator<IUserDataProfileService>('IUserDataProfileService');
export interface IUserDataProfileService {
	readonly _serviceBrand: undefined;
	readonly defaultProfile: IUserDataProfile;
	readonly onDidChangeCurrentProfile: Event<DidChangeUserDataProfileEvent>;
	readonly currentProfile: IUserDataProfile;
	updateCurrentProfile(currentProfile: IUserDataProfile, preserveData: boolean): Promise<void>;
}

export const IUserDataProfileManagementService = createDecorator<IUserDataProfileManagementService>('IUserDataProfileManagementService');
export interface IUserDataProfileManagementService {
	readonly _serviceBrand: undefined;

	createAndEnterProfile(name: string, useDefaultFlags?: UseDefaultProfileFlags, fromExisting?: boolean): Promise<void>;
	createAndEnterProfileFromTemplate(name: string, template: IUserDataProfileTemplate, useDefaultFlags?: UseDefaultProfileFlags): Promise<void>;
	removeProfile(profile: IUserDataProfile): Promise<void>;
	switchProfile(profile: IUserDataProfile): Promise<void>;

}

export interface IUserDataProfileTemplate {
	readonly name?: string;
	readonly settings?: string;
	readonly globalState?: string;
	readonly extensions?: string;
}

export function isUserDataProfileTemplate(thing: unknown): thing is IUserDataProfileTemplate {
	const candidate = thing as IUserDataProfileTemplate | undefined;

	return !!(candidate && typeof candidate === 'object'
		&& (isUndefined(candidate.name) || typeof candidate.name === 'string')
		&& (isUndefined(candidate.settings) || typeof candidate.settings === 'string')
		&& (isUndefined(candidate.globalState) || typeof candidate.globalState === 'string')
		&& (isUndefined(candidate.extensions) || typeof candidate.extensions === 'string'));
}

export type ProfileCreationOptions = { readonly skipComments: boolean };

export const IUserDataProfileWorkbenchService = createDecorator<IUserDataProfileWorkbenchService>('IUserDataProfileWorkbenchService');
export interface IUserDataProfileWorkbenchService {
	readonly _serviceBrand: undefined;

	createProfile(options?: ProfileCreationOptions): Promise<IUserDataProfileTemplate>;
	setProfile(profile: IUserDataProfileTemplate): Promise<void>;
}

export interface IResourceProfile {
	getProfileContent(): Promise<string>;
	applyProfile(content: string): Promise<void>;
}

export const ManageProfilesSubMenu = new MenuId('Profiles');
export const PROFILES_TTILE = { value: localize('settings profiles', "Profiles"), original: 'Profiles' };
export const PROFILES_CATEGORY = PROFILES_TTILE.value;
export const PROFILE_EXTENSION = 'code-profile';
export const PROFILE_FILTER = [{ name: localize('profile', "Profile"), extensions: [PROFILE_EXTENSION] }];
