/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from 'vs/base/browser/dom';
import { coalesce } from 'vs/base/common/arrays';
import { CancelablePromise, createCancelablePromise, raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { UriList, VSDataTransfer, createStringDataTransferItem, matchesMimeType } from 'vs/base/common/dataTransfer';
import { Disposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import * as platform from 'vs/base/common/platform';
import { generateUuid } from 'vs/base/common/uuid';
import { toExternalVSDataTransfer, toVSDataTransfer } from 'vs/editor/browser/dnd';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { Handler, IEditorContribution, PastePayload } from 'vs/editor/common/editorCommon';
import { DocumentPasteEdit, DocumentPasteEditProvider } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from 'vs/editor/contrib/editorState/browser/editorState';
import { InlineProgressManager } from 'vs/editor/contrib/inlineProgress/browser/inlineProgress';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { PostEditWidgetManager } from './postEditWidget';

export const changePasteTypeCommandId = 'editor.changePasteType';

export const pasteWidgetVisibleCtx = new RawContextKey<boolean>('pasteWidgetVisible', false, localize('pasteWidgetVisible', "Whether the paste widget is showing"));

const vscodeClipboardMime = 'application/vnd.code.copyMetadata';

interface CopyMetadata {
	readonly id?: string;
	readonly providerCopyMimeTypes?: readonly string[];

	readonly defaultPastePayload: Omit<PastePayload, 'text'>;
}

export class CopyPasteController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.copyPasteActionController';

	public static get(editor: ICodeEditor): CopyPasteController {
		return editor.getContribution<CopyPasteController>(CopyPasteController.ID)!;
	}

	private readonly _editor: ICodeEditor;

	private _currentCopyOperation?: {
		readonly handle: string;
		readonly dataTransferPromise: CancelablePromise<VSDataTransfer>;
	};

	private _currentPasteOperation?: CancelablePromise<void>;

	private readonly _pasteProgressManager: InlineProgressManager;
	private readonly _postPasteWidgetManager: PostEditWidgetManager;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
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
	}

	public changePasteType() {
		this._postPasteWidgetManager.tryShowSelector();
	}

	public clearWidgets() {
		this._postPasteWidgetManager.clear();
	}

	private isPasteAsEnabled(): boolean {
		return this._editor.getOption(EditorOption.pasteAs).enabled
			&& !this._editor.getOption(EditorOption.readOnly);
	}

	private handleCopy(e: ClipboardEvent) {
		if (!e.clipboardData || !this._editor.hasTextFocus() || !this.isPasteAsEnabled()) {
			return;
		}

		const model = this._editor.getModel();
		const selections = this._editor.getSelections();
		if (!model || !selections?.length) {
			return;
		}

		const enableEmptySelectionClipboard = this._editor.getOption(EditorOption.emptySelectionClipboard);

		let ranges: readonly IRange[] = selections;
		const wasFromEmptySelection = selections.length === 1 && selections[0].isEmpty();
		if (wasFromEmptySelection) {
			if (!enableEmptySelectionClipboard) {
				return;
			}

			ranges = ranges.map(range => new Range(range.startLineNumber, 0, range.startLineNumber, model.getLineLength(range.startLineNumber)));
		}

		const toCopy = this._editor._getViewModel()?.getPlainTextToCopy(selections, enableEmptySelectionClipboard, platform.isWindows);
		const multicursorText = Array.isArray(toCopy) ? toCopy : null;

		const defaultPastePayload = {
			multicursorText,
			pasteOnNewLine: wasFromEmptySelection,
			mode: null
		};

		const providers = this._languageFeaturesService.documentPasteEditProvider
			.ordered(model)
			.filter(x => !!x.prepareDocumentPaste);
		if (!providers.length) {
			this.setCopyMetadata(e.clipboardData, { defaultPastePayload });
			return;
		}

		const dataTransfer = toVSDataTransfer(e.clipboardData);
		const providerCopyMimeTypes = providers.flatMap(x => x.copyMimeTypes ?? []);

		// Save off a handle pointing to data that VS Code maintains.
		const handle = generateUuid();
		this.setCopyMetadata(e.clipboardData, {
			id: handle,
			providerCopyMimeTypes,
			defaultPastePayload
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

		this._currentCopyOperation?.dataTransferPromise.cancel();
		this._currentCopyOperation = { handle: handle, dataTransferPromise: promise };
	}

	private async handlePaste(e: ClipboardEvent) {
		if (!e.clipboardData || !this._editor.hasTextFocus()) {
			return;
		}

		this._currentPasteOperation?.cancel();
		this._currentPasteOperation = undefined;

		const model = this._editor.getModel();
		const selections = this._editor.getSelections();
		if (!selections?.length || !model) {
			return;
		}

		if (!this.isPasteAsEnabled()) {
			return;
		}

		const metadata = this.fetchCopyMetadata(e.clipboardData);
		const dataTransfer = toExternalVSDataTransfer(e.clipboardData);
		dataTransfer.delete(vscodeClipboardMime);

		const allPotentialMimeTypes = [
			...e.clipboardData.types,
			...metadata?.providerCopyMimeTypes ?? [],
			// TODO: always adds `uri-list` because this get set if there are resources in the system clipboard.
			// However we can only check the system clipboard async. For this early check, just add it in.
			// We filter providers again once we have the final dataTransfer we will use.
			Mimes.uriList,
		];

		const allProviders = this._languageFeaturesService.documentPasteEditProvider
			.ordered(model)
			.filter(provider => provider.pasteMimeTypes.some(type => matchesMimeType(type, allPotentialMimeTypes)));
		if (!allProviders.length) {
			return;
		}

		// Prevent the editor's default paste handler from running.
		// Note that after this point, we are fully responsible for handling paste.
		// If we can't provider a paste for any reason, we need to explicitly delegate pasting back to the editor.
		e.preventDefault();
		e.stopImmediatePropagation();

		const p = createCancelablePromise(async (token) => {
			const editor = this._editor;
			if (!editor.hasModel()) {
				return;
			}

			const tokenSource = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection, undefined, token);
			try {
				await this.mergeInDataFromCopy(dataTransfer, metadata, tokenSource.token);
				if (tokenSource.token.isCancellationRequested) {
					return;
				}

				// Filter out any providers the don't match the full data transfer we will send them.
				const supportedProviders = allProviders.filter(provider => isSupportedProvider(provider, dataTransfer));
				if (!supportedProviders.length
					|| (supportedProviders.length === 1 && supportedProviders[0].id === 'text') // Only our default text provider is active
				) {
					await this.applyDefaultPasteHandler(dataTransfer, metadata, tokenSource.token);
					return;
				}

				const providerEdits = await this.getPasteEdits(supportedProviders, dataTransfer, model, selections, tokenSource.token);
				if (tokenSource.token.isCancellationRequested) {
					return;
				}

				if (providerEdits.length) {
					const canShowWidget = editor.getOption(EditorOption.pasteAs).showPasteSelector === 'afterPaste';
					return this._postPasteWidgetManager.applyEditAndShowIfNeeded(selections, { activeEditIndex: 0, allEdits: providerEdits }, canShowWidget, tokenSource.token);
				}

				await this.applyDefaultPasteHandler(dataTransfer, metadata, tokenSource.token);
			} finally {
				tokenSource.dispose();
				if (this._currentPasteOperation === p) {
					this._currentPasteOperation = undefined;
				}
			}
		});

		this._pasteProgressManager.showWhile(selections[0].getEndPosition(), localize('pasteIntoEditorProgress', "Running paste handlers. Click to cancel"), p);
		this._currentPasteOperation = p;
	}

	private setCopyMetadata(dataTransfer: DataTransfer, metadata: CopyMetadata) {
		dataTransfer.setData(vscodeClipboardMime, JSON.stringify(metadata));
	}

	private fetchCopyMetadata(dataTransfer: DataTransfer): CopyMetadata | undefined {
		const rawMetadata = dataTransfer.getData(vscodeClipboardMime);
		if (rawMetadata) {
			try {
				return JSON.parse(rawMetadata);
			} catch {
				return undefined;
			}
		}
		return undefined;
	}

	private async mergeInDataFromCopy(dataTransfer: VSDataTransfer, metadata: CopyMetadata | undefined, token: CancellationToken): Promise<void> {
		if (metadata?.id && this._currentCopyOperation?.handle === metadata.id) {
			const toMergeDataTransfer = await this._currentCopyOperation.dataTransferPromise;
			if (token.isCancellationRequested) {
				return;
			}

			toMergeDataTransfer.forEach((value, key) => {
				dataTransfer.replace(key, value);
			});
		}

		if (!dataTransfer.has(Mimes.uriList)) {
			const resources = await this._clipboardService.readResources();
			if (token.isCancellationRequested) {
				return;
			}

			if (resources.length) {
				dataTransfer.append(Mimes.uriList, createStringDataTransferItem(UriList.create(resources)));
			}
		}
	}

	private async getPasteEdits(providers: readonly DocumentPasteEditProvider[], dataTransfer: VSDataTransfer, model: ITextModel, selections: Selection[], token: CancellationToken): Promise<DocumentPasteEdit[]> {
		const result = await raceCancellation(
			Promise.all(
				providers.map(provider => provider.provideDocumentPasteEdits(model, selections, dataTransfer, token))
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

		const payload: PastePayload = {
			text,
			pasteOnNewLine: metadata?.defaultPastePayload.pasteOnNewLine ?? false,
			multicursorText: metadata?.defaultPastePayload.multicursorText ?? null,
			mode: null,
		};
		this._editor.trigger('keyboard', Handler.Paste, payload);
	}
}

function isSupportedProvider(provider: DocumentPasteEditProvider, dataTransfer: VSDataTransfer): boolean {
	return provider.pasteMimeTypes.some(type => dataTransfer.matches(type));
}
