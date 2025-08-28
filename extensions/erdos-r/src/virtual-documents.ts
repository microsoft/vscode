/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { RequestType } from 'vscode-languageclient';
import { LanguageClient } from 'vscode-languageclient/node';
import { LOGGER } from './extension';

interface VirtualDocumentParams {
	path: string;
}

type VirtualDocumentResponse = string;

const VIRTUAL_DOCUMENT_REQUEST_TYPE: RequestType<VirtualDocumentParams, VirtualDocumentResponse, any> =
	new RequestType('ark/internal/virtualDocument');

export class VirtualDocumentProvider implements vscode.TextDocumentContentProvider {
	constructor(private _client: LanguageClient) { }

	async provideTextDocumentContent(
		uri: vscode.Uri,
		token: vscode.CancellationToken
	): Promise<string> {
		const params: VirtualDocumentParams = {
			path: uri.path,
		};

		try {
		  return await this._client.sendRequest(VIRTUAL_DOCUMENT_REQUEST_TYPE, params, token);
		} catch (err) {
      LOGGER.warn(`Failed to provide document for URI '${uri}': ${err}`);
      return 'Error: This document does not exist';
		}
	}
}
