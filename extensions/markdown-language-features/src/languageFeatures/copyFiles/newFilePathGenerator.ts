/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as picomatch from 'picomatch';
import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
import { getParentDocumentUri } from '../../util/document';
import { CopyFileConfiguration, getCopyFileConfiguration, GetWorkspaceFolder, isSafeCopyDestination, parseGlob, resolveCopyDestination } from './copyFiles';


export class NewFilePathGenerator {

	readonly #usedPaths = new Set<string>();

	async getNewFilePath(
		document: vscode.TextDocument,
		file: vscode.DataTransferFile,
		token: vscode.CancellationToken
	): Promise<{ readonly uri: vscode.Uri; readonly overwrite: boolean } | undefined> {
		const config = getCopyFileConfiguration(document);
		const docUri = getParentDocumentUri(document.uri);
		const getWorkspaceFolder: GetWorkspaceFolder = uri => vscode.workspace.getWorkspaceFolder(uri)?.uri;
		const defaultPath = vscode.Uri.joinPath(Utils.dirname(docUri), file.name);
		const desiredPath = getConfiguredNewFilePath(config, docUri, file, getWorkspaceFolder) ?? defaultPath;

		if (vscode.workspace.isTrusted) {
			return this.#findAvailablePath(desiredPath, config, token);
		}

		// In untrusted workspaces, never write outside of the workspace
		for (const candidate of desiredPath.toString() === defaultPath.toString() ? [desiredPath] : [desiredPath, defaultPath]) {
			const newFile = await this.#findAvailablePath(candidate, config, token);
			if (!newFile || token.isCancellationRequested) {
				return undefined;
			}
			if (await isSafeCopyDestination(docUri, newFile.uri, getWorkspaceFolder, vscode.workspace.fs)) {
				return newFile;
			}
		}
		return undefined;
	}

	async #findAvailablePath(
		desiredPath: vscode.Uri,
		config: CopyFileConfiguration,
		token: vscode.CancellationToken
	): Promise<{ readonly uri: vscode.Uri; readonly overwrite: boolean } | undefined> {
		const root = Utils.dirname(desiredPath);
		const ext = Utils.extname(desiredPath);
		let baseName = Utils.basename(desiredPath);
		baseName = baseName.slice(0, baseName.length - ext.length);
		for (let i = 0; ; ++i) {
			if (token.isCancellationRequested) {
				return undefined;
			}

			const name = i === 0 ? baseName : `${baseName}-${i}`;
			const uri = vscode.Uri.joinPath(root, name + ext);
			if (this.#wasPathAlreadyUsed(uri)) {
				continue;
			}

			// Try overwriting if it already exists
			if (config.overwriteBehavior === 'overwrite') {
				this.#usedPaths.add(uri.toString());
				return { uri, overwrite: true };
			}

			// Otherwise we need to check the fs to see if it exists
			try {
				await vscode.workspace.fs.stat(uri);
			} catch {
				if (!this.#wasPathAlreadyUsed(uri)) {
					// Does not exist
					this.#usedPaths.add(uri.toString());
					return { uri, overwrite: false };
				}
			}
		}
	}

	#wasPathAlreadyUsed(uri: vscode.Uri) {
		return this.#usedPaths.has(uri.toString());
	}
}

function getConfiguredNewFilePath(config: CopyFileConfiguration, docUri: vscode.Uri, file: vscode.DataTransferFile, getWorkspaceFolder: GetWorkspaceFolder): vscode.Uri | undefined {
	for (const [rawGlob, rawDest] of Object.entries(config.destination)) {
		for (const glob of parseGlob(rawGlob)) {
			if (picomatch.isMatch(docUri.path, glob, { dot: true })) {
				return resolveCopyDestination(docUri, file.name, rawDest, getWorkspaceFolder);
			}
		}
	}
	return undefined;
}

