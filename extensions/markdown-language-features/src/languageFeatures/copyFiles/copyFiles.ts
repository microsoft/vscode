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

type GetWorkspaceFolder = (documentUri: vscode.Uri) => vscode.Uri | undefined;

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
		['documentDirName', documentDirName.path], // Absolute parent directory path
		['documentRelativeDirName', workspaceFolder ? path.posix.relative(workspaceFolder.path, documentDirName.path) : documentDirName.path], // Absolute parent directory path
		['documentFileName', documentBaseName], // Full filename: file.md
		['documentBaseName', documentBaseName.slice(0, documentBaseName.length - documentExtName.length)], // Just the name: file
		['documentExtName', documentExtName.replace('.', '')], // The document ext (without dot): md
		['documentFilePath', documentUri.path], // Full document path
		['documentRelativeFilePath', workspaceFolder ? path.posix.relative(workspaceFolder.path, documentUri.path) : documentUri.path], // Full document path relative to workspace

		// Workspace
		['documentWorkspaceFolder', ((workspaceFolder ?? documentDirName).path)],

		// File
		['fileName', fileName], // Full file name
		['fileExtName', path.extname(fileName).replace('.', '')], // File extension (without dot): png
	]);

	return outDest.replaceAll(/(?<escape>\\\$)|(?<!\\)\$\{(?<name>\w+)(?:\/(?<pattern>(?:\\\/|[^\}\/])+)\/(?<replacement>(?:\\\/|[^\}\/])*)\/)?\}/g, (match, _escape, name, pattern, replacement, _offset, _str, groups) => {
		if (groups?.['escape']) {
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
