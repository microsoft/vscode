/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
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

export class RStatementRangeProvider implements erdos.StatementRangeProvider {

	private readonly _client: LanguageClient;

	constructor(
		readonly client: LanguageClient,
	) {
		this._client = client;
	}

	async provideStatementRange(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken): Promise<erdos.StatementRange | undefined> {

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
			return { range: range, code: code } as erdos.StatementRange;
		});
	}
}
