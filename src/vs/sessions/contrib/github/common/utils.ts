/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../services/sessions/common/session.js';
import { IGitHubChangedFile } from './types.js';

export interface IPullRequestContentUriParams {
	readonly owner: string;
	readonly repo: string;
	readonly prNumber: number;
	readonly commitSha: string;
	readonly isBase: boolean;
	readonly previousFileName?: string;
	readonly status?: IGitHubChangedFile['status'];
}

export function toPRContentUri(fileName: string, params: IPullRequestContentUriParams): URI {
	return URI.from({
		scheme: Schemas.copilotPr,
		path: `/${fileName}`,
		query: JSON.stringify({ ...params, fileName })
	});
}

export function getPullRequestKey(owner: string, repo: string, prNumber: number): string {
	return `${owner}/${repo}/${prNumber}`;
}

export function getGitHubRepositoryFromUri(uri: URI): { readonly owner: string; readonly repo: string } | undefined {
	if (uri.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
		return undefined;
	}
	const segments = uri.path.split('/').filter(Boolean);
	if (segments.length < 2) {
		return undefined;
	}
	try {
		return {
			owner: decodeURIComponent(segments[0]),
			repo: decodeURIComponent(segments[1]),
		};
	} catch {
		return undefined;
	}
}
