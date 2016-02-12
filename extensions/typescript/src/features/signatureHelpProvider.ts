/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { SignatureHelpProvider, SignatureHelp, SignatureInformation, ParameterInformation, TextDocument, Position, CancellationToken } from 'vscode';

import * as Previewer from './previewer';
import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

export default class TypeScriptSignatureHelpProvider implements SignatureHelpProvider {

	private client: ITypescriptServiceClient;

	public constructor(client: ITypescriptServiceClient) {
		this.client = client;
	}

	public provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken): Promise<SignatureHelp> {
		let args: Proto.SignatureHelpRequestArgs = {
			file: this.client.asAbsolutePath(document.uri),
			line: position.line + 1,
			offset: position.character + 1
		};
		if (!args.file) {
			return Promise.resolve<SignatureHelp>(null);
		}
		return this.client.execute('signatureHelp', args, token).then((response) => {
			let info = response.body;
			if (!info) {
				return null;
			}

			let result = new SignatureHelp();
			result.activeSignature = info.selectedItemIndex;
			result.activeParameter = info.argumentIndex;

			info.items.forEach(item => {

				let signature = new SignatureInformation('');
				signature.label += Previewer.plain(item.prefixDisplayParts);

				item.parameters.forEach((p, i, a) => {

					let parameter = new ParameterInformation(
						Previewer.plain(p.displayParts),
						Previewer.plain(p.documentation));

					signature.label += parameter.label;
					signature.parameters.push(parameter);
					if (i < a.length - 1) {
						signature.label += Previewer.plain(item.separatorDisplayParts);
					}
				});
				signature.label += Previewer.plain(item.suffixDisplayParts);
				result.signatures.push(signature);
			});

			return result;
		}, (err: any) => {
			return null;
		});
	}
}