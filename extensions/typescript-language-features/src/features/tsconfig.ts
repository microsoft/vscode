/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jsonc from 'jsonc-parser';
import * as vscode from 'vscode';
import { join, dirname } from 'path';

class TsconfigLinkProvider implements vscode.DocumentLinkProvider {

	public provideDocumentLinks(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.DocumentLink[]> {
		const root = jsonc.parseTree(document.getText());
		if (!root) {
			return null;
		}

		return this.getNodes(root).map(node =>
			new vscode.DocumentLink(
				this.getRange(document, node),
				this.getTarget(document, node)));
	}

	private getNodes(root: jsonc.Node): ReadonlyArray<jsonc.Node> {
		const nodes: jsonc.Node[] = [];
		const extendsNode = jsonc.findNodeAtLocation(root, ['extends']);
		if (this.isPathValue(extendsNode)) {
			nodes.push(extendsNode);
		}

		const referencesNode = jsonc.findNodeAtLocation(root, ['references']);
		if (referencesNode && referencesNode.type === 'array' && referencesNode.children) {
			for (const child of referencesNode.children) {
				const path = jsonc.findNodeAtLocation(child, ['path']);
				if (this.isPathValue(path)) {
					nodes.push(path);
				}
			}
		}

		return nodes;
	}

	private isPathValue(extendsNode: jsonc.Node | undefined): extendsNode is jsonc.Node {
		return extendsNode && extendsNode.type === 'string' && extendsNode.value;
	}

	private getTarget(document: vscode.TextDocument, node: jsonc.Node): vscode.Uri {
		return vscode.Uri.file(join(dirname(document.uri.fsPath), node!.value));
	}

	private getRange(document: vscode.TextDocument, node: jsonc.Node) {
		const offset = node!.offset;
		const start = document.positionAt(offset + 1);
		const end = document.positionAt(offset + (node!.length - 1));
		return new vscode.Range(start, end);
	}
}

export function register() {
	const patterns: vscode.GlobPattern[] = [
		'**/[jt]sconfig.json',
		'**/[jt]sconfig.*.json',
	];

	const selector: vscode.DocumentSelector = patterns.map((pattern): vscode.DocumentFilter => ({
		language: 'jsonc',
		pattern: pattern
	}));
	return vscode.languages.registerDocumentLinkProvider(selector, new TsconfigLinkProvider());
}
