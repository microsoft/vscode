/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CancellationToken, LanguageClient, Position, Range, RequestType, VersionedTextDocumentIdentifier } from 'vscode-languageclient/node';

interface StatementRangeParams {
	textDocument: VersionedTextDocumentIdentifier;
	position: Position;
}

interface StatementRangeResponse {
	range: Range;
	code?: string;
}

export namespace StatementRangeRequest {
	export const type: RequestType<StatementRangeParams, StatementRangeResponse | undefined, any> = new RequestType('erdos/textDocument/statementRange');
}

export interface StatementRange {
	range: vscode.Range;
	code?: string;
}

export class RStatementRangeProvider implements vscode.DocumentRangeFormattingEditProvider {

	private readonly _client: LanguageClient;

	constructor(
		readonly client: LanguageClient,
	) {
		this._client = client;
	}

	async provideDocumentRangeFormattingEdits(
		document: vscode.TextDocument,
		range: vscode.Range,
		options: vscode.FormattingOptions,
		token: vscode.CancellationToken): Promise<vscode.TextEdit[] | undefined> {

		const position = range.start;
		const statementRange = await this.provideStatementRange(document, position, token);
		if (!statementRange) {
			return undefined;
		}

		return [];
	}

	async provideStatementRange(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken): Promise<StatementRange | undefined> {

		const params: StatementRangeParams = {
			textDocument: this._client.code2ProtocolConverter.asVersionedTextDocumentIdentifier(document),
			position: this._client.code2ProtocolConverter.asPosition(position)
		};

		const response = this._client.sendRequest(StatementRangeRequest.type, params, token);

		return response.then(data => {
			if (!data) {
				return undefined;
			}
			const range = this._client.protocol2CodeConverter.asRange(data.range);
			const code = typeof data.code === 'string' ? data.code : undefined;
			return { range: range, code: code } as StatementRange;
		});
	}
}
