/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from 'vs/base/browser/dom';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { createStringDataTransferItem, VSDataTransfer } from 'vs/base/common/dataTransfer';
import { Disposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { generateUuid } from 'vs/base/common/uuid';
import { toVSDataTransfer } from 'vs/editor/browser/dnd';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService, ResourceEdit } from 'vs/editor/browser/services/bulkEditService';
import { Selection } from 'vs/editor/common/core/selection';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { DocumentPasteEditProvider, SnippetTextEdit, WorkspaceEdit } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from 'vs/editor/contrib/editorState/browser/editorState';
import { performSnippetEdit } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const vscodeClipboardMime = 'application/vnd.code.copyId';

const defaultPasteEditProvider = new class implements DocumentPasteEditProvider {
	async provideDocumentPasteEdits(model: ITextModel, selection: Selection, dataTransfer: VSDataTransfer, _token: CancellationToken): Promise<WorkspaceEdit | undefined> {
		const textDataTransfer = dataTransfer.get(Mimes.text) ?? dataTransfer.get('text');
		if (textDataTransfer) {
			const text = await textDataTransfer.asString();
			return {
				edits: [{
					resource: model.uri,
					edit: { range: selection, text },
				}]
			};
		}

		return undefined;
	}
};

export class CopyPasteController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.copyPasteActionController';

	public static get(editor: ICodeEditor): CopyPasteController {
		return editor.getContribution<CopyPasteController>(CopyPasteController.ID)!;
	}

	private readonly _editor: ICodeEditor;

	private _currentClipboardItem: undefined | {
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

		this._register(addDisposableListener(container, 'copy', (e: ClipboardEvent) => {
			if (!e.clipboardData) {
				return;
			}

			const model = editor.getModel();
			const selection = this._editor.getSelection();
			if (!model || !selection) {
				return;
			}

			if (!this.arePasteActionsEnabled(model)) {
				return;
			}

			const providers = this._languageFeaturesService.documentPasteEditProvider.ordered(model).filter(x => !!x.prepareDocumentPaste);
			if (!providers.length) {
				return;
			}

			const dataTransfer = toVSDataTransfer(e.clipboardData);

			// Save off a handle pointing to data that VS Code maintains.
			const handle = generateUuid();
			e.clipboardData.setData(vscodeClipboardMime, handle);

			const promise = createCancelablePromise(async token => {
				const results = await Promise.all(providers.map(provider => {
					return provider.prepareDocumentPaste!(model, selection, dataTransfer, token);
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
		}));

		this._register(addDisposableListener(container, 'paste', async (e: ClipboardEvent) => {
			const selection = this._editor.getSelection();
			if (!e.clipboardData || !selection || !editor.hasModel()) {
				return;
			}

			const model = editor.getModel();
			if (!this.arePasteActionsEnabled(model)) {
				return;
			}

			const originalDocVersion = model.getVersionId();

			const providers = this._languageFeaturesService.documentPasteEditProvider.ordered(model);
			if (!providers.length) {
				return;
			}

			const handle = e.clipboardData?.getData(vscodeClipboardMime);
			if (typeof handle !== 'string') {
				return;
			}

			e.preventDefault();
			e.stopImmediatePropagation();

			const tokenSource = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection);

			try {
				const dataTransfer = toVSDataTransfer(e.clipboardData);

				if (handle && this._currentClipboardItem?.handle === handle) {
					const toMergeDataTransfer = await this._currentClipboardItem.dataTransferPromise;
					toMergeDataTransfer.forEach((value, key) => {
						dataTransfer.append(key, value);
					});
				}

				if (!dataTransfer.has(Mimes.uriList)) {
					const resources = await this._clipboardService.readResources();
					if (resources.length) {
						const value = resources.join('\n');
						dataTransfer.append(Mimes.uriList, createStringDataTransferItem(value));
					}
				}

				dataTransfer.delete(vscodeClipboardMime);

				for (const provider of [...providers, defaultPasteEditProvider]) {
					const edit = await provider.provideDocumentPasteEdits(model, selection, dataTransfer, tokenSource.token);
					if (originalDocVersion !== model.getVersionId()) {
						return;
					}

					if (edit) {
						if ((edit as WorkspaceEdit).edits) {
							await this._bulkEditService.apply(ResourceEdit.convert(edit as WorkspaceEdit), { editor });
						} else {
							performSnippetEdit(editor, edit as SnippetTextEdit);
						}
						return;
					}
				}
			} finally {
				tokenSource.dispose();
			}
		}, true));
	}

	public arePasteActionsEnabled(model: ITextModel): boolean {
		return this._configurationService.getValue('editor.experimental.pasteActions.enabled', {
			resource: model.uri
		});
	}
}
