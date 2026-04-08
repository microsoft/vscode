/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { GITHUB_PR_FILE_SCHEME } from '../../../services/sessions/common/session.js';
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
		scheme: GITHUB_PR_FILE_SCHEME,
		path: `/${fileName}`,
		query: JSON.stringify({ ...params, fileName })
	});
}
