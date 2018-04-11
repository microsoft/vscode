/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import * as Proto from '../protocol';
import * as typeConverters from '../utils/typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';

export default class TypeScriptFoldingProvider implements vscode.FoldingProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	async provideFoldingRanges(
		document: vscode.TextDocument,
		_context: vscode.FoldingContext,
		token: vscode.CancellationToken
	): Promise<vscode.FoldingRangeList | undefined> {
		if (!this.client.apiVersion.has280Features()) {
			return;
		}

		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return;
		}

		const args: Proto.FileRequestArgs = { file };
		const response: Proto.OutliningSpansResponse = await this.client.execute('getOutliningSpans', args, token);
		if (!response || !response.body) {
			return;
		}

		return new vscode.FoldingRangeList(response.body.map(span => {
			const range = typeConverters.Range.fromTextSpan(span.textSpan);
			// workaround for #47240
			if (range.end.character > 0 && document.getText(new vscode.Range(range.end.translate(0, -1), range.end)) === '}') {
				return new vscode.FoldingRange(range.start.line, Math.max(range.end.line - 1, range.start.line));
			}
			return new vscode.FoldingRange(range.start.line, range.end.line);
		}));
	}
}
