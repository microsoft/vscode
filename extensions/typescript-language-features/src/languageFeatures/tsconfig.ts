/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jsonc from 'jsonc-parser';
import { basename, posix } from 'path';
import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
import { coalesce } from '../utils/arrays';
import { exists, looksLikeAbsoluteWindowsPath } from '../utils/fs';

function mapChildren<R>(node: jsonc.Node | undefined, f: (x: jsonc.Node) => R): R[] {
	return node && node.type === 'array' && node.children
		? node.children.map(f)
		: [];
}

const openExtendsLinkCommandId = '_typescript.openExtendsLink';
type OpenExtendsLinkCommandArgs = {
	readonly resourceUri: vscode.Uri;
	readonly extendsValue: string;
};


class TsconfigLinkProvider implements vscode.DocumentLinkProvider {

	public provideDocumentLinks(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): vscode.DocumentLink[] {
		const root = jsonc.parseTree(document.getText());
		if (!root) {
			return [];
		}

		return coalesce([
			this.getExtendsLink(document, root),
			...this.getFilesLinks(document, root),
			...this.getReferencesLinks(document, root)
		]);
	}

	private getExtendsLink(document: vscode.TextDocument, root: jsonc.Node): vscode.DocumentLink | undefined {
		const extendsNode = jsonc.findNodeAtLocation(root, ['extends']);
		if (!this.isPathValue(extendsNode)) {
			return undefined;
		}

		const extendsValue: string = extendsNode.value;
		const args: OpenExtendsLinkCommandArgs = {
			resourceUri: { ...document.uri.toJSON(), $mid: undefined }, // Prevent VS Code from trying to transform the uri
			extendsValue: extendsValue
		};

		const link = new vscode.DocumentLink(
			this.getRange(document, extendsNode),
			vscode.Uri.parse(`command:${openExtendsLinkCommandId}?${JSON.stringify(args)}`));
		link.tooltip = vscode.l10n.t("Follow link");
		return link;
	}

	private getFilesLinks(document: vscode.TextDocument, root: jsonc.Node) {
		return mapChildren(
			jsonc.findNodeAtLocation(root, ['files']),
			child => this.pathNodeToLink(document, child));
	}

	private getReferencesLinks(document: vscode.TextDocument, root: jsonc.Node) {
		return mapChildren(
			jsonc.findNodeAtLocation(root, ['references']),
			child => {
				const pathNode = jsonc.findNodeAtLocation(child, ['path']);
				if (!this.isPathValue(pathNode)) {
					return undefined;
				}

				return new vscode.DocumentLink(this.getRange(document, pathNode),
					basename(pathNode.value).endsWith('.json')
						? this.getFileTarget(document, pathNode)
						: this.getFolderTarget(document, pathNode));
			});
	}

	private pathNodeToLink(
		document: vscode.TextDocument,
		node: jsonc.Node | undefined
	): vscode.DocumentLink | undefined {
		return this.isPathValue(node)
			? new vscode.DocumentLink(this.getRange(document, node), this.getFileTarget(document, node))
			: undefined;
	}

	private isPathValue(extendsNode: jsonc.Node | undefined): extendsNode is jsonc.Node {
		return extendsNode
			&& extendsNode.type === 'string'
			&& extendsNode.value
			&& !(extendsNode.value as string).includes('*'); // don't treat globs as links.
	}

	private getFileTarget(document: vscode.TextDocument, node: jsonc.Node): vscode.Uri {
		return vscode.Uri.joinPath(Utils.dirname(document.uri), node.value);
	}

	private getFolderTarget(document: vscode.TextDocument, node: jsonc.Node): vscode.Uri {
		return vscode.Uri.joinPath(Utils.dirname(document.uri), node.value, 'tsconfig.json');
	}

	private getRange(document: vscode.TextDocument, node: jsonc.Node) {
		const offset = node.offset;
		const start = document.positionAt(offset + 1);
		const end = document.positionAt(offset + (node.length - 1));
		return new vscode.Range(start, end);
	}
}

