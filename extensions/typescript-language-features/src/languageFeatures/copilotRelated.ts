/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { nulToken } from '../utils/cancellation';
import { isSupportedLanguageMode } from '../configuration/languageIds';
import { DocumentSelector } from '../configuration/documentSelector';
import { API } from '../tsServer/api';
import type * as Proto from '../tsServer/protocol/protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireMinVersion } from './util/dependentRegistration';

const minVersion = API.v570;
const dummyDisposable = new vscode.Disposable(() => { });

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return conditionalRegistration([
		requireMinVersion(client, minVersion),
	], () => {
		const ext = vscode.extensions.getExtension('github.copilot');
		if (!ext) {
			return dummyDisposable;
		}
		ext.activate().then(() => {
			const relatedAPI = ext.exports as {
				registerRelatedFilesProvider(
					providerId: { extensionId: string; languageId: string },
					callback: (uri: vscode.Uri) => Promise<{ entries: vscode.Uri[]; traits?: { name: string; value: string }[] }>
				): void;
			} | undefined;
			if (relatedAPI?.registerRelatedFilesProvider) {
				for (const syntax of selector.syntax) {
					if (!syntax.language) {
						continue;
					}
					const id = {
						extensionId: 'vscode.typescript-language-features',
						languageId: syntax.language
					};
					relatedAPI.registerRelatedFilesProvider(id, async uri => {
						let document;
						try {
							document = await vscode.workspace.openTextDocument(uri);
						} catch {
							if (!vscode.window.activeTextEditor) {
								vscode.window.showErrorMessage(vscode.l10n.t("Related files provider failed. No active text editor."));
								return { entries: [] };
							}
							// something is REALLY wrong if you can't open the active text editor's document, so don't catch that
							document = await vscode.workspace.openTextDocument(vscode.window.activeTextEditor.document.uri);
						}

						if (!isSupportedLanguageMode(document)) {
							vscode.window.showErrorMessage(vscode.l10n.t("Related files provider failed. Copilot requested file with unsupported language mode."));
							return { entries: [] };
						}

						const file = client.toOpenTsFilePath(document);
						if (!file) {
							return { entries: [] };
						}
						// @ts-expect-error until ts5.7
						const response = await client.execute('copilotRelated', { file, }, nulToken) as Proto.CopilotRelatedResponse;
						if (response.type !== 'response' || !response.body) {
							return { entries: [] };
						}
						return { entries: response.body.relatedFiles.map(f => client.toResource(f)), traits: [] };
					});
				}
			}
		});
		return dummyDisposable;
	});
}
