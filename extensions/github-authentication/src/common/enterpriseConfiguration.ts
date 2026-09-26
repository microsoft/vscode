/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const enterpriseUriSetting = 'github-enterprise.uri';

export function getEnterpriseUriKey(uri: vscode.Uri): string {
	return uri.with({
		scheme: uri.scheme.toLowerCase(),
		authority: uri.authority.toLowerCase(),
		path: uri.path.replace(/\/+$/, '')
	}).toString();
}
