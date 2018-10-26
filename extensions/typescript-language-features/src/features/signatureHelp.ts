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
	public static readonly retriggerCharacters = [')'];

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideSignatureHelp(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context?: vscode.SignatureHelpContext,
	): Promise<vscode.SignatureHelp | undefined> {
		const filepath = this.client.toPath(document.uri);
		if (!filepath) {
			return undefined;
		}

		const args: Proto.SignatureHelpRequestArgs = {
			...typeConverters.Position.toFileLocationRequestArgs(filepath, position),
			triggerReason: toTsTriggerReason(context!)
		};
		const response = await this.client.execute('signatureHelp', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		const info = response.body;
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

function toTsTriggerReason(context: vscode.SignatureHelpContext): Proto.SignatureHelpTriggerReason {
	switch (context.triggerReason) {
		case vscode.SignatureHelpTriggerReason.TriggerCharacter:
			if (context.triggerCharacter) {
				if (context.isRetrigger) {
					return { kind: 'retrigger', triggerCharacter: context.triggerCharacter as any };
				} else {
					return { kind: 'characterTyped', triggerCharacter: context.triggerCharacter as any };
				}
			} else {
				return { kind: 'invoked' };
			}

		case vscode.SignatureHelpTriggerReason.ContentChange:
			return context.isRetrigger ? { kind: 'retrigger' } : { kind: 'invoked' };

		case vscode.SignatureHelpTriggerReason.Invoke:
		default:
			return { kind: 'invoked' };
	}
}
export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return vscode.languages.registerSignatureHelpProvider(selector,
		new TypeScriptSignatureHelpProvider(client), {
			triggerCharacters: TypeScriptSignatureHelpProvider.triggerCharacters,
			retriggerCharacters: TypeScriptSignatureHelpProvider.retriggerCharacters
		});
}