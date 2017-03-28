/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as ts from 'typescript';
import { PackageDocument } from './packageDocumentHelper';

export function activate(context: vscode.ExtensionContext) {
	const registration = vscode.languages.registerDocumentLinkProvider({ language: 'typescript', pattern: '**/vscode.d.ts' }, _linkProvider);
	context.subscriptions.push(registration);

	//package.json suggestions
	context.subscriptions.push(registerPackageDocumentCompletions());
}

const _linkProvider = new class implements vscode.DocumentLinkProvider {

	private _cachedResult: { version: number; links: vscode.DocumentLink[] };
	private _linkPattern = /[^!]\[.*?\]\(#(.*?)\)/g;

	provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.DocumentLink[] {
		const {version} = document;
		if (!this._cachedResult || this._cachedResult.version !== version) {
			const links = this._computeDocumentLinks(document);
			this._cachedResult = { version, links };
		}
		return this._cachedResult.links;
	}

	private _computeDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {

		const results: vscode.DocumentLink[] = [];
		const text = document.getText();
		const lookUp = ast.createNamedNodeLookUp(text);

		this._linkPattern.lastIndex = 0;
		let match: RegExpMatchArray;
		while ((match = this._linkPattern.exec(text))) {

			const offset = lookUp(match[1]);
			if (offset === -1) {
				console.warn(match[1]);
				continue;
			}

			const targetPos = document.positionAt(offset);
			const linkEnd = document.positionAt(this._linkPattern.lastIndex - 1);
			const linkStart = linkEnd.translate({ characterDelta: -(1 + match[1].length) });

			results.push(new vscode.DocumentLink(
				new vscode.Range(linkStart, linkEnd),
				document.uri.with({ fragment: `${1 + targetPos.line}` })));
		}

		return results;
	}
};

namespace ast {

	export interface NamedNodeLookUp {
		(dottedName: string): number;
	}

	export function createNamedNodeLookUp(str: string): NamedNodeLookUp {

		const sourceFile = ts.createSourceFile('fake.d.ts', str, ts.ScriptTarget.Latest);

		const identifiers: string[] = [];
		const spans: number[] = [];

		ts.forEachChild(sourceFile, function visit(node: ts.Node) {
			const declIdent = (<ts.Declaration>node).name;
			if (declIdent && declIdent.kind === ts.SyntaxKind.Identifier) {
				identifiers.push((<ts.Identifier>declIdent).text);
				spans.push(node.pos, node.end);
			}
			ts.forEachChild(node, visit);
		});

		return function (dottedName: string): number {
			let start = -1;
			let end = Number.MAX_VALUE;

			for (let name of dottedName.split('.')) {
				let idx: number = -1;
				while ((idx = identifiers.indexOf(name, idx + 1)) >= 0) {
					let myStart = spans[2 * idx];
					let myEnd = spans[2 * idx + 1];
					if (myStart >= start && myEnd <= end) {
						start = myStart;
						end = myEnd;
						break;
					}
				}
				if (idx < 0) {
					return -1;
				}
			}
			return start;
		};
	}
}

function registerPackageDocumentCompletions(): vscode.Disposable {
	return vscode.languages.registerCompletionItemProvider({ language: 'json', pattern: '**/package.json' }, {
		provideCompletionItems(document, position, token) {
			return new PackageDocument(document).provideCompletionItems(position, token);
		}
	});
}