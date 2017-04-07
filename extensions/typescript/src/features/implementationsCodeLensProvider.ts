/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CodeLens, CancellationToken, TextDocument, Range, Location } from 'vscode';
import * as Proto from '../protocol';
import * as PConst from '../protocol.const';

import { TypeScriptBaseCodeLensProvider, ReferencesCodeLens } from './baseCodeLensProvider';
import { ITypescriptServiceClient } from '../typescriptService';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export default class TypeScriptImplementationsCodeLensProvider extends TypeScriptBaseCodeLensProvider {
	public constructor(
		client: ITypescriptServiceClient
	) {
		super(client, 'implementationsCodeLens.enabled');
	}

	provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		if (!this.client.apiVersion.has220Features()) {
			return Promise.resolve([]);
		}
		return super.provideCodeLenses(document, token);
	}

	resolveCodeLens(inputCodeLens: CodeLens, token: CancellationToken): Promise<CodeLens> {
		const codeLens = inputCodeLens as ReferencesCodeLens;
		const args: Proto.FileLocationRequestArgs = {
			file: codeLens.file,
			line: codeLens.range.start.line + 1,
			offset: codeLens.range.start.character + 1
		};
		return this.client.execute('implementation', args, token).then(response => {
			if (!response || !response.body) {
				throw codeLens;
			}

			const locations = response.body
				.map(reference =>
					new Location(this.client.asUrl(reference.file),
						new Range(
							reference.start.line - 1, reference.start.offset - 1,
							reference.end.line - 1, reference.end.offset - 1)))
				// Exclude original from implementations
				.filter(location =>
					!(location.uri.fsPath === codeLens.document.fsPath &&
						location.range.start.line === codeLens.range.start.line));

			codeLens.command = {
				title: locations.length === 1
					? localize('oneImplementationLabel', '1 implementation')
					: localize('manyImplementationLabel', '{0} implementations', locations.length),
				command: 'editor.action.showReferences',
				arguments: [codeLens.document, codeLens.range.start, locations]
			};
			return codeLens;
		}).catch(() => {
			codeLens.command = {
				title: localize('implementationsErrorLabel', 'Could not determine implementations'),
				command: ''
			};
			return codeLens;
		});
	}

	protected extractSymbol(
		document: TextDocument,
		item: Proto.NavigationTree,
		_parent: Proto.NavigationTree | null
	): Range | null {
		switch (item.kind) {
			case PConst.Kind.interface:
				return super.getSymbolRange(document, item);

			case PConst.Kind.class:
			case PConst.Kind.memberFunction:
			case PConst.Kind.memberVariable:
			case PConst.Kind.memberGetAccessor:
			case PConst.Kind.memberSetAccessor:
				if (item.kindModifiers.match(/\babstract\b/g)) {
					return super.getSymbolRange(document, item);
				}
				break;
		}
		return null;
	}
}
