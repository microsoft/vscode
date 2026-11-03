/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IGitHubUploadResult {
	readonly fileName: string;
	readonly assetUrl: string;
	readonly contentType: string;
}

export const IGitHubUploadService = createDecorator<IGitHubUploadService>('githubUploadService');

export interface IGitHubUploadService {
	readonly _serviceBrand: undefined;
	resolveRepositoryId(owner: string, repo: string, token?: string): Promise<string>;
	uploadViaMobileApi(token: string, repoId: string, files: { name: string; bytes: Uint8Array; contentType: string }[]): Promise<IGitHubUploadResult[]>;
}

/**
 * Browser fallback, upload not yet supported in web.
 */
export class BrowserGitHubUploadService implements IGitHubUploadService {
	readonly _serviceBrand: undefined;

	async resolveRepositoryId(): Promise<string> { throw new Error('Not supported in browser'); }
	async uploadViaMobileApi(): Promise<IGitHubUploadResult[]> { throw new Error('Not supported in browser'); }
}
