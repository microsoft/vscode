/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeLensProvider, CodeLens, CancellationToken, TextDocument, Range, Uri, Position, Event, EventEmitter } from 'vscode';
import * as Proto from '../protocol';

import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';
import { escapeRegExp } from '../utils/regexp';

export class ReferencesCodeLens extends CodeLens {
	constructor(
		public document: Uri,
		public file: string,
		range: Range
	) {
		super(range);
	}
}

export class CachedNavTreeResponse {
	private response?: Promise<Proto.NavTreeResponse>;
	private version: number = -1;
	private document: string = '';

	public execute(
		document: TextDocument,
		f: () => Promise<Proto.NavTreeResponse>
	) {
		if (this.matches(document)) {
			return this.response;
		}

		return this.update(document, f());
	}

	private matches(document: TextDocument): boolean {
		return this.version === document.version && this.document === document.uri.toString();
	}

	private update(
		document: TextDocument,
		response: Promise<Proto.NavTreeResponse>
	): Promise<Proto.NavTreeResponse> {
		this.response = response;
		this.version = document.version;
		this.document = document.uri.toString();
		return response;
	}
}

export abstract class TypeScriptBaseCodeLensProvider implements CodeLensProvider {
	private enabled: boolean = true;
	private onDidChangeCodeLensesEmitter = new EventEmitter<void>();

	public constructor(
		protected client: ITypeScriptServiceClient,
		private cachedResponse: CachedNavTreeResponse
	) { }

	public get onDidChangeCodeLenses(): Event<void> {
		return this.onDidChangeCodeLensesEmitter.event;
	}

	protected setEnabled(enabled: false): void {
		if (this.enabled !== enabled) {
			this.enabled = enabled;
			this.onDidChangeCodeLensesEmitter.fire();
		}
	}

	async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		if (!this.enabled) {
			return [];
		}

		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return [];
		}

		try {
			const response = await this.cachedResponse.execute(document, () => this.client.execute('navtree', { file: filepath }, token));
			if (!response) {
				return [];
			}

			const tree = response.body;
			const referenceableSpans: Range[] = [];
			if (tree && tree.childItems) {
				tree.childItems.forEach(item => this.walkNavTree(document, item, null, referenceableSpans));
			}
			return referenceableSpans.map(span => new ReferencesCodeLens(document.uri, filepath, span));
		} catch {
			return [];
		}
	}

	protected abstract extractSymbol(
		document: TextDocument,
		item: Proto.NavigationTree,
		parent: Proto.NavigationTree | null
	): Range | null;

	private walkNavTree(
		document: TextDocument,
		item: Proto.NavigationTree,
		parent: Proto.NavigationTree | null,
		results: Range[]
	): void {
		if (!item) {
			return;
		}

		const range = this.extractSymbol(document, item, parent);
		if (range) {
			results.push(range);
		}

		(item.childItems || []).forEach(child => this.walkNavTree(document, child, item, results));
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

		const range = typeConverters.Range.fromTextSpan(span);
		const text = document.getText(range);

		const identifierMatch = new RegExp(`^(.*?(\\b|\\W))${escapeRegExp(item.text || '')}(\\b|\\W)`, 'gm');
		const match = identifierMatch.exec(text);
		const prefixLength = match ? match.index + match[1].length : 0;
		const startOffset = document.offsetAt(new Position(range.start.line, range.start.character)) + prefixLength;
		return new Range(
			document.positionAt(startOffset),
			document.positionAt(startOffset + item.text.length));
	}
}
