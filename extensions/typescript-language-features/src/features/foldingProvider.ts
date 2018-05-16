/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import * as Proto from '../protocol';
import * as typeConverters from '../utils/typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';

export default class TypeScriptFoldingProvider implements vscode.FoldingRangeProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	async provideFoldingRanges(
		document: vscode.TextDocument,
		_context: vscode.FoldingContext,
		token: vscode.CancellationToken
	): Promise<vscode.FoldingRange[] | undefined> {
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

		return response.body.map(span => this.convertOutliningSpan(span, document));
	}

	private convertOutliningSpan(span: Proto.OutliningSpan, document: vscode.TextDocument): vscode.FoldingRange {
		const range = typeConverters.Range.fromTextSpan(span.textSpan);
		const kind = TypeScriptFoldingProvider.getFoldingRangeKind(span);

		const start = range.start.line;
		// workaround for #47240
		const end = (range.end.character > 0 && document.getText(new vscode.Range(range.end.translate(0, -1), range.end)) === '}')
			? Math.max(range.end.line - 1, range.start.line)
			: range.end.line;

		return new vscode.FoldingRange(start, end, kind);
	}

	private static getFoldingRangeKind(span: Proto.OutliningSpan): vscode.FoldingRangeKind | undefined {
		// TODO: remove cast once we get a new TS insiders
		switch ((span as Proto.OutliningSpan & { kind: any }).kind) {
			case 'comment': return vscode.FoldingRangeKind.Comment;
			case 'region': return vscode.FoldingRangeKind.Region;
			case 'imports': return vscode.FoldingRangeKind.Imports;
			case 'code':
			default: return undefined;
		}
	}
}
