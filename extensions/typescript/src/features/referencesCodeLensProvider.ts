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

export default class TypeScriptReferencesCodeLensProvider extends TypeScriptBaseCodeLensProvider {
	public constructor(
		client: ITypescriptServiceClient
	) {
		super(client, 'referencesCodeLens.enabled');
	}

	resolveCodeLens(inputCodeLens: CodeLens, token: CancellationToken): Promise<CodeLens> {
		const codeLens = inputCodeLens as ReferencesCodeLens;
		const args: Proto.FileLocationRequestArgs = {
			file: codeLens.file,
			line: codeLens.range.start.line + 1,
			offset: codeLens.range.start.character + 1
		};
		return this.client.execute('references', args, token).then(response => {
			if (!response || !response.body) {
				throw codeLens;
			}

			const locations = response.body.refs
				.map(reference =>
					new Location(this.client.asUrl(reference.file),
						new Range(
							reference.start.line - 1, reference.start.offset - 1,
							reference.end.line - 1, reference.end.offset - 1)))
				.filter(location =>
					// Exclude original definition from references
					!(location.uri.fsPath === codeLens.document.fsPath &&
						location.range.start.isEqual(codeLens.range.start)));

			codeLens.command = {
				title: locations.length === 1
					? localize('oneReferenceLabel', '1 reference')
					: localize('manyReferenceLabel', '{0} references', locations.length),
				command: 'editor.action.showReferences',
				arguments: [codeLens.document, codeLens.range.start, locations]
			};
			return codeLens;
		}).catch(() => {
			codeLens.command = {
				title: localize('referenceErrorLabel', 'Could not determine references'),
				command: ''
			};
			return codeLens;
		});
	}

	protected extractSymbol(
		document: TextDocument,
		item: Proto.NavigationTree,
		parent: Proto.NavigationTree | null
	): Range | null {
		if (parent && parent.kind === PConst.Kind.enum) {
			return super.getSymbolRange(document, item);
		}

		switch (item.kind) {
			case PConst.Kind.const:
			case PConst.Kind.let:
			case PConst.Kind.variable:
			case PConst.Kind.function:
				// Only show references for exported variables
				if (!item.kindModifiers.match(/\bexport\b/)) {
					break;
				}
			// fallthrough

			case PConst.Kind.class:
				if (item.text === '<class>') {
					break;
				}
			// fallthrough

			case PConst.Kind.memberFunction:
			case PConst.Kind.memberVariable:
			case PConst.Kind.memberGetAccessor:
			case PConst.Kind.memberSetAccessor:
			case PConst.Kind.constructorImplementation:
			case PConst.Kind.interface:
			case PConst.Kind.type:
			case PConst.Kind.enum:
				return super.getSymbolRange(document, item);
		}

		return null;
	}
}
