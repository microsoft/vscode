/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getLocation, getNodeValue, parseTree, findNodeAtLocation } from 'jsonc-parser';


export class PackageDocumentL10nSupport implements vscode.DefinitionProvider, vscode.Disposable {

	private readonly _registration: vscode.Disposable;

	constructor() {
		this._registration = vscode.languages.registerDefinitionProvider(
			{ language: 'json', pattern: '**/package.json' },
			this,
		);
	}

	dispose(): void {
		this._registration.dispose();
	}

	public async provideDefinition(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): Promise<vscode.DefinitionLink[] | undefined> {
		const nlsRef = this.getNlsReferenceAtPosition(document, position);
		if (!nlsRef) {
			return undefined;
		}

		const nlsUri = vscode.Uri.joinPath(document.uri, '..', 'package.nls.json');

		try {
			const nlsDoc = await vscode.workspace.openTextDocument(nlsUri);
			const nlsTree = parseTree(nlsDoc.getText());
			if (!nlsTree) {
				return undefined;
			}

			const node = findNodeAtLocation(nlsTree, [nlsRef.key]);
			if (!node) {
				return undefined;
			}

			const targetStart = nlsDoc.positionAt(node.offset);
			const targetEnd = nlsDoc.positionAt(node.offset + node.length);
			return [{
				originSelectionRange: nlsRef.range,
				targetUri: nlsUri,
				targetRange: new vscode.Range(targetStart, targetEnd),
			}];
		} catch {
			return undefined;
		}
	}

	private getNlsReferenceAtPosition(document: vscode.TextDocument, position: vscode.Position): { key: string; range: vscode.Range } | undefined {
		const location = getLocation(document.getText(), document.offsetAt(position));
		if (!location.previousNode || location.previousNode.type !== 'string') {
			return undefined;
		}

		const value = getNodeValue(location.previousNode);
		if (typeof value !== 'string') {
			return undefined;
		}

		const match = value.match(/^%(.+)%$/);
		if (!match) {
			return undefined;
		}

		const nodeStart = document.positionAt(location.previousNode.offset);
		const nodeEnd = document.positionAt(location.previousNode.offset + location.previousNode.length);
		return { key: match[1], range: new vscode.Range(nodeStart, nodeEnd) };
	}
}
