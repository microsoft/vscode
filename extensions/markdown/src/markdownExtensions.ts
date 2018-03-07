/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

import { MarkdownContentProvider } from './features/previewContentProvider';
import { MarkdownEngine } from './markdownEngine';

const resolveExtensionResources = (extension: vscode.Extension<any>, resourcePath: string): vscode.Uri => {
	return vscode.Uri.file(path.join(extension.extensionPath, resourcePath))
		.with({ scheme: 'vscode-extension-resource' });
};


export function loadMarkdownExtensions(
	contentProvider: MarkdownContentProvider,
	engine: MarkdownEngine
) {
	for (const extension of vscode.extensions.all) {
		const contributes = extension.packageJSON && extension.packageJSON.contributes;
		if (!contributes) {
			continue;
		}

		tryLoadPreviewStyles(contributes, contentProvider, extension);
		tryLoadPreviewScripts(contributes, contentProvider, extension);
		tryLoadMarkdownItPlugins(contributes, extension, engine);
	}
}

function tryLoadMarkdownItPlugins(
	contributes: any,
	extension: vscode.Extension<any>,
	engine: MarkdownEngine
) {
	if (contributes['markdown.markdownItPlugins']) {
		extension.activate().then(() => {
			if (extension.exports && extension.exports.extendMarkdownIt) {
				engine.addPlugin((md: any) => extension.exports.extendMarkdownIt(md));
			}
		});
	}
}

function tryLoadPreviewScripts(
	contributes: any,
	contentProvider: MarkdownContentProvider,
	extension: vscode.Extension<any>
) {
	const scripts = contributes['markdown.previewScripts'];
	if (scripts && Array.isArray(scripts)) {
		for (const script of scripts) {
			try {
				contentProvider.addScript(resolveExtensionResources(extension, script));
			} catch (e) {
				// noop
			}
		}
	}
}

function tryLoadPreviewStyles(
	contributes: any,
	contentProvider: MarkdownContentProvider,
	extension: vscode.Extension<any>
) {
	const styles = contributes['markdown.previewStyles'];
	if (styles && Array.isArray(styles)) {
		for (const style of styles) {
			try {
				contentProvider.addStyle(resolveExtensionResources(extension, style));
			} catch (e) {
				// noop
			}
		}
	}
}

