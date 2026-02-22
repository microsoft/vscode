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
import { readUnifiedConfig, unifiedConfigSection } from '../../utils/configuration';
import { conditionalRegistration, requireHasModifiedUnifiedConfig, requireSomeCapability } from '../util/dependentRegistration';
import { ReferencesCodeLens, TypeScriptBaseCodeLensProvider, getSymbolRange } from './baseCodeLensProvider';
import { ExecutionTarget } from '../../tsServer/server';

const Config = Object.freeze({
	enabled: 'implementationsCodeLens.enabled',
	showOnInterfaceMethods: 'implementationsCodeLens.showOnInterfaceMethods',
	showOnAllClassMethods: 'implementationsCodeLens.showOnAllClassMethods',
});

export default class TypeScriptImplementationsCodeLensProvider extends TypeScriptBaseCodeLensProvider {
	public constructor(
		client: ITypeScriptServiceClient,
		protected _cachedResponse: CachedResponse<Proto.NavTreeResponse>,
		private readonly language: LanguageDescription
	) {
		super(client, _cachedResponse);
		this._register(
			vscode.workspace.onDidChangeConfiguration(evt => {
				if (
					evt.affectsConfiguration(`${unifiedConfigSection}.${Config.enabled}`) ||
					evt.affectsConfiguration(`${language.id}.${Config.enabled}`) ||
					evt.affectsConfiguration(`${unifiedConfigSection}.${Config.showOnInterfaceMethods}`) ||
					evt.affectsConfiguration(`${language.id}.${Config.showOnInterfaceMethods}`) ||
					evt.affectsConfiguration(`${unifiedConfigSection}.${Config.showOnAllClassMethods}`) ||
					evt.affectsConfiguration(`${language.id}.${Config.showOnAllClassMethods}`)
				) {
					this.changeEmitter.fire();
				}
			})
		);
	}


	override async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<ReferencesCodeLens[]> {
		const enabled = readUnifiedConfig<boolean>(Config.enabled, false, { scope: document, fallbackSection: this.language.id });
		if (!enabled) {
			return [];
		}

		return super.provideCodeLenses(document, token);
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
		// Always show on interfaces
		if (item.kind === PConst.Kind.interface) {
			return getSymbolRange(document, item);
		}

		// Always show on abstract classes/properties
		if (
			(item.kind === PConst.Kind.class ||
				item.kind === PConst.Kind.method ||
				item.kind === PConst.Kind.memberVariable ||
				item.kind === PConst.Kind.memberGetAccessor ||
				item.kind === PConst.Kind.memberSetAccessor) &&
			/\babstract\b/.test(item.kindModifiers ?? '')
		) {
			return getSymbolRange(document, item);
		}

		// If configured, show on interface methods
		if (
			item.kind === PConst.Kind.method &&
			parent?.kind === PConst.Kind.interface &&
			readUnifiedConfig<boolean>('implementationsCodeLens.showOnInterfaceMethods', false, { scope: document, fallbackSection: this.language.id })
		) {
			return getSymbolRange(document, item);
		}


		// If configured, show on all class methods
		if (
			item.kind === PConst.Kind.method &&
			parent?.kind === PConst.Kind.class &&
			readUnifiedConfig<boolean>('implementationsCodeLens.showOnAllClassMethods', false, { scope: document, fallbackSection: this.language.id })
		) {
			// But not private ones as these can never be overridden
			if (/\bprivate\b/.test(item.kindModifiers ?? '')) {
				return undefined;
			}
			return getSymbolRange(document, item);
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
		requireHasModifiedUnifiedConfig(Config.enabled, language.id),
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerCodeLensProvider(selector.semantic,
			new TypeScriptImplementationsCodeLensProvider(client, cachedResponse, language));
	});
}
