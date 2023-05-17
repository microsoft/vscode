/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IReadonlyVSDataTransfer, UriList } from 'vs/base/common/dataTransfer';
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

const builtInLabel = localize('builtIn', 'Built-in');

abstract class SimplePasteAndDropProvider implements DocumentOnDropEditProvider, DocumentPasteEditProvider {

	abstract readonly id: string;
	abstract readonly dropMimeTypes: readonly string[] | undefined;
	abstract readonly pasteMimeTypes: readonly string[];

	async provideDocumentPasteEdits(_model: ITextModel, _ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<DocumentPasteEdit | undefined> {
		const edit = await this.getEdit(dataTransfer, token);
		return edit ? { id: this.id, insertText: edit.insertText, label: edit.label, detail: edit.detail, priority: edit.priority } : undefined;
	}

	async provideDocumentOnDropEdits(_model: ITextModel, _position: IPosition, dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<DocumentOnDropEdit | undefined> {
		const edit = await this.getEdit(dataTransfer, token);
		return edit ? { id: this.id, insertText: edit.insertText, label: edit.label, priority: edit.priority } : undefined;
	}

	protected abstract getEdit(dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<DocumentPasteEdit | undefined>;
}

class DefaultTextProvider extends SimplePasteAndDropProvider {

	readonly id = 'text';
	readonly dropMimeTypes = [Mimes.text];
	readonly pasteMimeTypes = [Mimes.text];

	protected async getEdit(dataTransfer: IReadonlyVSDataTransfer, _token: CancellationToken) {
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
			id: this.id,
			priority: 0,
			label: localize('text.label', "Insert Plain Text"),
			detail: builtInLabel,
			insertText
		};
	}
}

class PathProvider extends SimplePasteAndDropProvider {

	readonly id = 'uri';
	readonly dropMimeTypes = [Mimes.uriList];
	readonly pasteMimeTypes = [Mimes.uriList];

	protected async getEdit(dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken) {
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

		return {
			id: this.id,
			priority: 0,
			insertText,
			label,
			detail: builtInLabel,
		};
	}
}

class RelativePathProvider extends SimplePasteAndDropProvider {

	readonly id = 'relativePath';
	readonly dropMimeTypes = [Mimes.uriList];
	readonly pasteMimeTypes = [Mimes.uriList];

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) {
		super();
	}

	protected async getEdit(dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken) {
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
			id: this.id,
			priority: 0,
			insertText: relativeUris.join(' '),
			label: entries.length > 1
				? localize('defaultDropProvider.uriList.relativePaths', "Insert Relative Paths")
				: localize('defaultDropProvider.uriList.relativePath', "Insert Relative Path"),
			detail: builtInLabel,
		};
	}
}

async function extractUriList(dataTransfer: IReadonlyVSDataTransfer): Promise<{ readonly uri: URI; readonly originalText: string }[]> {
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
