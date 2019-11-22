/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITypeScriptServiceClient, ExperimentalProtocol } from '../typescriptService';

function timeout(time: number): Promise<void> {
	return new Promise((resolve, _reject) => {
		setTimeout(resolve, time);
	});
}

class SemanticColoringProvider implements vscode.SemanticColoringProvider {

	constructor(
		private readonly client: ITypeScriptServiceClient
	) {
	}

	getLegend(): vscode.SemanticColoringLegend {
		const tokens: string[] = [];

		tokens[ExperimentalProtocol.ClassificationType.comment] = 'comments'; // ok
		tokens[ExperimentalProtocol.ClassificationType.identifier] = 'variables'; // ok
		tokens[ExperimentalProtocol.ClassificationType.keyword] = 'keywords'; // ok
		tokens[ExperimentalProtocol.ClassificationType.numericLiteral] = 'numbers'; // ok
		tokens[ExperimentalProtocol.ClassificationType.operator] = 'operators'; // ok
		tokens[ExperimentalProtocol.ClassificationType.stringLiteral] = 'strings'; // ok
		tokens[ExperimentalProtocol.ClassificationType.regularExpressionLiteral] = 'regexp'; // ok
		tokens[ExperimentalProtocol.ClassificationType.whiteSpace] = '';
		tokens[ExperimentalProtocol.ClassificationType.text] = '';
		tokens[ExperimentalProtocol.ClassificationType.punctuation] = '';
		tokens[ExperimentalProtocol.ClassificationType.className] = 'classes'; // ok
		tokens[ExperimentalProtocol.ClassificationType.enumName] = 'enums'; // ok
		tokens[ExperimentalProtocol.ClassificationType.interfaceName] = 'interfaces'; // ok
		tokens[ExperimentalProtocol.ClassificationType.moduleName] = 'types'; // not ideal
		tokens[ExperimentalProtocol.ClassificationType.typeParameterName] = 'parameterTypes'; // ok
		tokens[ExperimentalProtocol.ClassificationType.typeAliasName] = 'types'; // not ideal
		tokens[ExperimentalProtocol.ClassificationType.parameterName] = 'parameters'; // ok
		tokens[ExperimentalProtocol.ClassificationType.docCommentTagName] = '';
		tokens[ExperimentalProtocol.ClassificationType.jsxOpenTagName] = '';
		tokens[ExperimentalProtocol.ClassificationType.jsxCloseTagName] = '';
		tokens[ExperimentalProtocol.ClassificationType.jsxSelfClosingTagName] = '';
		tokens[ExperimentalProtocol.ClassificationType.jsxAttribute] = '';
		tokens[ExperimentalProtocol.ClassificationType.jsxText] = '';
		tokens[ExperimentalProtocol.ClassificationType.jsxAttributeStringLiteralValue] = '';
		tokens[ExperimentalProtocol.ClassificationType.bigintLiteral] = 'numbers';

		return new vscode.SemanticColoringLegend(tokens, []);
	}

	async provideSemanticColoring(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticColoring | null> {

		const file = this.client.toOpenedFilePath(document);
		if (!file) {
			return null;
		}

		const args: ExperimentalProtocol.EncodedSemanticClassificationsRequestArgs = {
			file: file,
			start: 0,
			length: document.getText().length,
		};

		const versionBeforeRequest = document.version;
		const response = await this.client.execute('encodedSemanticClassifications-full', args, token);
		const versionAfterRequest = document.version;

		if (versionBeforeRequest !== versionAfterRequest) {
			// A new request will come in soon...
			return null;
		}

		if (response.type !== 'response') {
			return null;
		}
		if (!response.body) {
			return null;
		}

		const tsTokens = response.body.spans;

		let result: number[] = [];
		let resultLen = 0;
		const pushResultToken = (line: number, startCharacter: number, endCharacter: number, tokenType: number): void => {
			result[resultLen++] = line;
			result[resultLen++] = startCharacter;
			result[resultLen++] = endCharacter;
			result[resultLen++] = tokenType;
			result[resultLen++] = 0;
		};

		for (let i = 0, len = Math.floor(tsTokens.length / 3); i < len; i++) {
			const offset = tsTokens[3 * i];
			const length = tsTokens[3 * i + 1];
			const tokenType = tsTokens[3 * i + 2];

			// we can use the document's range conversion methods because
			// the result is at the same version as the document
			const startPos = document.positionAt(offset);
			const endPos = document.positionAt(offset + length);

			for (let line = startPos.line; line <= endPos.line; line++) {
				const startCharacter = (line === startPos.line ? startPos.character : 0);
				const endCharacter = (line === endPos.line ? endPos.character : document.lineAt(line).text.length);
				pushResultToken(line, startCharacter, endCharacter, tokenType);
			}
		}

		// pretend computation took a long time...
		await timeout(0);

		return new vscode.SemanticColoring([new vscode.SemanticColoringArea(0, new Uint32Array(result))]);
	}

}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient
) {
	const provider = new SemanticColoringProvider(client);
	return vscode.languages.registerSemanticColoringProvider(selector, provider, provider.getLegend());
}
