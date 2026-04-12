/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../configuration/documentSelector';
import * as Proto from '../tsServer/protocol/protocol';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';

// as we don't do deltas, for performance reasons, don't compute semantic tokens for documents above that limit
const CONTENT_LENGTH_LIMIT = 100000;

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		const provider = new DocumentSemanticTokensProvider(client);
		return vscode.languages.registerDocumentRangeSemanticTokensProvider(selector.semantic, provider, provider.getLegend());
	});
}

class DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider, vscode.DocumentRangeSemanticTokensProvider {

	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public getLegend(): vscode.SemanticTokensLegend {
		return new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);
	}

	public async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens | null> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file || document.getText().length > CONTENT_LENGTH_LIMIT) {
			return null;
		}
		return this.provideSemanticTokens(document, { file, start: 0, length: document.getText().length }, token);
	}

	public async provideDocumentRangeSemanticTokens(document: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): Promise<vscode.SemanticTokens | null> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file || (document.offsetAt(range.end) - document.offsetAt(range.start) > CONTENT_LENGTH_LIMIT)) {
			return null;
		}

		const start = document.offsetAt(range.start);
		const length = document.offsetAt(range.end) - start;
		return this.provideSemanticTokens(document, { file, start, length }, token);
	}

	private async provideSemanticTokens(document: vscode.TextDocument, requestArg: Proto.EncodedSemanticClassificationsRequestArgs, token: vscode.CancellationToken): Promise<vscode.SemanticTokens | null> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return null;
		}

		const versionBeforeRequest = document.version;

		const response = await this.client.execute('encodedSemanticClassifications-full', { ...requestArg, format: '2020' }, token, {
			cancelOnResourceChange: document.uri
		});
		if (response.type !== 'response' || !response.body) {
			return null;
		}

		const versionAfterRequest = document.version;

		if (versionBeforeRequest !== versionAfterRequest) {
			// cannot convert result's offsets to (line;col) values correctly
			// a new request will come in soon...
			//
			// here we cannot return null, because returning null would remove all semantic tokens.
			// we must throw to indicate that the semantic tokens should not be removed.
			// using the string busy here because it is not logged to error telemetry if the error text contains busy.

			// as the new request will come in right after our response, we first wait for the document activity to stop
			await waitForDocumentChangesToEnd(document);

			throw new vscode.CancellationError();
		}

		const tokenSpan = response.body.spans;

		const builder = new vscode.SemanticTokensBuilder();
		for (let i = 0; i < tokenSpan.length;) {
			const offset = tokenSpan[i++];
			const length = tokenSpan[i++];
			const tsClassification = tokenSpan[i++];

			const tokenType = getTokenTypeFromClassification(tsClassification);
			if (tokenType === undefined) {
				continue;
			}

			const tokenModifiers = getTokenModifierFromClassification(tsClassification);

			// we can use the document's range conversion methods because the result is at the same version as the document
			const startPos = document.positionAt(offset);
			const endPos = document.positionAt(offset + length);

			for (let line = startPos.line; line <= endPos.line; line++) {
				const startCharacter = (line === startPos.line ? startPos.character : 0);
				const endCharacter = (line === endPos.line ? endPos.character : document.lineAt(line).text.length);
				builder.push(line, startCharacter, endCharacter - startCharacter, tokenType, tokenModifiers);
			}
		}

		return builder.build();
	}
}

function waitForDocumentChangesToEnd(document: vscode.TextDocument) {
	let version = document.version;
	return new Promise<void>((resolve) => {
		const iv = setInterval(_ => {
			if (document.version === version) {
				clearInterval(iv);
				resolve();
			}
			version = document.version;
		}, 400);
	});
}


// typescript encodes type and modifiers in the classification:
// TSClassification = (TokenType + 1) << 8 + TokenModifier

const enum TokenType {
	class = 0,
	enum = 1,
	interface = 2,
	namespace = 3,
	typeParameter = 4,
	type = 5,
	parameter = 6,
	variable = 7,
	enumMember = 8,
	property = 9,
	function = 10,
	method = 11,
	_ = 12
}

const enum TokenModifier {
	declaration = 0,
	static = 1,
	async = 2,
	readonly = 3,
	defaultLibrary = 4,
	local = 5,
	_ = 6
}

const enum TokenEncodingConsts {
	typeOffset = 8,
	modifierMask = 255
}

function getTokenTypeFromClassification(tsClassification: number): number | undefined {
	if (tsClassification > TokenEncodingConsts.modifierMask) {
		return (tsClassification >> TokenEncodingConsts.typeOffset) - 1;
	}
	return undefined;
}

function getTokenModifierFromClassification(tsClassification: number) {
	return tsClassification & TokenEncodingConsts.modifierMask;
}

const tokenTypes: string[] = [];
tokenTypes[TokenType.class] = 'class';
tokenTypes[TokenType.enum] = 'enum';
tokenTypes[TokenType.interface] = 'interface';
tokenTypes[TokenType.namespace] = 'namespace';
tokenTypes[TokenType.typeParameter] = 'typeParameter';
tokenTypes[TokenType.type] = 'type';
tokenTypes[TokenType.parameter] = 'parameter';
tokenTypes[TokenType.variable] = 'variable';
tokenTypes[TokenType.enumMember] = 'enumMember';
tokenTypes[TokenType.property] = 'property';
tokenTypes[TokenType.function] = 'function';
tokenTypes[TokenType.method] = 'method';

const tokenModifiers: string[] = [];
tokenModifiers[TokenModifier.async] = 'async';
tokenModifiers[TokenModifier.declaration] = 'declaration';
tokenModifiers[TokenModifier.readonly] = 'readonly';
tokenModifiers[TokenModifier.static] = 'static';
tokenModifiers[TokenModifier.local] = 'local';
tokenModifiers[TokenModifier.defaultLibrary] = 'defaultLibrary';
