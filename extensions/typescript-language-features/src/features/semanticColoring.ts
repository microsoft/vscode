/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITypeScriptServiceClient, ExperimentalProtocol } from '../typescriptService';

class SemanticColoringProvider implements vscode.SemanticColoringProvider {

	constructor(
		private readonly client: ITypeScriptServiceClient
	) {
	}

	getLegend(): vscode.SemanticColoringLegend {
		const tokens: string[] = [];

		tokens[ExperimentalProtocol.ClassificationType.comment] = 'comment'; // ok
		tokens[ExperimentalProtocol.ClassificationType.identifier] = 'identifier';
		tokens[ExperimentalProtocol.ClassificationType.keyword] = 'keyword';
		tokens[ExperimentalProtocol.ClassificationType.numericLiteral] = 'numericLiteral';
		tokens[ExperimentalProtocol.ClassificationType.operator] = 'operator';
		tokens[ExperimentalProtocol.ClassificationType.stringLiteral] = 'stringLiteral';
		tokens[ExperimentalProtocol.ClassificationType.regularExpressionLiteral] = 'regularExpressionLiteral';
		tokens[ExperimentalProtocol.ClassificationType.whiteSpace] = 'whiteSpace';
		tokens[ExperimentalProtocol.ClassificationType.text] = 'text';
		tokens[ExperimentalProtocol.ClassificationType.punctuation] = 'punctuation';
		tokens[ExperimentalProtocol.ClassificationType.className] = 'class'; // ok
		tokens[ExperimentalProtocol.ClassificationType.enumName] = 'enum'; // ok
		tokens[ExperimentalProtocol.ClassificationType.interfaceName] = 'interface'; // ok
		tokens[ExperimentalProtocol.ClassificationType.moduleName] = 'moduleName';
		tokens[ExperimentalProtocol.ClassificationType.typeParameterName] = 'parameterType'; // ok
		tokens[ExperimentalProtocol.ClassificationType.typeAliasName] = 'typeAliasName';
		tokens[ExperimentalProtocol.ClassificationType.parameterName] = 'parameter'; // ok
		tokens[ExperimentalProtocol.ClassificationType.docCommentTagName] = 'docCommentTagName';
		tokens[ExperimentalProtocol.ClassificationType.jsxOpenTagName] = 'jsxOpenTagName';
		tokens[ExperimentalProtocol.ClassificationType.jsxCloseTagName] = 'jsxCloseTagName';
		tokens[ExperimentalProtocol.ClassificationType.jsxSelfClosingTagName] = 'jsxSelfClosingTagName';
		tokens[ExperimentalProtocol.ClassificationType.jsxAttribute] = 'jsxAttribute';
		tokens[ExperimentalProtocol.ClassificationType.jsxText] = 'jsxText';
		tokens[ExperimentalProtocol.ClassificationType.jsxAttributeStringLiteralValue] = 'jsxAttributeStringLiteralValue';
		tokens[ExperimentalProtocol.ClassificationType.bigintLiteral] = 'bigintLiteral';

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

		console.log(result);
		return new vscode.SemanticColoring([new vscode.SemanticColoringArea(0, new Uint32Array(result))]);
	}

}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient
) {
	const provider = new SemanticColoringProvider(client);


	const run = async () => {
		const ed = vscode.window.activeTextEditor;
		if (!ed) {
			return;
		}
		// const doc = ed.document;
		const cancellationTokenSource = new vscode.CancellationTokenSource();
		provider.provideSemanticColoring(ed.document, cancellationTokenSource.token);
		// const file = client.toOpenedFilePath(doc);
		// if (!file) {
		// 	return;
		// }
		// const args: ExperimentalProtocol.EncodedSemanticClassificationsRequestArgs = {
		// 	file: file,
		// 	start: 0,
		// 	length: doc.getText().length,
		// };

		// const response = await client.execute('encodedSemanticClassifications-full', args, cancellationTokenSource.token);

		// if (response.type !== 'response') {
		// 	return;
		// }
		// if (!response.body) {
		// 	return;
		// }
		// console.log(response.body);
	};

	vscode.window.onDidChangeActiveTextEditor(run);
	run();

	console.log(`I am running...`);

	// return vscode.Disposable.from();
	// return vscode.languages.registerRenameProvider(selector,
	// 	new TypeScriptRenameProvider(client, fileConfigurationManager));

	return vscode.languages.registerSemanticColoringProvider(selector, provider);
	// return vscode.languages.registerSemanticColoringProvider(selector, )
}
