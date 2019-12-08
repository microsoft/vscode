/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';

export function activate(context: vscode.ExtensionContext): any {

	const tokenTypes = ['type', 'struct', 'class', 'interface', 'enum', 'parameterType', 'function', 'variable'];
	const tokenModifiers = ['static', 'abstract', 'deprecated', 'declaration', 'documentation', 'member', 'async'];

	const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

	const semanticHighlightProvider: vscode.SemanticTokensProvider = {
		provideSemanticTokens(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
			const builder = new vscode.SemanticTokensBuilder();

			function addToken(value: string, startLine: number, startCharacter: number, length: number) {
				const [type, ...modifiers] = value.split('.');

				let tokenType = legend.tokenTypes.indexOf(type);
				if (tokenType === -1) {
					return;
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

			const visitor: jsoncParser.JSONVisitor = {
				onObjectProperty: (property: string, _offset: number, _length: number, startLine: number, startCharacter: number) => {
					addToken(property, startLine, startCharacter, property.length + 2);
				},
				onLiteralValue: (value: any, _offset: number, length: number, startLine: number, startCharacter: number) => {
					if (typeof value === 'string') {
						addToken(value, startLine, startCharacter, length);
					}
				}
			};
			jsoncParser.visit(document.getText(), visitor);

			return new vscode.SemanticTokens(builder.build());
		}
	};


	context.subscriptions.push(vscode.languages.registerSemanticTokensProvider({ pattern: '**/*semantic-test.json' }, semanticHighlightProvider, legend));

}
