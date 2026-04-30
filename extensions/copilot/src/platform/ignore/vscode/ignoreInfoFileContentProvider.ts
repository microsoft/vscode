/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, TextDocumentContentProvider, Uri } from 'vscode';

export class CopilotIgnoreInfoFileContentProvider implements TextDocumentContentProvider {
	constructor(private readonly contentProvider: () => Promise<string>) { }

	async provideTextDocumentContent(uri: Uri, token: CancellationToken) {
		return this.contentProvider();
	}

}