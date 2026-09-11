/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../configuration/documentSelector';
import type * as Proto from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';
import { coalesce } from '../utils/arrays';
import { readUnifiedConfig } from '../utils/configuration';

const INCLUDE_CLOSING_BRACES_ID = 'folding.includeClosingBraces';

interface FoldingRangeInfo {
	readonly initialRange: vscode.Range;
	readonly foldingRange: vscode.FoldingRange;
}

class TypeScriptFoldingProvider implements vscode.FoldingRangeProvider {

	private readonly disposables: vscode.Disposable[] = [];

	private readonly _onDidChangeFoldingRanges = new vscode.EventEmitter<void>();
	readonly onDidChangeFoldingRanges = this._onDidChangeFoldingRanges.event;

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) {
		this.disposables.push(
			this._onDidChangeFoldingRanges,
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(`js/ts.${INCLUDE_CLOSING_BRACES_ID}`)) {
					this._onDidChangeFoldingRanges.fire();
				}
			})
		);
	}

	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}

	async provideFoldingRanges(
		document: vscode.TextDocument,
		_context: vscode.FoldingContext,
		token: vscode.CancellationToken
	): Promise<vscode.FoldingRange[] | undefined> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return;
		}

		const args: Proto.FileRequestArgs = { file };
		const response = await this.client.execute('getOutliningSpans', args, token);
		if (response.type !== 'response' || !response.body) {
			return;
		}

		const info = coalesce(response.body.map(
			span => this.convertOutliningSpan(span, document)
		));

		const includeClosingBraces = readUnifiedConfig<boolean>(
			INCLUDE_CLOSING_BRACES_ID, false,
			{ scope: document, fallbackSection: document.languageId }
		);
		if (includeClosingBraces) {
			TypeScriptFoldingProvider.extendFoldingRanges(info);
		}

		return info.map(info => info.foldingRange);
	}

	private convertOutliningSpan(
		span: Proto.OutliningSpan,
		document: vscode.TextDocument
	): FoldingRangeInfo | undefined {
		const range = typeConverters.Range.fromTextSpan(span.textSpan);
		const kind = TypeScriptFoldingProvider.getFoldingRangeKind(span);

		// Workaround for #49904
		if (span.kind === 'comment') {
			const line = document.lineAt(range.start.line).text;
			if (/\/\/\s*#endregion/gi.test(line)) {
				return undefined;
			}
		}

		const start = range.start.line;
		const end = this.adjustFoldingEnd(range, document);

		return {
			initialRange: range,
			foldingRange: new vscode.FoldingRange(start, end, kind)
		};
	}

	private static readonly foldEndPairCharacters = ['}', ']', ')', '`', '>'];

	private adjustFoldingEnd(range: vscode.Range, document: vscode.TextDocument) {
		// workaround for #47240
		if (range.end.character > 0) {
			const foldEndCharacter = document.getText(new vscode.Range(range.end.translate(0, -1), range.end));
			if (TypeScriptFoldingProvider.foldEndPairCharacters.includes(foldEndCharacter)) {
				return Math.max(range.end.line - 1, range.start.line);
			}
		}

		return range.end.line;
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

	private static extendFoldingRanges(rangeInfos: FoldingRangeInfo[]) {
		const starts = new Set(rangeInfos.map(info => info.foldingRange.start));

		for (const info of rangeInfos) {
			// Extend only ranges previously shortened by adjustFoldingEnd
			const foldingRange = info.foldingRange;
			if (foldingRange.end !== info.initialRange.end.line - 1) {
				continue;
			}

			// Extend only if the extended end does not coincide with another range's start
			const extendedEnd = foldingRange.end + 1;
			if (starts.has(extendedEnd)) {
				continue;
			}

			foldingRange.end = extendedEnd;
		}
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
): vscode.Disposable {
	const provider = new TypeScriptFoldingProvider(client);
	const providerRegistration = vscode.languages.registerFoldingRangeProvider(selector.syntax, provider);

	return vscode.Disposable.from(
		providerRegistration,
		provider
	);
}
