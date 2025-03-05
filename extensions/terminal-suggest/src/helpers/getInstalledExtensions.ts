/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export async function getInstalledExtensions(): Promise<Fig.Suggestion[] | undefined> {
	const installedExtensions = vscode.extensions.all;
	return installedExtensions.map((extension) => {
		const [publisher, name] = extension.id.split('.');
		return {
			name,
			description: 'Publisher: ' + publisher,
			type: 'option',
			version: extension.packageJSON.version
		};
	});
}
