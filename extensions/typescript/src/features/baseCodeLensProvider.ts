/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CodeLensProvider, CodeLens, CancellationToken, TextDocument, Range, Uri, Position } from 'vscode';
import * as Proto from '../protocol';

import { ITypescriptServiceClient } from '../typescriptService';

export class ReferencesCodeLens extends CodeLens {
	constructor(
		public document: Uri,
		public file: string,
		range: Range
	) {
		super(range);
	}
}

export abstract class TypeScriptBaseCodeLensProvider implements CodeLensProvider {
	public constructor(
		protected client: ITypescriptServiceClient
	) { }

	provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return Promise.resolve([]);
		}
		return this.client.execute('navtree', { file: filepath }, token).then(response => {
			if (!response) {
				return [];
			}
			const tree = response.body;
			const referenceableSpans: Range[] = [];
			if (tree && tree.childItems) {
				tree.childItems.forEach(item => this.walkNavTree(document, item, referenceableSpans));
			}
			return referenceableSpans.map(span => new ReferencesCodeLens(document.uri, filepath, span));
		});
	}

	protected abstract extractSymbol(
		document: TextDocument,
		item: Proto.NavigationTree
	): Range | null;

	private walkNavTree(
		document: TextDocument,
		item: Proto.NavigationTree,
		results: Range[]
	): void {
		if (!item) {
			return;
		}

		const range = this.extractSymbol(document, item);
		if (range) {
			results.push(range);
		}

		(item.childItems || []).forEach(item => this.walkNavTree(document, item, results));
	}


	/**
	 * TODO: TS currently requires the position for 'references 'to be inside of the identifer
	 * Massage the range to make sure this is the case
	 */
	protected getSymbolRange(document: TextDocument, item: Proto.NavigationTree): Range | null {
		if (!item) {
			return null;
		}

		const span = item.spans && item.spans[0];
		if (!span) {
			return null;
		}

		const range = new Range(
			span.start.line - 1, span.start.offset - 1,
			span.end.line - 1, span.end.offset - 1);

		const text = document.getText(range);

		const identifierMatch = new RegExp(`^(.*?(\\b|\\W))${(item.text || '').replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\b`, 'gm');
		const match = identifierMatch.exec(text);
		const prefixLength = match ? match.index + match[1].length : 0;
		const startOffset = document.offsetAt(new Position(range.start.line, range.start.character)) + prefixLength;
		return new Range(
			document.positionAt(startOffset),
			document.positionAt(startOffset + item.text.length));
	}
};
