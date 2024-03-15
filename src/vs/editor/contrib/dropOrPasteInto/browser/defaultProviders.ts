/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IReadonlyVSDataTransfer, UriList } from 'vs/base/common/dataTransfer';
import { HierarchicalKind } from 'vs/base/common/hierarchicalKind';
import { Disposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { Schemas } from 'vs/base/common/network';
import { relativePath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { DocumentOnDropEdit, DocumentOnDropEditProvider, DocumentPasteContext, DocumentPasteEdit, DocumentPasteEditProvider, DocumentPasteEditsSession, DocumentPasteTriggerKind } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';


abstract class SimplePasteAndDropProvider implements DocumentOnDropEditProvider, DocumentPasteEditProvider {

	abstract readonly kind: HierarchicalKind;
	abstract readonly dropMimeTypes: readonly string[] | undefined;
	abstract readonly pasteMimeTypes: readonly string[];

	async provideDocumentPasteEdits(_model: ITextModel, _ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, context: DocumentPasteContext, token: CancellationToken): Promise<DocumentPasteEditsSession | undefined> {
		const edit = await this.getEdit(dataTransfer, token);
		if (!edit) {
			return undefined;
		}

		return {
			dispose() { },
			edits: [{ insertText: edit.insertText, title: edit.title, kind: edit.kind, handledMimeType: edit.handledMimeType, yieldTo: edit.yieldTo }]
		};
	}

	async provideDocumentOnDropEdits(_model: ITextModel, _position: IPosition, dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<DocumentOnDropEdit[] | undefined> {
		const edit = await this.getEdit(dataTransfer, token);
		return edit ? [{ insertText: edit.insertText, title: edit.title, kind: edit.kind, handledMimeType: edit.handledMimeType, yieldTo: edit.yieldTo }] : undefined;
	}

	protected abstract getEdit(dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<DocumentPasteEdit | undefined>;
}

export class DefaultTextPasteOrDropEditProvider extends SimplePasteAndDropProvider {

	static readonly id = 'text';
	static readonly kind = new HierarchicalKind('text.plain');

	readonly id = DefaultTextPasteOrDropEditProvider.id;
	readonly kind = DefaultTextPasteOrDropEditProvider.kind;
	readonly dropMimeTypes = [Mimes.text];
	readonly pasteMimeTypes = [Mimes.text];

	protected async getEdit(dataTransfer: IReadonlyVSDataTransfer, _token: CancellationToken): Promise<DocumentPasteEdit | undefined> {
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
			handledMimeType: Mimes.text,
			title: localize('text.label', "Insert Plain Text"),
			insertText,
			kind: this.kind,
		};
	}
}

class PathProvider extends SimplePasteAndDropProvider {

	readonly kind = new HierarchicalKind('uri.absolute');
	readonly dropMimeTypes = [Mimes.uriList];
	readonly pasteMimeTypes = [Mimes.uriList];

	protected async getEdit(dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<DocumentPasteEdit | undefined> {
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
			handledMimeType: Mimes.uriList,
			insertText,
			title: label,
			kind: this.kind,
		};
	}
}

class RelativePathProvider extends SimplePasteAndDropProvider {

	readonly kind = new HierarchicalKind('uri.relative');
	readonly dropMimeTypes = [Mimes.uriList];
	readonly pasteMimeTypes = [Mimes.uriList];

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) {
		super();
	}

	protected async getEdit(dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<DocumentPasteEdit | undefined> {
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
			handledMimeType: Mimes.uriList,
			insertText: relativeUris.join(' '),
			title: entries.length > 1
				? localize('defaultDropProvider.uriList.relativePaths', "Insert Relative Paths")
				: localize('defaultDropProvider.uriList.relativePath', "Insert Relative Path"),
			kind: this.kind,
		};
	}
}

class PasteHtmlProvider implements DocumentPasteEditProvider {

	public readonly kind = new HierarchicalKind('html');

	public readonly pasteMimeTypes = ['text/html'];

	private readonly _yieldTo = [{ mimeType: Mimes.text }];

	async provideDocumentPasteEdits(_model: ITextModel, _ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, context: DocumentPasteContext, token: CancellationToken): Promise<DocumentPasteEditsSession | undefined> {
		if (context.triggerKind !== DocumentPasteTriggerKind.PasteAs && !context.only?.contains(this.kind)) {
			return;
		}

		const entry = dataTransfer.get('text/html');
		const htmlText = await entry?.asString();
		if (!htmlText || token.isCancellationRequested) {
			return;
		}

		return {
			dispose() { },
			edits: [{
				insertText: htmlText,
				yieldTo: this._yieldTo,
				title: localize('pasteHtmlLabel', 'Insert HTML'),
				kind: this.kind,
			}],
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

		this._register(languageFeaturesService.documentOnDropEditProvider.register('*', new DefaultTextPasteOrDropEditProvider()));
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

		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new DefaultTextPasteOrDropEditProvider()));
		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new PathProvider()));
		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new RelativePathProvider(workspaceContextService)));
		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new PasteHtmlProvider()));
	}
}
