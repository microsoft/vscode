/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { disposeAll } from '../utils/dispose';
import * as typeConverters from '../utils/typeConverters';


class TypeScriptFoldingProvider implements vscode.FoldingRangeProvider {
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

		return response.body
			.map(span => this.convertOutliningSpan(span, document))
			.filter(foldingRange => !!foldingRange) as vscode.FoldingRange[];
	}

	private convertOutliningSpan(
		span: Proto.OutliningSpan,
		document: vscode.TextDocument
	): vscode.FoldingRange | undefined {
		const range = typeConverters.Range.fromTextSpan(span.textSpan);
		const kind = TypeScriptFoldingProvider.getFoldingRangeKind(span);

		// Workaround for #49904
		if (span.kind === 'comment') {
			const line = document.lineAt(range.start.line).text;
			if (line.match(/\/\/\s*#endregion/gi)) {
				return undefined;
			}
		}

		const start = range.start.line;
		// workaround for #47240
		const end = (range.end.character > 0 && document.getText(new vscode.Range(range.end.translate(0, -1), range.end)) === '}')
			? Math.max(range.end.line - 1, range.start.line)
			: range.end.line;

		return new vscode.FoldingRange(start, end, kind);
	}

	private static getFoldingRangeKind(span: Proto.OutliningSpan): vscode.FoldingRangeKind | undefined {
		switch (span.kind) {
			case 'comment': return vscode.FoldingRangeKind.Comment;
			case 'region': return vscode.FoldingRangeKind.Region;
			case 'imports': return vscode.FoldingRangeKind.Imports;
			case 'code':
			default: return undefined;
		}
	}
}

class FoldingProviderManager {
	private registration: vscode.Disposable | undefined = undefined;

	private readonly _disposables: vscode.Disposable[] = [];

	constructor(
		private readonly selector: vscode.DocumentSelector,
		private readonly client: ITypeScriptServiceClient
	) {
		this.update(client.apiVersion);
		this.client.onTsServerStarted(() => {
			this.update(this.client.apiVersion);
		}, null, this._disposables);
	}

	public dispose() {
		disposeAll(this._disposables);
		if (this.registration) {
			this.registration.dispose();
			this.registration = undefined;
		}
	}

	private update(api: API) {
		if (api.has280Features()) {
			if (!this.registration) {
				this.registration = vscode.languages.registerFoldingRangeProvider(this.selector, new TypeScriptFoldingProvider(this.client));
			}
		} else {
			if (this.registration) {
				this.registration.dispose();
				this.registration = undefined;
			}
		}
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
): vscode.Disposable {
	return new FoldingProviderManager(selector, client);
}