/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IGitHubUploadResult {
	readonly fileName: string;
	readonly assetUrl: string;
	readonly contentType: string;
}

export const IGitHubUploadService = createDecorator<IGitHubUploadService>('githubUploadService');

export interface IGitHubUploadService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeLoginState: Event<boolean>;
	isLoggedIn(): Promise<boolean>;
	login(): Promise<boolean>;
	resolveRepositoryId(owner: string, repo: string): Promise<string>;
	uploadAsset(owner: string, repo: string, repoId: string, fileName: string, fileBytes: Uint8Array, contentType: string): Promise<IGitHubUploadResult>;
	uploadViaGist(token: string, files: { name: string; bytes: Uint8Array }[]): Promise<IGitHubUploadResult[]>;
	saveAttachmentsToFolder(screenshots: { name: string; bytes: Uint8Array }[], recordings: { name: string; bytes: Uint8Array }[]): Promise<string>;
}

/**
 * Browser fallback -- upload not supported in web.
 */
export class BrowserGitHubUploadService implements IGitHubUploadService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeLoginState = Event.None;

	async isLoggedIn(): Promise<boolean> { return false; }
	async login(): Promise<boolean> { return false; }
	async resolveRepositoryId(): Promise<string> { throw new Error('Not supported in browser'); }
	async uploadAsset(): Promise<IGitHubUploadResult> { throw new Error('Not supported in browser'); }
	async uploadViaGist(): Promise<IGitHubUploadResult[]> { throw new Error('Not supported in browser'); }
	async saveAttachmentsToFolder(): Promise<string> { throw new Error('Not supported in browser'); }
}
