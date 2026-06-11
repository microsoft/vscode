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

export interface IAccountProfileImageRequest {
	readonly providerId: string | undefined;
	readonly accountName: string | undefined;
	readonly sessionId?: string;
}

export const IAccountProfileImageService = createDecorator<IAccountProfileImageService>('accountProfileImageService');

export interface IAccountProfileImageService {
	readonly _serviceBrand: undefined;
	getProfileImageUrl(request: IAccountProfileImageRequest): Promise<string | undefined>;
	getDefaultProfileImageUrl(): Promise<string | undefined>;
}
