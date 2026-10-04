/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { DisposableStore, IReference } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { asObject, requiredNumber, requiredString } from './githubResponse.js';
import type { IGitHubAnonymousClient } from './githubService.js';
import { GitHubAnonymousReadOptions } from './githubTransport.js';
import { GitHubRequestError } from './githubTypes.js';

export interface IGitHubRepositoryFile {
	readonly commitSha: string;
	readonly content: string;
}

export interface IGitHubRepositories {
	/** Reads a public GitHub.com file at the resolved repository HEAD using one anonymous lease. */
	readPublicFile(owner: string, repo: string, path: string, signal: AbortSignal): Promise<IGitHubRepositoryFile>;
}

export class GitHubRepositoryService implements IGitHubRepositories {
	constructor(private readonly _acquireAnonymousClient: () => IReference<IGitHubAnonymousClient>) { }

	async readPublicFile(owner: string, repo: string, path: string, signal: AbortSignal): Promise<IGitHubRepositoryFile> {
		signal.throwIfAborted();
		const lifetime = new DisposableStore();
		try {
			const client = lifetime.add(this._acquireAnonymousClient()).object;
			const options: GitHubAnonymousReadOptions = { caller: 'github.query', priority: 'interactive', deadline: Date.now() + 5 * 60_000 };
			const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
			const commitResponse = await client.get<unknown>(`${repositoryPath}/commits/HEAD`, signal, options);
			signal.throwIfAborted();
			const invalidCommit = localize('githubRepository.invalidCommit', "GitHub returned an invalid repository revision.");
			const commitSha = requiredString(asObject(commitResponse.data, invalidCommit), 'sha');
			if (!/^[a-f0-9]{40}$/.test(commitSha)) {
				throw new GitHubRequestError(invalidCommit, 'malformedResponse');
			}
			const fileResponse = await client.get<unknown>(`${repositoryPath}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${commitSha}`, signal, options);
			signal.throwIfAborted();
			const file = asObject(fileResponse.data, localize('githubRepository.invalidFile', "GitHub returned an invalid repository file."));
			if (requiredString(file, 'type') !== 'file' || requiredString(file, 'encoding') !== 'base64') {
				throw new GitHubRequestError(localize('githubRepository.unsupportedFile', "GitHub did not return a base64-encoded repository file."), 'malformedResponse');
			}
			const size = requiredNumber(file, 'size');
			if (!Number.isSafeInteger(size) || size < 0 || size > 1024 * 1024) {
				throw new GitHubRequestError(localize('githubRepository.invalidSize', "GitHub returned an invalid repository file size. Files must not exceed 1 MiB."), 'malformedResponse');
			}
			const encoded = requiredString(file, 'content').replace(/[\r\n]/g, '');
			const invalidContent = localize('githubRepository.invalidContent', "GitHub returned invalid base64 repository file contents.");
			if (encoded.length !== Math.ceil(size / 3) * 4) {
				throw new GitHubRequestError(invalidContent, 'malformedResponse');
			}
			let decoded: VSBuffer;
			try {
				decoded = decodeBase64(encoded);
			} catch (error) {
				if (!(error instanceof SyntaxError)) {
					throw error;
				}
				throw new GitHubRequestError(invalidContent, 'malformedResponse');
			}
			if (decoded.byteLength !== size || encodeBase64(decoded) !== encoded) {
				throw new GitHubRequestError(invalidContent, 'malformedResponse');
			}
			return { commitSha, content: decoded.toString() };
		} finally {
			lifetime.dispose();
		}
	}
}
