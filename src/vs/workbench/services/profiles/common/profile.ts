/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUndefined } from 'vs/base/common/types';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IProfile {
	readonly id: string;
	readonly name?: string;
	readonly settings?: string;
	readonly globalState?: string;
	readonly extensions?: string;
}

export function isProfile(thing: any): thing is IProfile {
	const candidate = thing as IProfile | undefined;

	return !!(candidate && typeof candidate === 'object'
		&& typeof candidate.id === 'string'
		&& (isUndefined(candidate.name) || typeof candidate.name === 'string')
		&& (isUndefined(candidate.settings) || typeof candidate.settings === 'string')
		&& (isUndefined(candidate.globalState) || typeof candidate.globalState === 'string')
		&& (isUndefined(candidate.extensions) || typeof candidate.extensions === 'string'));
}

export type ProfileCreationOptions = { readonly skipComments: boolean };

export const IWorkbenchProfileService = createDecorator<IWorkbenchProfileService>('IWorkbenchProfileService');
export interface IWorkbenchProfileService {
	readonly _serviceBrand: undefined;

	createProfile(options?: ProfileCreationOptions): Promise<IProfile>;
	setProfile(profile: IProfile): Promise<void>;
}

export interface IResourceProfile {
	getProfileContent(): Promise<string>;
	applyProfile(content: string): Promise<void>;
}
