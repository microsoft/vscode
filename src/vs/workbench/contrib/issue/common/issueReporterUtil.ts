/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductConfiguration } from '../../../../base/common/product.js';
import { rtrim } from '../../../../base/common/strings.js';
import { localize } from '../../../../nls.js';

/** Normalizes a GitHub repository URL for issue creation and duplicate searches. */
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

/** Formats the running product version consistently across Issue Reporter surfaces. */
export function formatIssueReporterVersion(product: Pick<IProductConfiguration, 'nameShort' | 'version' | 'darwinUniversalAssetId' | 'commit' | 'date'>): string {
	const version = product.darwinUniversalAssetId
		? localize('issueReporter.version.universal', "{0} (Universal)", product.version)
		: product.version;
	const commit = product.commit || localize('issueReporter.version.commitUnknown', "Commit unknown");
	const date = product.date || localize('issueReporter.version.dateUnknown', "Date unknown");
	return localize('issueReporter.version.full', "{0} {1} ({2}, {3})", product.nameShort, version, commit, date);
}
