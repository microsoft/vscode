/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {CancellationToken, CodeLens, SymbolKind, Range, Uri, TextDocument, CodeLensProvider, Position} from 'vscode';
import {createRequest, toRange, toLocation} from '../typeConvertion';
import AbstractSupport from './abstractProvider';
import * as proto from '../protocol';

class OmniSharpCodeLens extends CodeLens {

	fileName: string;

	constructor(fileName: string, range: Range) {
		super(range);
		this.fileName = fileName;
	}
}

export default class OmniSharpCodeLensProvider extends AbstractSupport implements CodeLensProvider {

	private static filteredSymbolNames: { [name: string]: boolean } = {
		'Equals': true,
		'Finalize': true,
		'GetHashCode': true,
		'ToString': true
	};

	provideCodeLenses(document: TextDocument, token: CancellationToken): CodeLens[] | Thenable<CodeLens[]> {

		return this._server.makeRequest<proto.CurrentFileMembersAsTreeResponse>(proto.CurrentFileMembersAsTree, {
			Filename: document.fileName
		}, token).then(tree => {
			var ret: CodeLens[] = [];
			tree.TopLevelTypeDefinitions.forEach(node => OmniSharpCodeLensProvider._convertQuickFix(ret, document.fileName, node));
			return ret;
		});
	}

	private static _convertQuickFix(bucket: CodeLens[], fileName:string, node: proto.Node): void {

		if (node.Kind === 'MethodDeclaration' && OmniSharpCodeLensProvider.filteredSymbolNames[node.Location.Text]) {
			return;
		}

		let lens = new OmniSharpCodeLens(fileName, toRange(node.Location));
		bucket.push(lens);

		for (let child of node.ChildNodes) {
			OmniSharpCodeLensProvider._convertQuickFix(bucket, fileName, child);
		}
	}

	resolveCodeLens(codeLens: CodeLens, token: CancellationToken): Thenable<CodeLens> {
		if (codeLens instanceof OmniSharpCodeLens) {

			let req = <proto.FindUsagesRequest>{
				Filename: codeLens.fileName,
				Line: codeLens.range.start.line + 1,
				Column: codeLens.range.start.character + 1,
				OnlyThisFile: false,
				ExcludeDefinition: true
			};

			return this._server.makeRequest<proto.QuickFixResponse>(proto.FindUsages, req, token).then(res => {
				if (!res || !Array.isArray(res.QuickFixes)) {
					return;
				}
				let len = res.QuickFixes.length;
				codeLens.command = {
					title: len === 1 ? '1 reference' : `${len} references`,
					command: 'editor.action.showReferences',
					arguments: [Uri.file(req.Filename), codeLens.range.start, res.QuickFixes.map(toLocation)]
				};

				return codeLens;
			});
		}
	}
}
