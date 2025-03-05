/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export async function getInstalledExtensions(): Promise<Fig.Suggestion[] | undefined> {
	const installedExtensions = vscode.extensions.all;
	return installedExtensions.map((extension) => {
		return {
			name: extension.id,
			type: 'option',
			description: extension.packageJSON.description
		};
	});
}

export async function getExtensionsToUpdateOrInstall(): Promise<Fig.Suggestion[] | undefined> {
	const installedExtensions = vscode.extensions.all;
	const extensionsToUpdateOrInstall = installedExtensions.filter((extension) => {
		return extension.packageJSON.isBuiltin === false;
	});
	return extensionsToUpdateOrInstall.map((extension) => {
		return {
			name: extension.id,
			type: 'option',
			description: extension.packageJSON.description
		};
	});
}
