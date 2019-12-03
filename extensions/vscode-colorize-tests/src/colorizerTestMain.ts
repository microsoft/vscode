/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';

export function activate(context: vscode.ExtensionContext): any {

	const tokenModifiers = ['static', 'abstract', 'deprecated'];
	const tokenTypes = ['strings', 'types', 'structs', 'classes', 'functions', 'variables'];
	const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

	const semanticHighlightProvider: vscode.SemanticTokensProvider = {
		provideSemanticTokens(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
			const builder = new vscode.SemanticTokensBuilder();

			const visitor: jsoncParser.JSONVisitor = {
				onObjectProperty: (property: string, _offset: number, length: number, startLine: number, startCharacter: number) => {
					const [type, ...modifiers] = property.split('.');
					let tokenType = legend.tokenTypes.indexOf(type);
					if (tokenType === -1) {
						tokenType = 0;
					}

					let tokenModifiers = 0;
					for (let i = 0; i < modifiers.length; i++) {
						const index = legend.tokenModifiers.indexOf(modifiers[i]);
						if (index !== -1) {
							tokenModifiers = tokenModifiers | 1 << index;
						}
					}

					builder.push(startLine, startCharacter, length, tokenType, tokenModifiers);
				}
			};
			jsoncParser.visit(document.getText(), visitor);

			return new vscode.SemanticTokens(builder.build());
		}
	};


	context.subscriptions.push(vscode.languages.registerSemanticTokensProvider({ pattern: '**/color-test.json' }, semanticHighlightProvider, legend));

}
