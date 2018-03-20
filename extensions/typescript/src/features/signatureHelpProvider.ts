/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SignatureHelpProvider, SignatureHelp, SignatureInformation, ParameterInformation, TextDocument, Position, CancellationToken } from 'vscode';

import * as Previewer from '../utils/previewer';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { vsPositionToTsFileLocation } from '../utils/typeConverters';

export default class TypeScriptSignatureHelpProvider implements SignatureHelpProvider {

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken): Promise<SignatureHelp | undefined | null> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return null;
		}
		const args: Proto.SignatureHelpRequestArgs = vsPositionToTsFileLocation(filepath, position);

		const response = await this.client.execute('signatureHelp', args, token);
		const info = response.body;
		if (!info) {
			return null;
		}

		const result = new SignatureHelp();
		result.activeSignature = info.selectedItemIndex;
		result.activeParameter = info.argumentIndex;

		info.items.forEach((item, i) => {
			// keep active parameter in bounds
			if (i === info.selectedItemIndex && item.isVariadic) {
				result.activeParameter = Math.min(info.argumentIndex, item.parameters.length - 1);
			}

			const signature = new SignatureInformation('');
			signature.label += Previewer.plain(item.prefixDisplayParts);

			item.parameters.forEach((p, i, a) => {
				const parameter = new ParameterInformation(
					Previewer.plain(p.displayParts),
					Previewer.plain(p.documentation));

				signature.label += parameter.label;
				signature.parameters.push(parameter);
				if (i < a.length - 1) {
					signature.label += Previewer.plain(item.separatorDisplayParts);
				}
			});
			signature.label += Previewer.plain(item.suffixDisplayParts);
			signature.documentation = Previewer.markdownDocumentation(item.documentation, item.tags);
			result.signatures.push(signature);
		});

		return result;
	}
}