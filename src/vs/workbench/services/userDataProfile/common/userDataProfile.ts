/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUndefined } from 'vs/base/common/types';
import { Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IUserDataProfile, PROFILES_ENABLEMENT_CONFIG, UseDefaultProfileFlags } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ContextKeyDefinedExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IsWebContext, ProductQualityContext } from 'vs/platform/contextkey/common/contextkeys';

export interface DidChangeUserDataProfileEvent {
	readonly preserveData: boolean;
	readonly previous: IUserDataProfile;
	readonly profile: IUserDataProfile;
	join(promise: Promise<void>): void;
}

export const IUserDataProfileService = createDecorator<IUserDataProfileService>('IUserDataProfileService');
export interface IUserDataProfileService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeCurrentProfile: Event<DidChangeUserDataProfileEvent>;
	readonly currentProfile: IUserDataProfile;
	updateCurrentProfile(currentProfile: IUserDataProfile, preserveData: boolean): Promise<void>;
}

export const IUserDataProfileManagementService = createDecorator<IUserDataProfileManagementService>('IUserDataProfileManagementService');
export interface IUserDataProfileManagementService {
	readonly _serviceBrand: undefined;

	createAndEnterProfile(name: string, useDefaultFlags?: UseDefaultProfileFlags, fromExisting?: boolean): Promise<IUserDataProfile>;
	removeProfile(profile: IUserDataProfile): Promise<void>;
	switchProfile(profile: IUserDataProfile): Promise<void>;

}

export interface IUserDataProfileTemplate {
	readonly settings?: string;
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

	exportProfile(options?: ProfileCreationOptions): Promise<IUserDataProfileTemplate>;
	importProfile(profile: IUserDataProfileTemplate): Promise<void>;
	setProfile(profile: IUserDataProfileTemplate): Promise<void>;
}

export interface IResourceProfile {
	getProfileContent(): Promise<string>;
	applyProfile(content: string): Promise<void>;
}

export const ManageProfilesSubMenu = new MenuId('SettingsProfiles');
export const PROFILES_TTILE = { value: localize('settings profiles', "Settings Profiles"), original: 'Settings Profiles' };
export const PROFILES_CATEGORY = PROFILES_TTILE.value;
export const PROFILE_EXTENSION = 'code-profile';
export const PROFILE_FILTER = [{ name: localize('profile', "Settings Profile"), extensions: [PROFILE_EXTENSION] }];
export const PROFILES_ENABLEMENT_CONTEXT = ContextKeyExpr.and(ProductQualityContext.notEqualsTo('stable'), IsWebContext.negate(), ContextKeyDefinedExpr.create(`config.${PROFILES_ENABLEMENT_CONFIG}`));
