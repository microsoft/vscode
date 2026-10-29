/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';

type OverwriteBehavior = 'overwrite' | 'nameIncrementally';

export interface CopyFileConfiguration {
	readonly destination: Record<string, string>;
	readonly overwriteBehavior: OverwriteBehavior;
}

export function getCopyFileConfiguration(document: vscode.TextDocument): CopyFileConfiguration {
	const config = vscode.workspace.getConfiguration('markdown', document);
	return {
		destination: config.get<Record<string, string>>('copyFiles.destination') ?? {},
		overwriteBehavior: readOverwriteBehavior(config),
	};
}

function readOverwriteBehavior(config: vscode.WorkspaceConfiguration): OverwriteBehavior {
	switch (config.get('copyFiles.overwriteBehavior')) {
		case 'overwrite': return 'overwrite';
		default: return 'nameIncrementally';
	}
}

export function parseGlob(rawGlob: string): Iterable<string> {
	if (rawGlob.startsWith('/')) {
		// Anchor to workspace folders
		return (vscode.workspace.workspaceFolders ?? []).map(folder => vscode.Uri.joinPath(folder.uri, rawGlob).path);
	}

	// Relative path, so implicitly track on ** to match everything
	if (!rawGlob.startsWith('**')) {
		return ['**/' + rawGlob];
	}

	return [rawGlob];
}

export type GetWorkspaceFolder = (documentUri: vscode.Uri) => vscode.Uri | undefined;

/**
 * Checks that a copy destination stays inside the workspace folder of the document,
 * or inside the document's directory if the document is not part of a workspace.
 */
export function isCopyDestinationInsideWorkspace(documentUri: vscode.Uri, destination: vscode.Uri, getWorkspaceFolder: GetWorkspaceFolder): boolean {
	const root = getWorkspaceFolder(documentUri) ?? Utils.dirname(documentUri);
	if (root.scheme !== destination.scheme || root.authority !== destination.authority) {
		return false;
	}

	// Treat `\` as a separator too, since it is one on Windows file systems.
	// Drive letters may differ in case between URIs (`/C:/` vs `/c:/`).
	const normalize = (p: string) => path.posix.normalize(p.replaceAll('\\', '/')).replace(/^\/([a-zA-Z]):/, (_, drive: string) => `/${drive.toLowerCase()}:`);
	const rootPath = normalize(root.path).replace(/\/?$/, '/');
	return normalize(destination.path).startsWith(rootPath);
}

export function resolveCopyDestination(documentUri: vscode.Uri, fileName: string, dest: string, getWorkspaceFolder: GetWorkspaceFolder): vscode.Uri {
	const resolvedDest = resolveCopyDestinationSetting(documentUri, fileName, dest, getWorkspaceFolder);

	if (resolvedDest.startsWith('/')) {
		// Absolute path
		return Utils.resolvePath(documentUri, resolvedDest);
	}

	// Relative to document
	const dirName = Utils.dirname(documentUri);
	return Utils.resolvePath(dirName, resolvedDest);
}


function resolveCopyDestinationSetting(documentUri: vscode.Uri, fileName: string, dest: string, getWorkspaceFolder: GetWorkspaceFolder): string {
	let outDest = dest.trim();
	if (!outDest) {
		outDest = '${fileName}';
	}

	// Destination that start with `/` implicitly means go to workspace root
	if (outDest.startsWith('/')) {
		outDest = '${documentWorkspaceFolder}/' + outDest.slice(1);
	}

	// Destination that ends with `/` implicitly needs a fileName
	if (outDest.endsWith('/')) {
		outDest += '${fileName}';
	}

	const documentDirName = Utils.dirname(documentUri);
	const documentBaseName = Utils.basename(documentUri);
	const documentExtName = Utils.extname(documentUri);

	const workspaceFolder = getWorkspaceFolder(documentUri);

	const vars = new Map<string, string>([
		// Document
		['documentDirName', documentDirName.path], // Absolute parent directory path of the Markdown document, e.g. `/Users/me/myProject/docs`.
		['documentRelativeDirName', workspaceFolder ? path.posix.relative(workspaceFolder.path, documentDirName.path) : documentDirName.path], // Relative parent directory path of the Markdown document, e.g. `docs`. This is the same as `${documentDirName}` if the file is not part of a workspace.
		['documentFileName', documentBaseName], // The full filename of the Markdown document, e.g. `README.md`.
		['documentBaseName', documentBaseName.slice(0, documentBaseName.length - documentExtName.length)], // The basename of the Markdown document, e.g. `README`.
		['documentExtName', documentExtName.replace('.', '')], // The extension of the Markdown document, e.g. `md`.
		['documentFilePath', documentUri.path], // Absolute path of the Markdown document, e.g. `/Users/me/myProject/docs/README.md`.
		['documentRelativeFilePath', workspaceFolder ? path.posix.relative(workspaceFolder.path, documentUri.path) : documentUri.path], // Relative path of the Markdown document, e.g. `docs/README.md`. This is the same as `${documentFilePath}` if the file is not part of a workspace.

		// Workspace
		['documentWorkspaceFolder', ((workspaceFolder ?? documentDirName).path)], // The workspace folder for the Markdown document, e.g. `/Users/me/myProject`. This is the same as `${documentDirName}` if the file is not part of a workspace.

		// File
		['fileName', fileName], // The file name of the dropped file, e.g. `image.png`.
		['fileExtName', path.extname(fileName).replace('.', '')], // The extension of the dropped file, e.g. `png`.
		['unixTime', Date.now().toString()], // The current Unix timestamp in milliseconds.
		['isoTime', new Date().toISOString()], // The current time in ISO 8601 format, e.g. '2025-06-06T08:40:32.123Z'.
	]);

	return outDest.replaceAll(/(?<escape>\\\$)|(?<!\\)\$\{(?<name>\w+)(?:\/(?<pattern>(?:\\\/|[^\}\/])+)\/(?<replacement>(?:\\\/|[^\}\/])*)\/)?\}/g, (match, _escape, name, pattern, replacement, _offset, _str, groups) => {
		if (groups?.escape) {
			return '$';
		}

		const entry = vars.get(name);
		if (typeof entry !== 'string') {
			return match;
		}

		if (pattern && replacement) {
			try {
				return entry.replace(new RegExp(replaceTransformEscapes(pattern)), replaceTransformEscapes(replacement));
			} catch (e) {
				console.log(`Error applying 'resolveCopyDestinationSetting' transform: ${pattern} -> ${replacement}`);
			}
		}

		return entry;
	});
}

function replaceTransformEscapes(str: string): string {
	return str.replaceAll(/\\\//g, '/');
}
