/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers } from 'vs/base/browser/dnd';
import { addDisposableListener } from 'vs/base/browser/dom';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { createStringDataTransferItem, VSDataTransfer } from 'vs/base/common/dataTransfer';
import { Disposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { generateUuid } from 'vs/base/common/uuid';
import { toVSDataTransfer, UriList } from 'vs/editor/browser/dnd';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService, ResourceEdit } from 'vs/editor/browser/services/bulkEditService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Handler, IEditorContribution, PastePayload } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from 'vs/editor/contrib/editorState/browser/editorState';
import { performSnippetEdit } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SnippetParser } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

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

		const originalDocVersion = model.getVersionId();
		const tokenSource = new EditorStateCancellationTokenSource(this._editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection);

		try {
			const dataTransfer = toVSDataTransfer(e.clipboardData);

			if (metadata?.id && this._currentClipboardItem?.handle === metadata.id) {
				const toMergeDataTransfer = await this._currentClipboardItem.dataTransferPromise;
				toMergeDataTransfer.forEach((value, key) => {
					dataTransfer.replace(key, value);
				});
			}

			if (!dataTransfer.has(Mimes.uriList)) {
				const resources = await this._clipboardService.readResources();
				if (resources.length) {
					dataTransfer.append(Mimes.uriList, createStringDataTransferItem(UriList.create(resources)));
				}
			}

			dataTransfer.delete(vscodeClipboardMime);

			for (const provider of providers) {
				if (!provider.pasteMimeTypes.some(type => {
					if (type.toLowerCase() === DataTransfers.FILES.toLowerCase()) {
						return [...dataTransfer.values()].some(item => item.asFile());
					}
					return dataTransfer.has(type);
				})) {
					continue;
				}

				const edit = await provider.provideDocumentPasteEdits(model, selections, dataTransfer, tokenSource.token);
				if (originalDocVersion !== model.getVersionId()) {
					return;
				}

				if (edit) {
					performSnippetEdit(this._editor, typeof edit.insertText === 'string' ? SnippetParser.escape(edit.insertText) : edit.insertText.snippet, selections);

					if (edit.additionalEdit) {
						await this._bulkEditService.apply(ResourceEdit.convert(edit.additionalEdit), { editor: this._editor });
					}
					return;
				}
			}

			// Default handler
			const textDataTransfer = dataTransfer.get(Mimes.text) ?? dataTransfer.get('text');
			if (!textDataTransfer) {
				return;
			}

			const text = await textDataTransfer.asString();
			if (originalDocVersion !== model.getVersionId()) {
				return;
			}

			this._editor.trigger('keyboard', Handler.Paste, <PastePayload>{
				text: text,
				pasteOnNewLine: metadata?.wasFromEmptySelection,
				multicursorText: null
			});
		} finally {
			tokenSource.dispose();
		}
	}
}
