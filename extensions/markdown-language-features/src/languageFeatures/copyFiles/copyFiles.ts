/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import * as picomatch from 'picomatch';
import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
import { getParentDocumentUri } from './dropIntoEditor';


export async function getNewFileName(document: vscode.TextDocument, file: vscode.DataTransferFile): Promise<vscode.Uri> {
	const desiredPath = getDesiredNewFilePath(document, file);

	const root = Utils.dirname(desiredPath);
	const ext = path.extname(file.name);
	const baseName = path.basename(file.name, ext);
	for (let i = 0; ; ++i) {
		const name = i === 0 ? baseName : `${baseName}-${i}`;
		const uri = vscode.Uri.joinPath(root, `${name}${ext}`);
		try {
			await vscode.workspace.fs.stat(uri);
		} catch {
			// Does not exist
			return uri;
		}
	}
}

function getDesiredNewFilePath(document: vscode.TextDocument, file: vscode.DataTransferFile): vscode.Uri {
	const docUri = getParentDocumentUri(document);
	const config = vscode.workspace.getConfiguration('markdown').get<Record<string, string>>('experimental.copyFiles.destination') ?? {};
	for (const [rawGlob, rawDest] of Object.entries(config)) {
		for (const glob of parseGlob(rawGlob)) {
			if (picomatch.isMatch(docUri.path, glob)) {
				return resolveCopyDestination(docUri, file.name, rawDest, uri => vscode.workspace.getWorkspaceFolder(uri)?.uri);
			}
		}
	}

	// Default to next to current file
	return vscode.Uri.joinPath(Utils.dirname(docUri), file.name);
}

function parseGlob(rawGlob: string): Iterable<string> {
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
	let outDest = dest;

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
		['documentDirName', documentDirName.path], //  Parent directory path
		['documentFileName', documentBaseName], // Full filename: file.md
		['documentBaseName', documentBaseName.slice(0, documentBaseName.length - documentExtName.length)], // Just the name: file
		['documentExtName', documentExtName.replace('.', '')], // Just the file ext: md

		// Workspace
		['documentWorkspaceFolder', (workspaceFolder ?? documentDirName).path],

		// File
		['fileName', fileName],// Full file name
	]);

	return outDest.replaceAll(/\$\{(\w+)(?:\/([^\}]+?)\/([^\}]+?)\/)?\}/g, (_, name, pattern, replacement) => {
		const entry = vars.get(name);
		if (!entry) {
			return '';
		}

		if (pattern && replacement) {
			return entry.replace(new RegExp(pattern), replacement);
		}

		return entry;
	});
}
