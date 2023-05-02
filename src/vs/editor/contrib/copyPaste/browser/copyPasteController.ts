/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from 'vs/base/browser/dom';
import { coalesce } from 'vs/base/common/arrays';
import { CancelablePromise, createCancelablePromise, raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { UriList, VSDataTransfer, createStringDataTransferItem } from 'vs/base/common/dataTransfer';
import { Disposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { Schemas } from 'vs/base/common/network';
import { generateUuid } from 'vs/base/common/uuid';
import { toVSDataTransfer } from 'vs/editor/browser/dnd';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { Handler, IEditorContribution, PastePayload } from 'vs/editor/common/editorCommon';
import { DocumentPasteEdit, DocumentPasteEditProvider } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { registerDefaultPasteProviders } from 'vs/editor/contrib/copyPaste/browser/defaultPasteProviders';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from 'vs/editor/contrib/editorState/browser/editorState';
import { InlineProgressManager } from 'vs/editor/contrib/inlineProgress/browser/inlineProgress';
import { PostEditWidgetManager } from 'vs/editor/contrib/postEditWidget/browser/postEditWidget';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export const changePasteTypeCommandId = 'editor.changePasteType';

export const pasteWidgetVisibleCtx = new RawContextKey<boolean>('pasteWidgetVisible', false, localize('pasteWidgetVisible', "Whether the paste widget is showing"));

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

	private _currentOperation?: CancelablePromise<void>;

	private readonly _pasteProgressManager: InlineProgressManager;
	private readonly _postPasteWidgetManager: PostEditWidgetManager;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
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

		this._pasteProgressManager = this._register(new InlineProgressManager('pasteIntoEditor', editor, instantiationService));

		this._postPasteWidgetManager = this._register(instantiationService.createInstance(PostEditWidgetManager, 'pasteIntoEditor', editor, pasteWidgetVisibleCtx, { id: changePasteTypeCommandId, label: localize('postPasteWidgetTitle', "Show paste options...") }));

		registerDefaultPasteProviders(_languageFeaturesService);
	}

	public changePasteType() {
		this._postPasteWidgetManager.tryShowSelector();
	}

	public clearWidgets() {
		this._postPasteWidgetManager.clear();
	}

	private arePasteActionsEnabled(model: ITextModel): boolean {
		if (this._configurationService.getValue('editor.experimental.pasteActions.enabled', { resource: model.uri })) {
			return true;
		}

		// TODO: This check is only here to support enabling `ipynb.pasteImagesAsAttachments.enabled` by default
		return model.uri.scheme === Schemas.vscodeNotebookCell;
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

		this._currentOperation?.cancel();

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

		const p = createCancelablePromise(async (token) => {
			const editor = this._editor;
			if (!editor.hasModel()) {
				return;
			}

			const tokenSource = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection, undefined, token);
			try {
				const dataTransfer = toVSDataTransfer(e.clipboardData!);

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

				const providerEdits = await this.getPasteEdits(providers, dataTransfer, model, selections, tokenSource.token);
				if (tokenSource.token.isCancellationRequested) {
					return;
				}

				if (providerEdits.length) {
					return this._postPasteWidgetManager.applyEditAndShowIfNeeded(selections[0], { activeEditIndex: 0, allEdits: providerEdits }, tokenSource.token);
				}

				await this.applyDefaultPasteHandler(dataTransfer, metadata, tokenSource.token);
			} finally {
				tokenSource.dispose();
				if (this._currentOperation === p) {
					this._currentOperation = undefined;
				}
			}
		});

		this._pasteProgressManager.showWhile(selections[0].getEndPosition(), localize('pasteIntoEditorProgress', "Running paste handlers. Click to cancel"), p);
		this._currentOperation = p;
	}

	private async getPasteEdits(providers: readonly DocumentPasteEditProvider[], dataTransfer: VSDataTransfer, model: ITextModel, selections: Selection[], token: CancellationToken): Promise<DocumentPasteEdit[]> {
		const result = await raceCancellation(
			Promise.all(
				providers
					.filter(provider => isSupportedProvider(provider, dataTransfer))
					.map(provider => provider.provideDocumentPasteEdits(model, selections, dataTransfer, token))
			).then(coalesce),
			token);
		return result ?? [];
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
	return provider.pasteMimeTypes.some(type => dataTransfer.matches(type));
}
