/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import type * as Proto from '../../protocol';
import { CachedResponse } from '../../tsServer/cachedResponse';
import { ITypeScriptServiceClient } from '../../typescriptService';

const localize = nls.loadMessageBundle();

export class ReferencesCodeLens extends vscode.CodeLens {
	constructor(
		public document: vscode.Uri,
		public file: string,
		range: vscode.Range
	) {
		super(range);
	}
}

export abstract class TypeScriptBaseCodeLensProvider implements vscode.CodeLensProvider<ReferencesCodeLens> {

	public static readonly cancelledCommand: vscode.Command = {
		// Cancellation is not an error. Just show nothing until we can properly re-compute the code lens
		title: '',
		command: ''
	};

	public static readonly errorCommand: vscode.Command = {
		title: localize('referenceErrorLabel', 'Could not determine references'),
		command: ''
	};

	public constructor(
		protected client: ITypeScriptServiceClient,
		private cachedResponse: CachedResponse<Proto.NavTreeResponse>
	) { }


	async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<ReferencesCodeLens[]> {
		const filepath = this.client.toOpenedFilePath(document);
		if (!filepath) {
			return [];
		}

		const response = await this.cachedResponse.execute(document, () => this.client.execute('navtree', { file: filepath }, token));
		if (response.type !== 'response') {
			return [];
		}

		const referenceableSpans: vscode.Range[] = [];
		response.body?.childItems?.forEach(item => this.walkNavTree(document, item, undefined, referenceableSpans));
		return referenceableSpans.map(span => new ReferencesCodeLens(document.uri, filepath, span));
	}

	protected abstract extractSymbol(
		item: Proto.NavigationTree,
		parent: Proto.NavigationTree | undefined
	): vscode.Range | undefined;

	private walkNavTree(
		document: vscode.TextDocument,
		item: Proto.NavigationTree,
		parent: Proto.NavigationTree | undefined,
		results: vscode.Range[]
	): void {
		const range = this.extractSymbol(item, parent);
		if (range) {
			results.push(range);
		}

		item.childItems?.forEach(child => this.walkNavTree(document, child, item, results));
	}
}
