/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CompletionArgs, CompleterProvider } from '../types';
import { FileSystemUtils } from '../utils/fileUtils';

interface PackageData {
	loaded: string[];
	suggestions: vscode.CompletionItem[];
}

const data: PackageData = {
	loaded: [],
	suggestions: []
};

let extensionRoot: vscode.Uri | undefined;

export async function initializePackageCompleter(root: string | vscode.Uri): Promise<void> {
	if (typeof root === 'string') {
		extensionRoot = vscode.Uri.file(root);
	} else {
		extensionRoot = root;
	}
	await loadDefaultPackages();
}

async function loadDefaultPackages(): Promise<void> {
	if (!extensionRoot) {
		return;
	}

	try {
		// Try multiple possible paths for data files
		// In production web deployment, data/ is at extension root
		// In development, files are in dist/browser/data after webpack copy
		const isBrowser = extensionRoot.scheme !== 'file';
		const possiblePaths = isBrowser
			? [
				// In production web deployment, data/ is at extension root
				['data', 'packagenames.json'],
				// In development, files are in dist/browser/data after webpack copy
				['dist', 'browser', 'data', 'packagenames.json']
			]
			: [
				['data', 'packagenames.json'],
				['extension', 'data', 'packagenames.json'],
				['out', 'data', 'packagenames.json']
			];

		let packagesUri: vscode.Uri | undefined;
		for (const pathParts of possiblePaths) {
			const testUri = FileSystemUtils.joinUri(extensionRoot, ...pathParts);
			if (await FileSystemUtils.exists(testUri)) {
				packagesUri = testUri;
				break;
			}
		}

		if (packagesUri) {
			const content = await FileSystemUtils.readFile(packagesUri);
			const packages = JSON.parse(content);

			// Handle both array format (legacy) and object format (current)
			let packageList: Array<{ name: string; detail?: string; documentation?: string }>;
			if (Array.isArray(packages)) {
				// Legacy array format: ["pkg1", "pkg2", ...]
				packageList = packages.map((pkg: string) => ({ name: pkg }));
			} else if (typeof packages === 'object' && packages !== null) {
				// Object format: { "pkg": { "command": "pkg", "detail": "...", "documentation": "..." }, ... }
				packageList = Object.entries(packages).map(([name, info]: [string, unknown]) => {
					const packageInfo = info as { command?: string; detail?: string; documentation?: string };
					return {
						name,
						detail: packageInfo.detail,
						documentation: packageInfo.documentation
					};
				});
			} else {
				console.warn('[Package Completer] Unexpected package data format');
				packageList = [];
			}

			data.suggestions = packageList.map((pkg) => {
				const item = new vscode.CompletionItem(pkg.name, vscode.CompletionItemKind.Module);
				item.detail = pkg.detail || `LaTeX package: ${pkg.name}`;
				item.documentation = pkg.documentation || `Package ${pkg.name}`;
				item.insertText = pkg.name;
				return item;
			});
		} else {
			console.warn('[Package Completer] Could not find packagenames.json in any expected location');
		}
	} catch (error) {
		console.error('[Package Completer] Error loading package data:', error);
		if (error instanceof Error) {
			console.error('[Package Completer] Error message:', error.message);
			console.error('[Package Completer] Error stack:', error.stack);
		}
	}
}

export const provider: CompleterProvider = {
	from(_result: RegExpMatchArray, _args: CompletionArgs): vscode.CompletionItem[] {
		return provide();
	}
};

function provide(): vscode.CompletionItem[] {
	return data.suggestions;
}

export function load(packageName: string): void {
	if (data.loaded.includes(packageName)) {
		return;
	}
	data.loaded.push(packageName);
	// TODO: Load package-specific commands and environments
	// This would require loading from data/packages/{packageName}.json
}

export function getAll(_langId: string): Record<string, string[]> {
	// Return packages used in the document
	// This is a simplified version - full implementation would parse \usepackage commands
	return {};
}

export const usepackage = {
	load,
	getAll,
	provide
};

