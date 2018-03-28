/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { endsWith, rtrim } from 'vs/base/common/strings';

export function normalizeGitHubIssuesUrl(url: string): string {
	// If the url has a .git suffix, remove it
	if (endsWith(url, '.git')) {
		url = url.substr(0, url.length - 4);
	}

	// Remove trailing slash
	url = rtrim(url, '/');

	// If the url already ends with issues/new, it's beautiful, return it
	if (endsWith(url, 'issues/new')) {
		return url;
	}

	// Add new segment if it does not exist
	if (endsWith(url, 'issues')) {
		return url + '/new';
	}

	return url + '/issues/new';
}