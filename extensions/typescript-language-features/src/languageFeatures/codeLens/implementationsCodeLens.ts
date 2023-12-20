/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../../configuration/documentSelector';
import { LanguageDescription } from '../../configuration/languageDescription';
import { CachedResponse } from '../../tsServer/cachedResponse';
import type * as Proto from '../../tsServer/protocol/protocol';
import * as PConst from '../../tsServer/protocol/protocol.const';
import * as typeConverters from '../../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../../typescriptService';
import { conditionalRegistration, requireGlobalConfiguration, requireSomeCapability } from '../util/dependentRegistration';
import { ReferencesCodeLens, TypeScriptBaseCodeLensProvider, getSymbolRange } from './baseCodeLensProvider';
import { ExecutionTarget } from '../../tsServer/server';


export default class TypeScriptImplementationsCodeLensProvider extends TypeScriptBaseCodeLensProvider {
	public constructor(
		client: ITypeScriptServiceClient,
		protected _cachedResponse: CachedResponse<Proto.NavTreeResponse>,
		private readonly language: LanguageDescription
	) {
		super(client, _cachedResponse);
		this._register(
			vscode.workspace.onDidChangeConfiguration(evt => {
				if (evt.affectsConfiguration(`${language.id}.implementationsCodeLens.showOnInterfaceMethods`)) {
					this.changeEmitter.fire();
				}
			})
		);
	}

	public async resolveCodeLens(
		codeLens: ReferencesCodeLens,
		token: vscode.CancellationToken,
	): Promise<vscode.CodeLens> {
		const args = typeConverters.Position.toFileLocationRequestArgs(codeLens.file, codeLens.range.start);
		const response = await this.client.execute('implementation', args, token, {
			lowPriority: true,
			executionTarget: ExecutionTarget.Semantic,
			cancelOnResourceChange: codeLens.document,
		});
		if (response.type !== 'response' || !response.body) {
			codeLens.command = response.type === 'cancelled'
				? TypeScriptBaseCodeLensProvider.cancelledCommand
				: TypeScriptBaseCodeLensProvider.errorCommand;
			return codeLens;
		}

		const locations = response.body
			.map(reference =>
				// Only take first line on implementation: https://github.com/microsoft/vscode/issues/23924
				new vscode.Location(this.client.toResource(reference.file),
					reference.start.line === reference.end.line
						? typeConverters.Range.fromTextSpan(reference)
						: new vscode.Range(
							typeConverters.Position.fromLocation(reference.start),
							new vscode.Position(reference.start.line, 0))))
			// Exclude original from implementations
			.filter(location =>
				!(location.uri.toString() === codeLens.document.toString() &&
					location.range.start.line === codeLens.range.start.line &&
					location.range.start.character === codeLens.range.start.character));

		codeLens.command = this.getCommand(locations, codeLens);
		return codeLens;
	}

	private getCommand(locations: vscode.Location[], codeLens: ReferencesCodeLens): vscode.Command | undefined {
		return {
			title: this.getTitle(locations),
			command: locations.length ? 'editor.action.showReferences' : '',
			arguments: [codeLens.document, codeLens.range.start, locations]
		};
	}

	private getTitle(locations: vscode.Location[]): string {
		return locations.length === 1
			? vscode.l10n.t("1 implementation")
			: vscode.l10n.t("{0} implementations", locations.length);
	}

	protected extractSymbol(
		document: vscode.TextDocument,
		item: Proto.NavigationTree,
		parent: Proto.NavigationTree | undefined
	): vscode.Range | undefined {
		if (item.kind === PConst.Kind.method && parent && parent.kind === PConst.Kind.interface && vscode.workspace.getConfiguration(this.language.id).get<boolean>('implementationsCodeLens.showOnInterfaceMethods')) {
			return getSymbolRange(document, item);
		}
		switch (item.kind) {
			case PConst.Kind.interface:
				return getSymbolRange(document, item);

			case PConst.Kind.class:
			case PConst.Kind.method:
			case PConst.Kind.memberVariable:
			case PConst.Kind.memberGetAccessor:
			case PConst.Kind.memberSetAccessor:
				if (item.kindModifiers.match(/\babstract\b/g)) {
					return getSymbolRange(document, item);
				}
				break;
		}
		return undefined;
	}
}

export function register(
	selector: DocumentSelector,
	language: LanguageDescription,
	client: ITypeScriptServiceClient,
	cachedResponse: CachedResponse<Proto.NavTreeResponse>,
) {
	return conditionalRegistration([
		requireGlobalConfiguration(language.id, 'implementationsCodeLens.enabled'),
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerCodeLensProvider(selector.semantic,
			new TypeScriptImplementationsCodeLensProvider(client, cachedResponse, language));
	});
}
