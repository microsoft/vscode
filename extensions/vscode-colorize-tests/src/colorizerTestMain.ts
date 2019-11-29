/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';

export function activate(context: vscode.ExtensionContext): any {

	const tokenModifiers = ['static', 'abstract', 'deprecated'];
	const tokenTypes = ['strings', 'types', 'structs', 'classes', 'functions', 'variables'];
	const legend = new vscode.SemanticColoringLegend(tokenTypes, tokenModifiers);

	/*
	* A certain token (at index `i` is encoded using 5 uint32 integers):
	*  - at index `5*i`   - `deltaLine`: token line number, relative to `SemanticColoringArea.line`
	*  - at index `5*i+1` - `startCharacter`: token start character offset inside the line (inclusive)
	*  - at index `5*i+2` - `endCharacter`: token end character offset inside the line (exclusive)
	*  - at index `5*i+3` - `tokenType`: will be looked up in `SemanticColoringLegend.tokenTypes`
	*  - at index `5*i+4` - `tokenModifiers`: each set bit will be looked up in `SemanticColoringLegend.tokenModifiers`
	*/

	const semanticHighlightProvider: vscode.SemanticColoringProvider = {
		provideSemanticColoring(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticColoring> {
			const result: number[] = [];

			const visitor: jsoncParser.JSONVisitor = {
				onObjectProperty: (property: string, _offset: number, length: number, startLine: number, startCharacter: number) => {
					result.push(startLine);
					result.push(startCharacter);
					result.push(startCharacter + length);


					const [type, ...modifiers] = property.split('.');
					let tokenType = legend.tokenTypes.indexOf(type);
					if (tokenType === -1) {
						tokenType = 0;
					}
					result.push(tokenType);

					let tokenModifiers = 0;
					for (let i = 0; i < modifiers.length; i++) {
						const index = legend.tokenModifiers.indexOf(modifiers[i]);
						if (index !== -1) {
							tokenModifiers = tokenModifiers | 1 << index;
						}
					}
					result.push(tokenModifiers);
				}
			};
			jsoncParser.visit(document.getText(), visitor);
			return new vscode.SemanticColoring([new vscode.SemanticColoringArea(0, new Uint32Array(result))]);
		}
	};


	context.subscriptions.push(vscode.languages.registerSemanticColoringProvider({ pattern: '**/color-test.json' }, semanticHighlightProvider, legend));

}
