/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {plain} from './documentation';
import AbstractSupport from './abstractProvider';
import * as Protocol from '../protocol';
import {createRequest} from '../typeConvertion';
import {HoverProvider, Hover, TextDocument, CancellationToken, Range, Position} from 'vscode';

export default class OmniSharpHoverProvider extends AbstractSupport implements HoverProvider {

	public provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover> {

		let req = createRequest<Protocol.TypeLookupRequest>(document, position);
		req.IncludeDocumentation = true;

		return this._server.makeRequest<Protocol.TypeLookupResponse>(Protocol.TypeLookup, req, token).then(value => {
			if (value && value.Type) {
				let contents = [plain(value.Documentation), { language: 'csharp', value: value.Type }];
				return new Hover(contents);
			}
		});
	}
}