async function resolveNodeModulesPath(baseDirUri: vscode.Uri, pathCandidates: string[]): Promise<vscode.Uri | undefined> {
	let currentUri = baseDirUri;
	const baseCandidate = pathCandidates[0];
	const sepIndex = baseCandidate.startsWith('@') ? 2 : 1;
	const moduleBasePath = baseCandidate.split(posix.sep).slice(0, sepIndex).join(posix.sep);
	while (true) {
		const moduleAbsoluteUrl = vscode.Uri.joinPath(currentUri, 'node_modules', moduleBasePath);
		let moduleStat: vscode.FileStat | undefined;
		try {
			moduleStat = await vscode.workspace.fs.stat(moduleAbsoluteUrl);
		} catch (err) {
			// noop
		}

		if (moduleStat && (moduleStat.type & vscode.FileType.Directory)) {
			for (const uriCandidate of pathCandidates
				.map((relativePath) => relativePath.split(posix.sep).slice(sepIndex).join(posix.sep))
				// skip empty paths within module
				.filter(Boolean)
				.map((relativeModulePath) => vscode.Uri.joinPath(moduleAbsoluteUrl, relativeModulePath))
			) {
				if (await exists(uriCandidate)) {
					return uriCandidate;
				}
			}
			// Continue to looking for potentially another version
		}

		const oldUri = currentUri;
		currentUri = vscode.Uri.joinPath(currentUri, '..');

		// Can't go next. Reached the system root
		if (oldUri.path === currentUri.path) {
			return;
		}
	}
}

// Reference: https://github.com/microsoft/TypeScript/blob/febfd442cdba343771f478cf433b0892f213ad2f/src/compiler/commandLineParser.ts#L3005
/**
* @returns Returns undefined in case of lack of result while trying to resolve from node_modules
*/
async function getTsconfigPath(baseDirUri: vscode.Uri, extendsValue: string): Promise<vscode.Uri | undefined> {
	async function resolve(absolutePath: vscode.Uri): Promise<vscode.Uri> {
		if (absolutePath.path.endsWith('.json') || await exists(absolutePath)) {
			return absolutePath;
		}
		return absolutePath.with({
			path: `${absolutePath.path}.json`
		});
	}

	const isRelativePath = ['./', '../'].some(str => extendsValue.startsWith(str));
	if (isRelativePath) {
		return resolve(vscode.Uri.joinPath(baseDirUri, extendsValue));
	}

	if (extendsValue.startsWith('/') || looksLikeAbsoluteWindowsPath(extendsValue)) {
		return resolve(vscode.Uri.file(extendsValue));
	}

	// Otherwise resolve like a module
	return resolveNodeModulesPath(baseDirUri, [
		extendsValue,
		...extendsValue.endsWith('.json') ? [] : [
			`${extendsValue}.json`,
			`${extendsValue}/tsconfig.json`,
		]
	]);
}

export function register() {
	const patterns: vscode.GlobPattern[] = [
		'**/[jt]sconfig.json',
		'**/[jt]sconfig.*.json',
	];

	const languages = ['json', 'jsonc'];

	const selector: vscode.DocumentSelector =
		languages.map(language => patterns.map((pattern): vscode.DocumentFilter => ({ language, pattern })))
			.flat();

	return vscode.Disposable.from(
		vscode.commands.registerCommand(openExtendsLinkCommandId, async ({ resourceUri, extendsValue, }: OpenExtendsLinkCommandArgs) => {
			const tsconfigPath = await getTsconfigPath(Utils.dirname(vscode.Uri.from(resourceUri)), extendsValue);
			if (tsconfigPath === undefined) {
				vscode.window.showErrorMessage(vscode.l10n.t("Failed to resolve {0} as module", extendsValue));
				return;
			}
			// Will suggest to create a .json variant if it doesn't exist yet (but only for relative paths)
			await vscode.commands.executeCommand('vscode.open', tsconfigPath);
		}),
		vscode.languages.registerDocumentLinkProvider(selector, new TsconfigLinkProvider()),
	);
}
