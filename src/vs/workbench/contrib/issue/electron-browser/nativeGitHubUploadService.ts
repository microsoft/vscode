/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IGitHubUploadResult, IGitHubUploadService } from '../browser/githubUploadService.js';

/**
 * GitHub upload service using the Mobile Upload API.
 *
 * Uploads files via the main process (Electron net.fetch) to bypass CORS.
 */
export class NativeGitHubUploadService extends Disposable implements IGitHubUploadService {

	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) {
		super();
	}

	async resolveRepositoryId(owner: string, repo: string, token?: string): Promise<string> {
		const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}
		const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers });
		if (!r.ok) {
			const body = await r.text().catch(() => '');
			throw new Error(`Repo ID lookup failed for ${owner}/${repo}: ${r.status} ${r.statusText}${body ? ` — ${body.substring(0, 300)}` : ''}`);
		}
		const json = await r.json();
		return String(json.id);
	}

	async uploadViaMobileApi(token: string, repoId: string, files: { name: string; bytes: Uint8Array; contentType: string }[]): Promise<IGitHubUploadResult[]> {
		const results: IGitHubUploadResult[] = [];
		for (const file of files) {
			const result = await this.nativeHostService.uploadFileViaMobileApi(
				token, repoId, file.name, VSBuffer.wrap(file.bytes), file.contentType
			);
			this.logService.info(`[GitHubUpload] Uploaded ${file.name} (${file.bytes.length} bytes) -> ${result.assetUrl}`);
			results.push(result);
		}
		return results;
	}
}
