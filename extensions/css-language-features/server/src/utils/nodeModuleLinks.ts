/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentLink, TextDocument } from 'vscode-css-languageservice';
import { WorkspaceFolder } from 'vscode-languageserver';
import { URI, Utils } from 'vscode-uri';
import { RequestService } from '../requests';

/**
 * For CSS @import paths that look like bare module specifiers (e.g. "some-module/style.css"),
 * try resolving against node_modules/ as a fallback when the local file doesn't exist.
 * This supports bundler-style imports (Vite, Webpack, etc.) without requiring the ~ prefix.
 */
export async function resolveNodeModuleLinks(
	links: DocumentLink[],
	document: TextDocument,
	workspaceFolders: WorkspaceFolder[],
	requestService: RequestService
): Promise<DocumentLink[]> {
	const resolvedLinks: DocumentLink[] = [];

	for (const link of links) {
		if (!link.target) {
			resolvedLinks.push(link);
			continue;
		}

		// Extract the original reference text from the document (without quotes)
		const refText = document.getText(link.range).replace(/['"]/g, '');

		// Only apply fallback for bare specifiers — skip relative, absolute, tilde, URLs
		if (!refText || refText.startsWith('.') || refText.startsWith('/') || refText.startsWith('~') || refText.includes('://')) {
			resolvedLinks.push(link);
			continue;
		}

		// Check if the resolved target actually exists
		let exists = false;
		try {
			await requestService.stat(link.target);
			exists = true;
		} catch {
			// File does not exist at resolved path
		}

		if (!exists) {
			// Try node_modules fallback in each workspace folder
			for (const folder of workspaceFolders) {
				const nodeModuleTarget = Utils.joinPath(URI.parse(folder.uri), 'node_modules', refText).toString(true);
				try {
					await requestService.stat(nodeModuleTarget);
					link.target = nodeModuleTarget;
					break;
				} catch {
					// Not found in this workspace folder's node_modules
				}
			}
		}

		resolvedLinks.push(link);
	}

	return resolvedLinks;
}
