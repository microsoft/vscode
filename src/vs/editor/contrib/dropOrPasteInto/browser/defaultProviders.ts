/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IReadonlyVSDataTransfer, UriList } from '../../../../base/common/dataTransfer.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../base/common/mime.js';
import { Schemas } from '../../../../base/common/network.js';
import { relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IPosition } from '../../../common/core/position.js';
import { IRange } from '../../../common/core/range.js';
import { DocumentDropEditProvider, DocumentDropEditsSession, DocumentPasteContext, DocumentPasteEdit, DocumentPasteEditProvider, DocumentPasteEditsSession, DocumentPasteTriggerKind } from '../../../common/languages.js';
import { LanguageFilter } from '../../../common/languageSelector.js';
import { ITextModel } from '../../../common/model.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';


abstract class SimplePasteAndDropProvider implements DocumentDropEditProvider, DocumentPasteEditProvider {

	readonly kind: HierarchicalKind;
	readonly providedDropEditKinds: HierarchicalKind[];
	readonly providedPasteEditKinds: HierarchicalKind[];

	abstract readonly dropMimeTypes: readonly string[] | undefined;
	readonly copyMimeTypes = [];
	abstract readonly pasteMimeTypes: readonly string[];

	constructor(kind: HierarchicalKind) {
		this.kind = kind;
		this.providedDropEditKinds = [this.kind];
		this.providedPasteEditKinds = [this.kind];
	}

	async provideDocumentPasteEdits(_model: ITextModel, _ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, context: DocumentPasteContext, token: CancellationToken): Promise<DocumentPasteEditsSession | undefined> {
		const edit = await this.getEdit(dataTransfer, token);
		if (!edit) {
			return undefined;
		}

		return {
			edits: [{ insertText: edit.insertText, title: edit.title, kind: edit.kind, handledMimeType: edit.handledMimeType, yieldTo: edit.yieldTo }],
			dispose() { },
		};
	}

	async provideDocumentDropEdits(_model: ITextModel, _position: IPosition, dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<DocumentDropEditsSession | undefined> {
		const edit = await this.getEdit(dataTransfer, token);
		if (!edit) {
			return;
		}
		return {
			edits: [{ insertText: edit.insertText, title: edit.title, kind: edit.kind, handledMimeType: edit.handledMimeType, yieldTo: edit.yieldTo }],
			dispose() { },
		};
	}

	protected abstract getEdit(dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<DocumentPasteEdit | undefined>;
}

export class DefaultTextPasteOrDropEditProvider extends SimplePasteAndDropProvider {

	static readonly id = 'text';

	readonly id = DefaultTextPasteOrDropEditProvider.id;
	readonly dropMimeTypes = [Mimes.text];
	readonly pasteMimeTypes = [Mimes.text];

	constructor() {
		super(HierarchicalKind.Empty.append('text', 'plain'));
	}

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

	readonly dropMimeTypes = [Mimes.uriList];
	readonly pasteMimeTypes = [Mimes.uriList];

	constructor() {
		super(HierarchicalKind.Empty.append('uri', 'path', 'absolute'));
	}

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

	readonly dropMimeTypes = [Mimes.uriList];
	readonly pasteMimeTypes = [Mimes.uriList];

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) {
		super(HierarchicalKind.Empty.append('uri', 'path', 'relative'));
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
	public readonly providedPasteEditKinds = [this.kind];

	public readonly copyMimeTypes = [];
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

const genericLanguageSelector: LanguageFilter = { scheme: '*', hasAccessToAllModels: true };

export class DefaultDropProvidersFeature extends Disposable {
	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._register(languageFeaturesService.documentDropEditProvider.register(genericLanguageSelector, new DefaultTextPasteOrDropEditProvider()));
		this._register(languageFeaturesService.documentDropEditProvider.register(genericLanguageSelector, new PathProvider()));
		this._register(languageFeaturesService.documentDropEditProvider.register(genericLanguageSelector, new RelativePathProvider(workspaceContextService)));
	}
}

export class DefaultPasteProvidersFeature extends Disposable {
	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._register(languageFeaturesService.documentPasteEditProvider.register(genericLanguageSelector, new DefaultTextPasteOrDropEditProvider()));
		this._register(languageFeaturesService.documentPasteEditProvider.register(genericLanguageSelector, new PathProvider()));
		this._register(languageFeaturesService.documentPasteEditProvider.register(genericLanguageSelector, new RelativePathProvider(workspaceContextService)));
		this._register(languageFeaturesService.documentPasteEditProvider.register(genericLanguageSelector, new PasteHtmlProvider()));
	}
}
