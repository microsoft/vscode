/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const GITHUB_AUTH_PROVIDER_ID = 'github';
export const GITHUB_ENTERPRISE_AUTH_PROVIDER_ID = 'github-enterprise';

export function isGitHubAuthenticationProvider(providerId: string | undefined): boolean {
	return providerId === GITHUB_AUTH_PROVIDER_ID || providerId === GITHUB_ENTERPRISE_AUTH_PROVIDER_ID;
}

export const IAccountProfileImageService = createDecorator<IAccountProfileImageService>('accountProfileImageService');

export interface IAccountProfileImageService {
	readonly _serviceBrand: undefined;
	getDefaultProfileImageUrl(): Promise<string | undefined>;
}
