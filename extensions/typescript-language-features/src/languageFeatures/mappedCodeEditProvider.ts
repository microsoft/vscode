/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { API } from '../tsServer/api';
import { FileSpan } from '../tsServer/protocol/protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireMinVersion } from './util/dependentRegistration';
import { Range, WorkspaceEdit } from '../typeConverters';
import { DocumentSelector } from '../configuration/documentSelector';

class TsMappedEditsProvider implements vscode.MappedEditsProvider {
	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	async provideMappedEdits(document: vscode.TextDocument, codeBlocks: string[], context: vscode.MappedEditsContext, token: vscode.CancellationToken): Promise<vscode.WorkspaceEdit | undefined> {
		if (!this.isEnabled()) {
			return;
		}

		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return;
		}

		const response = await this.client.execute('mapCode', {
			file,
			mapping: {
				contents: codeBlocks,
				focusLocations: context.documents.map(documents => {
					return documents.flatMap((contextItem): FileSpan[] => {
						const file = this.client.toTsFilePath(contextItem.uri);
						if (!file) {
							return [];
						}
						return contextItem.ranges.map((range): FileSpan => ({ file, ...Range.toTextSpan(range) }));
					});
				}),
			}
		}, token);
		if (response.type !== 'response' || !response.body) {
			return;
		}

		return WorkspaceEdit.fromFileCodeEdits(this.client, response.body);
	}

	private isEnabled(): boolean {
		return vscode.workspace.getConfiguration('typescript').get<boolean>('experimental.mappedCodeEdits.enabled', false);
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return conditionalRegistration([
		requireMinVersion(client, API.v540)
	], () => {
		const provider = new TsMappedEditsProvider(client);
		return vscode.chat.registerMappedEditsProvider(selector.semantic, provider);
	});
}
