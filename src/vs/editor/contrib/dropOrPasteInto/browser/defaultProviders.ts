/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { UriList, VSDataTransfer } from 'vs/base/common/dataTransfer';
import { Disposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { Schemas } from 'vs/base/common/network';
import { relativePath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { DocumentOnDropEdit, DocumentOnDropEditProvider, DocumentPasteEdit, DocumentPasteEditProvider } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

class DefaultTextProvider implements DocumentOnDropEditProvider, DocumentPasteEditProvider {

	readonly id = 'text';
	readonly dropMimeTypes = [Mimes.text];
	readonly pasteMimeTypes = [Mimes.text];

	async provideDocumentPasteEdits(_model: ITextModel, _ranges: readonly IRange[], dataTransfer: VSDataTransfer, _token: CancellationToken): Promise<DocumentPasteEdit | undefined> {
		return this.getEdit(dataTransfer);
	}

	async provideDocumentOnDropEdits(_model: ITextModel, _position: IPosition, dataTransfer: VSDataTransfer, _token: CancellationToken): Promise<DocumentOnDropEdit | undefined> {
		return this.getEdit(dataTransfer);
	}

	private async getEdit(dataTransfer: VSDataTransfer) {
		const textEntry = dataTransfer.get(Mimes.text);
		if (!textEntry) {
			return;
		}

		// Suppress if there's also a uriList entry.
		// Typically the uri-list contains the same text as the text entry so showing both is confusing.
		if (dataTransfer.has(Mimes.uriList)) {
			return;
		}

		const insertText = await textEntry.asString();
		return {
			label: localize('text.label', "Insert Plain Text"),
			insertText
		};
	}
}

class PathProvider implements DocumentOnDropEditProvider, DocumentPasteEditProvider {

	readonly id = 'uri';
	readonly dropMimeTypes = [Mimes.uriList];
	readonly pasteMimeTypes = [Mimes.uriList];

	async provideDocumentPasteEdits(_model: ITextModel, _ranges: readonly IRange[], dataTransfer: VSDataTransfer, token: CancellationToken): Promise<DocumentPasteEdit | undefined> {
		return this.getEdit(dataTransfer, token);
	}

	async provideDocumentOnDropEdits(_model: ITextModel, _position: IPosition, dataTransfer: VSDataTransfer, token: CancellationToken): Promise<DocumentOnDropEdit | undefined> {
		return this.getEdit(dataTransfer, token);
	}

	private async getEdit(dataTransfer: VSDataTransfer, token: CancellationToken) {
		const entries = await extractUriList(dataTransfer);
		if (!entries.length || token.isCancellationRequested) {
			return;
		}

		let uriCount = 0;
		const insertText = entries
			.map(({ uri, originalText }) => {
				if (uri.scheme === Schemas.file) {
					return uri.fsPath;
				} else {
					uriCount++;
					return originalText;
				}
			})
			.join(' ');

		let label: string;
		if (uriCount > 0) {
			// Dropping at least one generic uri (such as https) so use most generic label
			label = entries.length > 1
				? localize('defaultDropProvider.uriList.uris', "Insert Uris")
				: localize('defaultDropProvider.uriList.uri', "Insert Uri");
		} else {
			// All the paths are file paths
			label = entries.length > 1
				? localize('defaultDropProvider.uriList.paths', "Insert Paths")
				: localize('defaultDropProvider.uriList.path', "Insert Path");
		}

		return { insertText, label };
	}
}

class RelativePathProvider implements DocumentOnDropEditProvider, DocumentPasteEditProvider {

	readonly id = 'relativePath';
	readonly dropMimeTypes = [Mimes.uriList];
	readonly pasteMimeTypes = [Mimes.uriList];

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) { }

	async provideDocumentPasteEdits(_model: ITextModel, _ranges: readonly IRange[], dataTransfer: VSDataTransfer, token: CancellationToken): Promise<DocumentPasteEdit | undefined> {
		return this.getEdit(dataTransfer, token);
	}

	async provideDocumentOnDropEdits(_model: ITextModel, _position: IPosition, dataTransfer: VSDataTransfer, token: CancellationToken): Promise<DocumentOnDropEdit | undefined> {
		return this.getEdit(dataTransfer, token);
	}

	private async getEdit(dataTransfer: VSDataTransfer, token: CancellationToken) {
		const entries = await extractUriList(dataTransfer);
		if (!entries.length || token.isCancellationRequested) {
			return;
		}

		const relativeUris = coalesce(entries.map(({ uri }) => {
			const root = this._workspaceContextService.getWorkspaceFolder(uri);
			return root ? relativePath(root.uri, uri) : undefined;
		}));

		if (!relativeUris.length) {
			return;
		}

		return {
			insertText: relativeUris.join(' '),
			label: entries.length > 1
				? localize('defaultDropProvider.uriList.relativePaths', "Insert Relative Paths")
				: localize('defaultDropProvider.uriList.relativePath', "Insert Relative Path")
		};
	}
}

async function extractUriList(dataTransfer: VSDataTransfer): Promise<{ readonly uri: URI; readonly originalText: string }[]> {
	const urlListEntry = dataTransfer.get(Mimes.uriList);
	if (!urlListEntry) {
		return [];
	}

	const strUriList = await urlListEntry.asString();
	const entries: { readonly uri: URI; readonly originalText: string }[] = [];
	for (const entry of UriList.parse(strUriList)) {
		try {
			entries.push({ uri: URI.parse(entry), originalText: entry });
		} catch {
			// noop
		}
	}
	return entries;
}

export class DefaultDropProvidersFeature extends Disposable {
	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._register(languageFeaturesService.documentOnDropEditProvider.register('*', new DefaultTextProvider()));
		this._register(languageFeaturesService.documentOnDropEditProvider.register('*', new PathProvider()));
		this._register(languageFeaturesService.documentOnDropEditProvider.register('*', new RelativePathProvider(workspaceContextService)));
	}
}

export class DefaultPasteProvidersFeature extends Disposable {
	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new DefaultTextProvider()));
		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new PathProvider()));
		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new RelativePathProvider(workspaceContextService)));
	}
}
