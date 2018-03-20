/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeLens, CancellationToken, TextDocument, Range, Location, workspace } from 'vscode';
import * as Proto from '../protocol';
import * as PConst from '../protocol.const';

import { TypeScriptBaseCodeLensProvider, ReferencesCodeLens, CachedNavTreeResponse } from './baseCodeLensProvider';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export default class TypeScriptReferencesCodeLensProvider extends TypeScriptBaseCodeLensProvider {
	public constructor(
		client: ITypeScriptServiceClient,
		private readonly language: string,
		cachedResponse: CachedNavTreeResponse
	) {
		super(client, cachedResponse);
	}

	public updateConfiguration(): void {
		const config = workspace.getConfiguration(this.language);
		this.setEnabled(config.get('referencesCodeLens.enabled', false));
	}

	async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		if (!this.client.apiVersion.has206Features()) {
			return [];
		}
		return super.provideCodeLenses(document, token);
	}

	public resolveCodeLens(inputCodeLens: CodeLens, token: CancellationToken): Promise<CodeLens> {
		const codeLens = inputCodeLens as ReferencesCodeLens;
		const args = typeConverters.Position.toFileLocationRequestArgs(codeLens.file, codeLens.range.start);
		return this.client.execute('references', args, token).then(response => {
			if (!response || !response.body) {
				throw codeLens;
			}

			const locations = response.body.refs
				.map(reference =>
					new Location(this.client.asUrl(reference.file), typeConverters.Range.fromTextSpan(reference)))
				.filter(location =>
					// Exclude original definition from references
					!(location.uri.toString() === codeLens.document.toString() &&
						location.range.start.isEqual(codeLens.range.start)));

			codeLens.command = {
				title: locations.length === 1
					? localize('oneReferenceLabel', '1 reference')
					: localize('manyReferenceLabel', '{0} references', locations.length),
				command: locations.length ? 'editor.action.showReferences' : '',
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
