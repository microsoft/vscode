/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { posix } from 'path';

export const exists = async (resource: vscode.Uri): Promise<boolean> => {
	try {
		const stat = await vscode.workspace.fs.stat(resource);
		// stat.type is an enum flag
		return !!(stat.type & vscode.FileType.File);
	} catch {
		return false;
	}
};

/** A lighter Node's node_modules resolution algorithm */
export const resolveNodeModulesPath = async (currentUriDir: vscode.Uri, pathCandidates: string[]): Promise<vscode.Uri | undefined> => {
	const { fs } = vscode.workspace;

	// clone Uri
	let currentUri = vscode.Uri.joinPath(currentUriDir, '.');
	while (true) {
		const nodeModulesUri = vscode.Uri.joinPath(currentUri, 'node_modules');
		let nodeModulesStat: vscode.FileStat | undefined;
		try {
			// eslint-disable-next-line no-await-in-loop
			nodeModulesStat = await fs.stat(nodeModulesUri);
		} catch (err) { }
		if (nodeModulesStat && (nodeModulesStat.type & vscode.FileType.Directory)) {
			for (const uriCandidate of pathCandidates.map((relativePath) => vscode.Uri.joinPath(nodeModulesUri, relativePath))) {
				if (await exists(uriCandidate)) {
					return uriCandidate;
				}
			}
		}
		// reached the root
		if (posix.relative(currentUri.path, '/') === '') { return; }

		currentUri = vscode.Uri.joinPath(currentUri, '..');
	}

};
