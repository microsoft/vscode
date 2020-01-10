/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITypeScriptServiceClient, ExecConfig, ServerResponse } from '../typescriptService';
import * as Proto from '../protocol';

export function register(selector: vscode.DocumentSelector, client: ITypeScriptServiceClient) {
	const provider = new SemanticTokensProvider(client);
	return vscode.languages.registerSemanticTokensProvider(selector, provider, provider.getLegend());

}

/*
 * Prototype of a SemanticTokensProvider, relying on the experimental `encodedSemanticClassifications-full` request from the TypeScript server.
 * As the results retured by the TypeScript server are limited, we also add a Typescript plugin (typescript-vscode-sh-plugin) to enrich the returned token.
 */
class SemanticTokensProvider implements vscode.SemanticTokensProvider {

	constructor(private readonly client: ITypeScriptServiceClient) {
	}

	getLegend(): vscode.SemanticTokensLegend {
		const tokenTypes = [];
		for (let i = 0; i < TokenType._sentinel; i++) {
			tokenTypes.push(TokenType[i]);
		}
		const tokenModifiers = [];
		for (let i = 0; i < TokenModifier._sentinel; i++) {
			tokenModifiers.push(TokenModifier[i]);
		}
		return new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);
	}

	async provideSemanticTokens(document: vscode.TextDocument, _options: vscode.SemanticTokensRequestOptions, token: vscode.CancellationToken): Promise<vscode.SemanticTokens | null> {
		const file = this.client.toOpenedFilePath(document);
		if (!file) {
			return null;
		}

		const versionBeforeRequest = document.version;

		const allTokenSpans: number[][] = [];

		let requestArgs: ExperimentalProtocol.EncodedSemanticClassificationsRequestArgs[] = [];
		if (_options.ranges) {
			requestArgs = _options.ranges.map(r => { const start = document.offsetAt(r.start); const length = document.offsetAt(r.end) - start; return { file, start, length }; });
			requestArgs = requestArgs.sort((a1, a2) => a1.start - a2.start);
		} else {
			requestArgs = [{ file, start: 0, length: document.getText().length }]; // full file
		}
		for (const requestArg of requestArgs) {
			const response = await (this.client as ExperimentalProtocol.IExtendedTypeScriptServiceClient).execute('encodedSemanticClassifications-full', requestArg, token);
			if (response.type === 'response' && response.body) {
				allTokenSpans.push(response.body.spans);
			} else {
				return null;
			}
		}

		const versionAfterRequest = document.version;
		if (versionBeforeRequest !== versionAfterRequest) {
			// A new request will come in soon...
			return null;
		}

		const builder = new vscode.SemanticTokensBuilder();
		for (const tokenSpan of allTokenSpans) {
			for (let i = 0, len = Math.floor(tokenSpan.length / 3); i < len; i++) {

				const tsClassification = tokenSpan[3 * i + 2];
				let tokenType = 0;
				let tokenModifiers = 0;
				if (tsClassification >= 0x100) {
					// exendend classifications as returned by the typescript-vscode-sh-plugin
					tokenType = (tsClassification >> 8) - 1;
					tokenModifiers = tsClassification & 0xFF;
				} else {
					tokenType = tokenTypeMap[tsClassification];
					if (tokenType === undefined) {
						continue;
					}
				}

				const offset = tokenSpan[3 * i];
				const length = tokenSpan[3 * i + 1];

				// we can use the document's range conversion methods because the result is at the same version as the document
				const startPos = document.positionAt(offset);
				const endPos = document.positionAt(offset + length);

				for (let line = startPos.line; line <= endPos.line; line++) {
					const startCharacter = (line === startPos.line ? startPos.character : 0);
					const endCharacter = (line === endPos.line ? endPos.character : document.lineAt(line).text.length);
					builder.push(line, startCharacter, endCharacter - startCharacter, tokenType, tokenModifiers);
				}
			}
		}
		return new vscode.SemanticTokens(builder.build());
	}
}

enum TokenType {
	'class',
	'enum',
	'interface',
	'namespace',
	'typeParameter',
	'type',
	'parameter',
	'variable',
	'property',
	'constant',
	'function',
	'member',
	_sentinel
}

enum TokenModifier {
	'declaration',
	'static',
	'async',
	_sentinel
}

// mapping for the original ExperimentalProtocol.ClassificationType from TypeScript (only used when plugin is not available)

const tokenTypeMap: number[] = [];
tokenTypeMap[ExperimentalProtocol.ClassificationType.className] = TokenType.class;
tokenTypeMap[ExperimentalProtocol.ClassificationType.enumName] = TokenType.enum;
tokenTypeMap[ExperimentalProtocol.ClassificationType.interfaceName] = TokenType.interface;
tokenTypeMap[ExperimentalProtocol.ClassificationType.moduleName] = TokenType.namespace;
tokenTypeMap[ExperimentalProtocol.ClassificationType.typeParameterName] = TokenType.typeParameter;
tokenTypeMap[ExperimentalProtocol.ClassificationType.typeAliasName] = TokenType.type;
tokenTypeMap[ExperimentalProtocol.ClassificationType.parameterName] = TokenType.parameter;

export namespace ExperimentalProtocol {

	export interface IExtendedTypeScriptServiceClient {
		execute<K extends keyof ExperimentalProtocol.ExtendedTsServerRequests>(
			command: K,
			args: ExperimentalProtocol.ExtendedTsServerRequests[K][0],
			token: vscode.CancellationToken,
			config?: ExecConfig
		): Promise<ServerResponse.Response<ExperimentalProtocol.ExtendedTsServerRequests[K][1]>>;
	}

	/**
	 * A request to get encoded semantic classifications for a span in the file
	 */
	export interface EncodedSemanticClassificationsRequest extends Proto.FileRequest {
		arguments: EncodedSemanticClassificationsRequestArgs;
	}

	/**
	 * Arguments for EncodedSemanticClassificationsRequest request.
	 */
	export interface EncodedSemanticClassificationsRequestArgs extends Proto.FileRequestArgs {
		/**
		 * Start position of the span.
		 */
		start: number;
		/**
		 * Length of the span.
		 */
		length: number;
	}

	export const enum EndOfLineState {
		None,
		InMultiLineCommentTrivia,
		InSingleQuoteStringLiteral,
		InDoubleQuoteStringLiteral,
		InTemplateHeadOrNoSubstitutionTemplate,
		InTemplateMiddleOrTail,
		InTemplateSubstitutionPosition,
	}

	export const enum ClassificationType {
		comment = 1,
		identifier = 2,
		keyword = 3,
		numericLiteral = 4,
		operator = 5,
		stringLiteral = 6,
		regularExpressionLiteral = 7,
		whiteSpace = 8,
		text = 9,
		punctuation = 10,
		className = 11,
		enumName = 12,
		interfaceName = 13,
		moduleName = 14,
		typeParameterName = 15,
		typeAliasName = 16,
		parameterName = 17,
		docCommentTagName = 18,
		jsxOpenTagName = 19,
		jsxCloseTagName = 20,
		jsxSelfClosingTagName = 21,
		jsxAttribute = 22,
		jsxText = 23,
		jsxAttributeStringLiteralValue = 24,
		bigintLiteral = 25,
	}

	export interface EncodedSemanticClassificationsResponse extends Proto.Response {
		body?: {
			endOfLineState: EndOfLineState;
			spans: number[];
		};
	}

	export interface ExtendedTsServerRequests {
		'encodedSemanticClassifications-full': [ExperimentalProtocol.EncodedSemanticClassificationsRequestArgs, ExperimentalProtocol.EncodedSemanticClassificationsResponse];
	}
}
