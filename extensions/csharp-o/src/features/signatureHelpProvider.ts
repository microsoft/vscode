/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import AbstractSupport from './abstractProvider';
import * as Protocol from '../protocol';
import {createRequest} from '../typeConvertion';
import {SignatureHelpProvider, SignatureHelp, SignatureInformation, ParameterInformation, Uri, CancellationToken, TextDocument, Position} from 'vscode';

export default class OmniSharpSignatureHelpProvider extends AbstractSupport implements SignatureHelpProvider {

	public provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken): Promise<SignatureHelp> {

		let req = createRequest(document, position);

		return this._server.makeRequest<Protocol.SignatureHelp>(Protocol.SignatureHelp, req, token).then(res => {

			let ret = new SignatureHelp();
			ret.activeSignature = res.ActiveSignature;
			ret.activeParameter = res.ActiveParameter;

			for(let signature of res.Signatures) {

				let signatureInfo = new SignatureInformation(signature.Label, signature.Documentation);
				ret.signatures.push(signatureInfo);

				for (let parameter of signature.Parameters) {
					let parameterInfo = new ParameterInformation(
						parameter.Label,
						parameter.Documentation);

					signatureInfo.parameters.push(parameterInfo);
				}
			}

			return ret;
		});
	}
}
