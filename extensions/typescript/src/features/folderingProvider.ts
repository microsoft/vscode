/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';

// TODO: forward declarations for private TS API.

interface TextSpan {
	start: number;
	length: number;
}

interface OutliningSpan {
	textSpan: TextSpan;
	hintSpan: TextSpan;
	bannerText: string;
	autoCollapse: boolean;
}

interface OutliningSpansRequestArgs extends Proto.FileRequestArgs { }

interface OutliningSpansResponse extends Proto.Response {
	body?: OutliningSpan[];
}

export default class TypeScriptFoldingProvider implements vscode.FoldingProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	async provideFoldingRanges(
		document: vscode.TextDocument,
		_: vscode.FoldingContext,
		token: vscode.CancellationToken
	): Promise<vscode.FoldingRangeList | undefined> {
		if (!this.client.apiVersion.has270Features()) {
			return;
		}

		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return;
		}

		const args: OutliningSpansRequestArgs = { file };
		const response: OutliningSpansResponse = await this.client.execute('outliningSpans', args, token);
		if (!response || !response.body) {
			return;
		}

		return new vscode.FoldingRangeList(response.body.map(span => {
			const start = document.positionAt(span.textSpan.start);
			const end = document.positionAt(span.textSpan.start + span.textSpan.length);

			return new vscode.FoldingRange(start.line, end.line);
		}));
	}
}