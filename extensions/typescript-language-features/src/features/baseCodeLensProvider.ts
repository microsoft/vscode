/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient, ServerResponse } from '../typescriptService';
import { escapeRegExp } from '../utils/regexp';
import * as typeConverters from '../utils/typeConverters';


export class ReferencesCodeLens extends vscode.CodeLens {
	constructor(
		public document: vscode.Uri,
		public file: string,
		range: vscode.Range
	) {
		super(range);
	}
}

export class CachedNavTreeResponse {
	private response?: Promise<ServerResponse<Proto.NavTreeResponse>>;
	private version: number = -1;
	private document: string = '';

	public execute(
		document: vscode.TextDocument,
		f: () => Promise<ServerResponse<Proto.NavTreeResponse>>
	) {
		if (this.matches(document)) {
			return this.response;
		}

		return this.update(document, f());
	}

	private matches(document: vscode.TextDocument): boolean {
		return this.version === document.version && this.document === document.uri.toString();
	}

	private update(
		document: vscode.TextDocument,
		response: Promise<ServerResponse<Proto.NavTreeResponse>>
	): Promise<ServerResponse<Proto.NavTreeResponse>> {
		this.response = response;
		this.version = document.version;
		this.document = document.uri.toString();
		return response;
	}
}

export abstract class TypeScriptBaseCodeLensProvider implements vscode.CodeLensProvider {
	private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();

	public constructor(
		protected client: ITypeScriptServiceClient,
		private cachedResponse: CachedNavTreeResponse
	) { }

	public get onDidChangeCodeLenses(): vscode.Event<void> {
		return this.onDidChangeCodeLensesEmitter.event;
	}

	async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
		const filepath = this.client.toPath(document.uri);
		if (!filepath) {
			return [];
		}

		const response = await this.cachedResponse.execute(document, () => this.client.execute('navtree', { file: filepath }, token));
		if (!response || response.type !== 'response') {
			return [];
		}

		const tree = response.body;
		const referenceableSpans: vscode.Range[] = [];
		if (tree && tree.childItems) {
			tree.childItems.forEach(item => this.walkNavTree(document, item, null, referenceableSpans));
		}
		return referenceableSpans.map(span => new ReferencesCodeLens(document.uri, filepath, span));
	}

	protected abstract extractSymbol(
		document: vscode.TextDocument,
		item: Proto.NavigationTree,
		parent: Proto.NavigationTree | null
	): vscode.Range | null;

	private walkNavTree(
		document: vscode.TextDocument,
		item: Proto.NavigationTree,
		parent: Proto.NavigationTree | null,
		results: vscode.Range[]
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
	protected getSymbolRange(document: vscode.TextDocument, item: Proto.NavigationTree): vscode.Range | null {
		if (!item) {
			return null;
		}

		// TS 3.0+ provides a span for just the symbol
		if (item.nameSpan) {
			return typeConverters.Range.fromTextSpan((item as any).nameSpan);
		}

		// In older versions, we have to calculate this manually. See #23924
		const span = item.spans && item.spans[0];
		if (!span) {
			return null;
		}

		const range = typeConverters.Range.fromTextSpan(span);
		const text = document.getText(range);

		const identifierMatch = new RegExp(`^(.*?(\\b|\\W))${escapeRegExp(item.text || '')}(\\b|\\W)`, 'gm');
		const match = identifierMatch.exec(text);
		const prefixLength = match ? match.index + match[1].length : 0;
		const startOffset = document.offsetAt(new vscode.Position(range.start.line, range.start.character)) + prefixLength;
		return new vscode.Range(
			document.positionAt(startOffset),
			document.positionAt(startOffset + item.text.length));
	}
}
