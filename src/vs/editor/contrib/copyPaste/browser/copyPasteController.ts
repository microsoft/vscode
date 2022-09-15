/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers } from 'vs/base/browser/dnd';
import { addDisposableListener } from 'vs/base/browser/dom';
import { CancelablePromise, createCancelablePromise, raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { createStringDataTransferItem, VSDataTransfer } from 'vs/base/common/dataTransfer';
import { Disposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { generateUuid } from 'vs/base/common/uuid';
import { toVSDataTransfer, UriList } from 'vs/editor/browser/dnd';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { Handler, IEditorContribution, PastePayload } from 'vs/editor/common/editorCommon';
import { DocumentPasteEdit, DocumentPasteEditProvider } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from 'vs/editor/contrib/editorState/browser/editorState';
import { performSnippetEdit } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SnippetParser } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';

const vscodeClipboardMime = 'application/vnd.code.copyMetadata';

interface CopyMetadata {
	readonly id?: string;
	readonly wasFromEmptySelection: boolean;
}

export class CopyPasteController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.copyPasteActionController';

	public static get(editor: ICodeEditor): CopyPasteController {
		return editor.getContribution<CopyPasteController>(CopyPasteController.ID)!;
	}

	private readonly _editor: ICodeEditor;

	private _currentClipboardItem?: {
		readonly handle: string;
		readonly dataTransferPromise: CancelablePromise<VSDataTransfer>;
	};

	constructor(
		editor: ICodeEditor,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IProgressService private readonly _progressService: IProgressService,
	) {
		super();

		this._editor = editor;

		const container = editor.getContainerDomNode();
		this._register(addDisposableListener(container, 'copy', e => this.handleCopy(e)));
		this._register(addDisposableListener(container, 'cut', e => this.handleCopy(e)));
		this._register(addDisposableListener(container, 'paste', e => this.handlePaste(e), true));
	}

	private arePasteActionsEnabled(model: ITextModel): boolean {
		return this._configurationService.getValue('editor.experimental.pasteActions.enabled', {
			resource: model.uri
		});
	}

	private handleCopy(e: ClipboardEvent) {
		if (!e.clipboardData || !this._editor.hasTextFocus()) {
			return;
		}

		const model = this._editor.getModel();
		const selections = this._editor.getSelections();
		if (!model || !selections?.length) {
			return;
		}

		if (!this.arePasteActionsEnabled(model)) {
			return;
		}

		const ranges: IRange[] = [...selections];
		const primarySelection = selections[0];
		const wasFromEmptySelection = primarySelection.isEmpty();
		if (wasFromEmptySelection) {
			if (!this._editor.getOption(EditorOption.emptySelectionClipboard)) {
				return;
			}
			ranges[0] = new Range(primarySelection.startLineNumber, 0, primarySelection.startLineNumber, model.getLineLength(primarySelection.startLineNumber));
		}

		const providers = this._languageFeaturesService.documentPasteEditProvider.ordered(model).filter(x => !!x.prepareDocumentPaste);
		if (!providers.length) {
			this.setCopyMetadata(e.clipboardData, { wasFromEmptySelection });
			return;
		}

		const dataTransfer = toVSDataTransfer(e.clipboardData);

		// Save off a handle pointing to data that VS Code maintains.
		const handle = generateUuid();
		this.setCopyMetadata(e.clipboardData, {
			id: handle,
			wasFromEmptySelection,
		});

		const promise = createCancelablePromise(async token => {
			const results = await Promise.all(providers.map(provider => {
				return provider.prepareDocumentPaste!(model, ranges, dataTransfer, token);
			}));

			for (const result of results) {
				result?.forEach((value, key) => {
					dataTransfer.replace(key, value);
				});
			}

			return dataTransfer;
		});

		this._currentClipboardItem?.dataTransferPromise.cancel();
		this._currentClipboardItem = { handle: handle, dataTransferPromise: promise };
	}

	private setCopyMetadata(dataTransfer: DataTransfer, metadata: CopyMetadata) {
		dataTransfer.setData(vscodeClipboardMime, JSON.stringify(metadata));
	}

	private async handlePaste(e: ClipboardEvent) {
		if (!e.clipboardData || !this._editor.hasTextFocus()) {
			return;
		}

		const selections = this._editor.getSelections();
		if (!selections?.length || !this._editor.hasModel()) {
			return;
		}

		const model = this._editor.getModel();
		if (!this.arePasteActionsEnabled(model)) {
			return;
		}

		let metadata: CopyMetadata | undefined;
		const rawMetadata = e.clipboardData?.getData(vscodeClipboardMime);
		if (rawMetadata && typeof rawMetadata === 'string') {
			metadata = JSON.parse(rawMetadata);
		}

		const providers = this._languageFeaturesService.documentPasteEditProvider.ordered(model);
		if (!providers.length) {
			return;
		}

		e.preventDefault();
		e.stopImmediatePropagation();

		const tokenSource = new EditorStateCancellationTokenSource(this._editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection);
		try {
			const dataTransfer = toVSDataTransfer(e.clipboardData);

			if (metadata?.id && this._currentClipboardItem?.handle === metadata.id) {
				const toMergeDataTransfer = await this._currentClipboardItem.dataTransferPromise;
				if (tokenSource.token.isCancellationRequested) {
					return;
				}

				toMergeDataTransfer.forEach((value, key) => {
					dataTransfer.replace(key, value);
				});
			}

			if (!dataTransfer.has(Mimes.uriList)) {
				const resources = await this._clipboardService.readResources();
				if (tokenSource.token.isCancellationRequested) {
					return;
				}

				if (resources.length) {
					dataTransfer.append(Mimes.uriList, createStringDataTransferItem(UriList.create(resources)));
				}
			}

			dataTransfer.delete(vscodeClipboardMime);

			const providerEdit = await this._progressService.withProgress({
				location: ProgressLocation.Notification,
				delay: 750,
				title: localize('pasteProgressTitle', "Running paste handlers..."),
				cancellable: true,
			}, () => {
				return this.getProviderPasteEdit(providers, dataTransfer, model, selections, tokenSource.token);
			}, () => {
				return tokenSource.cancel();
			});

			if (tokenSource.token.isCancellationRequested) {
				return;
			}

			if (providerEdit) {
				performSnippetEdit(this._editor, typeof providerEdit.insertText === 'string' ? SnippetParser.escape(providerEdit.insertText) : providerEdit.insertText.snippet, selections);

				if (providerEdit.additionalEdit) {
					await this._bulkEditService.apply(providerEdit.additionalEdit, { editor: this._editor });
				}
				return;
			}

			await this.applyDefaultPasteHandler(dataTransfer, metadata, tokenSource.token);
		} finally {
			tokenSource.dispose();
		}
	}

	private getProviderPasteEdit(providers: DocumentPasteEditProvider[], dataTransfer: VSDataTransfer, model: ITextModel, selections: Selection[], token: CancellationToken): Promise<DocumentPasteEdit | undefined> {
		return raceCancellation((async () => {
			for (const provider of providers) {
				if (token.isCancellationRequested) {
					return;
				}

				if (!isSupportedProvider(provider, dataTransfer)) {
					continue;
				}

				const edit = await provider.provideDocumentPasteEdits(model, selections, dataTransfer, token);
				if (edit) {
					return edit;
				}
			}
			return undefined;
		})(), token);
	}

	private async applyDefaultPasteHandler(dataTransfer: VSDataTransfer, metadata: CopyMetadata | undefined, token: CancellationToken) {
		const textDataTransfer = dataTransfer.get(Mimes.text) ?? dataTransfer.get('text');
		if (!textDataTransfer) {
			return;
		}

		const text = await textDataTransfer.asString();
		if (token.isCancellationRequested) {
			return;
		}

		this._editor.trigger('keyboard', Handler.Paste, <PastePayload>{
			text: text,
			pasteOnNewLine: metadata?.wasFromEmptySelection,
			multicursorText: null
		});
	}
}

function isSupportedProvider(provider: DocumentPasteEditProvider, dataTransfer: VSDataTransfer): boolean {
	return provider.pasteMimeTypes.some(type => {
		if (type.toLowerCase() === DataTransfers.FILES.toLowerCase()) {
			return [...dataTransfer.values()].some(item => item.asFile());
		}
		return dataTransfer.has(type);
	});
}
