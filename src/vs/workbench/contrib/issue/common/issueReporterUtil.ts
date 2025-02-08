/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { rtrim } from '../../../../base/common/strings.js';

export function normalizeGitHubUrl(url: string): string {
	// If the url has a .git suffix, remove it
	if (url.endsWith('.git')) {
		url = url.substr(0, url.length - 4);
	}

	// Remove trailing slash
	url = rtrim(url, '/');

	if (url.endsWith('/new')) {
		url = rtrim(url, '/new');
	}

	if (url.endsWith('/issues')) {
		url = rtrim(url, '/issues');
	}

	return url;
}
