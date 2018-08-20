/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as Previewer from '../utils/previewer';
import * as typeConverters from '../utils/typeConverters';

class TypeScriptSignatureHelpProvider implements vscode.SignatureHelpProvider {

	public static readonly triggerCharacters = ['(', ',', '<'];

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideSignatureHelp(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.SignatureHelp | undefined> {
		const filepath = this.client.toPath(document.uri);
		if (!filepath) {
			return undefined;
		}
		const args: Proto.SignatureHelpRequestArgs = typeConverters.Position.toFileLocationRequestArgs(filepath, position);

		let info: Proto.SignatureHelpItems;
		try {
			const { body } = await this.client.execute('signatureHelp', args, token);
			if (!body) {
				return undefined;
			}
			info = body;
		} catch {
			return undefined;
		}

		const result = new vscode.SignatureHelp();
		result.activeSignature = info.selectedItemIndex;
		result.activeParameter = this.getActiveParmeter(info);
		result.signatures = info.items.map(signature => this.convertSignature(signature));

		return result;
	}

	private getActiveParmeter(info: Proto.SignatureHelpItems): number {
		const activeSignature = info.items[info.selectedItemIndex];
		if (activeSignature && activeSignature.isVariadic) {
			return Math.min(info.argumentIndex, activeSignature.parameters.length - 1);
		}
		return info.argumentIndex;
	}

	private convertSignature(item: Proto.SignatureHelpItem) {
		const signature = new vscode.SignatureInformation(
			Previewer.plain(item.prefixDisplayParts),
			Previewer.markdownDocumentation(item.documentation, item.tags.filter(x => x.name !== 'param')));

		signature.parameters = item.parameters.map(p =>
			new vscode.ParameterInformation(
				Previewer.plain(p.displayParts),
				Previewer.markdownDocumentation(p.documentation, [])));

		signature.label += signature.parameters.map(parameter => parameter.label).join(Previewer.plain(item.separatorDisplayParts));
		signature.label += Previewer.plain(item.suffixDisplayParts);
		return signature;
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return vscode.languages.registerSignatureHelpProvider(selector,
		new TypeScriptSignatureHelpProvider(client),
		...TypeScriptSignatureHelpProvider.triggerCharacters);
}