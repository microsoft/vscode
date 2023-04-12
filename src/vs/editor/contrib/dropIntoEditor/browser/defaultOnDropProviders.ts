/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { UriList, VSDataTransfer } from 'vs/base/common/dataTransfer';
import { Mimes } from 'vs/base/common/mime';
import { Schemas } from 'vs/base/common/network';
import { relativePath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IPosition } from 'vs/editor/common/core/position';
import { DocumentOnDropEdit, DocumentOnDropEditProvider } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

class DefaultTextDropProvider implements DocumentOnDropEditProvider {

	readonly id = 'text';
	readonly dropMimeTypes = [Mimes.text, 'text'];

	async provideDocumentOnDropEdits(_model: ITextModel, _position: IPosition, dataTransfer: VSDataTransfer, _token: CancellationToken): Promise<DocumentOnDropEdit | undefined> {
		const textEntry = dataTransfer.get('text') ?? dataTransfer.get(Mimes.text);
		if (textEntry) {
			const text = await textEntry.asString();
			return {
				label: localize('defaultDropProvider.text.label', "Drop as plain text"),
				insertText: text
			};
		}

		return undefined;
	}
}

class DefaultUriListDropProvider implements DocumentOnDropEditProvider {

	readonly id = 'uri';
	readonly dropMimeTypes = [Mimes.uriList];

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) { }

	async provideDocumentOnDropEdits(_model: ITextModel, _position: IPosition, dataTransfer: VSDataTransfer, _token: CancellationToken): Promise<DocumentOnDropEdit | undefined> {
		const urlListEntry = dataTransfer.get(Mimes.uriList);
		if (urlListEntry) {
			const urlList = await urlListEntry.asString();
			const entry = this.getUriListInsertText(urlList);
			if (entry) {
				return {
					label: entry.count > 1
						? localize('defaultDropProvider.uri.label', "Drop as uri")
						: localize('defaultDropProvider.uriList.label', "Drop as uri list"),
					insertText: entry.snippet
				};
			}
		}

		return undefined;
	}

	private getUriListInsertText(strUriList: string): { snippet: string; count: number } | undefined {
		const entries: { readonly uri: URI; readonly originalText: string }[] = [];
		for (const entry of UriList.parse(strUriList)) {
			try {
				entries.push({ uri: URI.parse(entry), originalText: entry });
			} catch {
				// noop
			}
		}

		if (!entries.length) {
			return;
		}

		const snippet = entries
			.map(({ uri, originalText }) => {
				const root = this._workspaceContextService.getWorkspaceFolder(uri);
				if (root) {
					const rel = relativePath(root.uri, uri);
					if (rel) {
						return rel;
					}
				}

				return uri.scheme === Schemas.file ? uri.fsPath : originalText;
			})
			.join(' ');

		return { snippet, count: entries.length };
	}
}


let registeredDefaultProviders = false;
export function registerDefaultDropProviders(
	languageFeaturesService: ILanguageFeaturesService,
	workspaceContextService: IWorkspaceContextService,
) {
	if (!registeredDefaultProviders) {
		registeredDefaultProviders = true;

		languageFeaturesService.documentOnDropEditProvider.register('*', new DefaultTextDropProvider());
		languageFeaturesService.documentOnDropEditProvider.register('*', new DefaultUriListDropProvider(workspaceContextService));
	}
}
