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

class SemanticTokensProvider implements vscode.SemanticTokensProvider {

	constructor(
		private readonly client: ITypeScriptServiceClient
	) {
	}

	getLegend(): vscode.SemanticTokensLegend {
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

		return new vscode.SemanticTokensLegend(tokens, []);
	}

	async provideSemanticTokens(document: vscode.TextDocument, _options: vscode.SemanticTokensRequestOptions, token: vscode.CancellationToken): Promise<vscode.SemanticTokens | null> {

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

		const builder = new vscode.SemanticTokensBuilder();

		const tsTokens = response.body.spans;
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
				builder.push(line, startCharacter, endCharacter - startCharacter, tokenType, 0);
			}
		}

		// pretend computation took a long time...
		await timeout(0);

		return new vscode.SemanticTokens(builder.build());
	}

}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient
) {
	const provider = new SemanticTokensProvider(client);
	return vscode.languages.registerSemanticTokensProvider(selector, provider, provider.getLegend());
}
