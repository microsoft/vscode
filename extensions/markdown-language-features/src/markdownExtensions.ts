/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

const resolveExtensionResource = (extension: vscode.Extension<any>, resourcePath: string): vscode.Uri => {
	return vscode.Uri.file(path.join(extension.extensionPath, resourcePath))
		.with({ scheme: 'vscode-resource' });
};

const resolveExtensionResources = (extension: vscode.Extension<any>, resourcePaths: any): vscode.Uri[] => {
	const result: vscode.Uri[] = [];
	if (Array.isArray(resourcePaths)) {
		for (const resource of resourcePaths) {
			try {
				result.push(resolveExtensionResource(extension, resource));
			} catch (e) {
				// noop
			}
		}
	}
	return result;
};

export interface MarkdownContributions {
	readonly previewScripts: ReadonlyArray<vscode.Uri>;
	readonly previewStyles: ReadonlyArray<vscode.Uri>;
	readonly previewResourceRoots: ReadonlyArray<vscode.Uri>;
	readonly markdownItPlugins: ReadonlyArray<Thenable<(md: any) => any>>;
}

export namespace MarkdownContributions {
	export const Empty: MarkdownContributions = {
		previewScripts: [],
		previewStyles: [],
		previewResourceRoots: [],
		markdownItPlugins: []
	};

	export function merge(a: MarkdownContributions, b: MarkdownContributions): MarkdownContributions {
		return {
			previewScripts: [...a.previewScripts, ...b.previewScripts],
			previewStyles: [...a.previewStyles, ...b.previewStyles],
			previewResourceRoots: [...a.previewResourceRoots, ...b.previewResourceRoots],
			markdownItPlugins: [...a.markdownItPlugins, ...b.markdownItPlugins],
		};
	}

	export function fromExtension(
		extension: vscode.Extension<any>
	): MarkdownContributions {
		const contributes = extension.packageJSON && extension.packageJSON.contributes;
		if (!contributes) {
			return MarkdownContributions.Empty;
		}

		const styles = tryLoadPreviewStyles(contributes, extension);
		const scripts = tryLoadPreviewScripts(contributes, extension);
		const previewResourceRoots: vscode.Uri[] = [];
		if (styles.length || scripts.length) {
			previewResourceRoots.push(vscode.Uri.file(extension.extensionPath));
		}

		const plugins = tryLoadMarkdownItPlugins(contributes, extension);
		return {
			previewScripts: scripts,
			previewStyles: styles,
			previewResourceRoots,
			markdownItPlugins: plugins ? [plugins] : []
		};
	}

	function tryLoadMarkdownItPlugins(
		contributes: any,
		extension: vscode.Extension<any>
	): Thenable<(md: any) => any> | undefined {
		if (contributes['markdown.markdownItPlugins']) {
			return extension.activate().then(() => {
				if (extension.exports && extension.exports.extendMarkdownIt) {
					return (md: any) => extension.exports.extendMarkdownIt(md);
				}
				return (md: any) => md;
			});
		}
		return undefined;
	}

	function tryLoadPreviewScripts(
		contributes: any,
		extension: vscode.Extension<any>
	) {
		return resolveExtensionResources(extension, contributes['markdown.previewScripts']);
	}

	function tryLoadPreviewStyles(
		contributes: any,
		extension: vscode.Extension<any>
	) {
		return resolveExtensionResources(extension, contributes['markdown.previewStyles']);
	}
}

export interface MarkdownContributionProvider {
	readonly extensionPath: string;
	readonly contributions: MarkdownContributions;
}

class VSCodeExtensionMarkdownContributionProvider implements MarkdownContributionProvider {
	private _contributions?: MarkdownContributions;

	public constructor(
		public readonly extensionPath: string,
	) { }

	public get contributions(): MarkdownContributions {
		if (!this._contributions) {
			this._contributions = vscode.extensions.all.reduce(
				(contributions, extension) => MarkdownContributions.merge(contributions, MarkdownContributions.fromExtension(extension)),
				MarkdownContributions.Empty);
		}
		return this._contributions;
	}
}

export function getMarkdownExtensionContributions(context: vscode.ExtensionContext): MarkdownContributionProvider {
	return new VSCodeExtensionMarkdownContributionProvider(context.extensionPath);
}