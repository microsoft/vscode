/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveDocument } from 'vs/base/browser/dom';
import { coalesce } from 'vs/base/common/arrays';
import { CancelablePromise, createCancelablePromise, DeferredPromise, raceCancellation } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { UriList, VSDataTransfer, createStringDataTransferItem, matchesMimeType } from 'vs/base/common/dataTransfer';
import { HierarchicalKind } from 'vs/base/common/hierarchicalKind';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import * as platform from 'vs/base/common/platform';
import { generateUuid } from 'vs/base/common/uuid';
import { ClipboardEventUtils } from 'vs/editor/browser/controller/textAreaInput';
import { toExternalVSDataTransfer, toVSDataTransfer } from 'vs/editor/browser/dnd';
import { ICodeEditor, PastePayload } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { Handler, IEditorContribution } from 'vs/editor/common/editorCommon';
import { DocumentPasteContext, DocumentPasteEdit, DocumentPasteEditProvider, DocumentPasteTriggerKind } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { DefaultTextPasteOrDropEditProvider } from 'vs/editor/contrib/dropOrPasteInto/browser/defaultProviders';
import { createCombinedWorkspaceEdit, sortEditsByYieldTo } from 'vs/editor/contrib/dropOrPasteInto/browser/edit';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from 'vs/editor/contrib/editorState/browser/editorState';
import { InlineProgressManager } from 'vs/editor/contrib/inlineProgress/browser/inlineProgress';
import { MessageController } from 'vs/editor/contrib/message/browser/messageController';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { PostEditWidgetManager } from './postEditWidget';
import { CancellationError, isCancellationError } from 'vs/base/common/errors';

export const changePasteTypeCommandId = 'editor.changePasteType';

export const pasteWidgetVisibleCtx = new RawContextKey<boolean>('pasteWidgetVisible', false, localize('pasteWidgetVisible', "Whether the paste widget is showing"));

const vscodeClipboardMime = 'application/vnd.code.copyMetadata';

interface CopyMetadata {
	readonly id?: string;
	readonly providerCopyMimeTypes?: readonly string[];

	readonly defaultPastePayload: Omit<PastePayload, 'text'>;
}

type PasteEditWithProvider = DocumentPasteEdit & {
	provider: DocumentPasteEditProvider;
};


interface DocumentPasteWithProviderEditsSession {
	edits: readonly PasteEditWithProvider[];
	dispose(): void;
}

type PastePreference =
	| HierarchicalKind
	| { providerId: string };

export class CopyPasteController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.copyPasteActionController';

	public static get(editor: ICodeEditor): CopyPasteController | null {
		return editor.getContribution<CopyPasteController>(CopyPasteController.ID);
	}

	/**
	 * Global tracking the last copy operation.
	 *
	 * This is shared across all editors so that you can copy and paste between groups.
	 *
	 * TODO: figure out how to make this work with multiple windows
	 */
	private static _currentCopyOperation?: {
		readonly handle: string;
		readonly dataTransferPromise: CancelablePromise<VSDataTransfer>;
	};

	private readonly _editor: ICodeEditor;

	private _currentPasteOperation?: CancelablePromise<void>;
	private _pasteAsActionContext?: { readonly preferred?: PastePreference };

	private readonly _pasteProgressManager: InlineProgressManager;
	private readonly _postPasteWidgetManager: PostEditWidgetManager<PasteEditWithProvider>;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IProgressService private readonly _progressService: IProgressService,
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

	public pasteAs(preferred?: PastePreference) {
		this._editor.focus();
		try {
			this._pasteAsActionContext = { preferred };
			getActiveDocument().execCommand('paste');
		} finally {
			this._pasteAsActionContext = undefined;
		}
	}

	public clearWidgets() {
		this._postPasteWidgetManager.clear();
	}

	private isPasteAsEnabled(): boolean {
		return this._editor.getOption(EditorOption.pasteAs).enabled
			&& !this._editor.getOption(EditorOption.readOnly);
	}

	public async finishedPaste(): Promise<void> {
		await this._currentPasteOperation;
	}

	private handleCopy(e: ClipboardEvent) {
		if (!this._editor.hasTextFocus()) {
			return;
		}

		if (platform.isWeb) {
			// Explicitly clear the web resources clipboard.
			// This is needed because on web, the browser clipboard is faked out using an in-memory store.
			// This means the resources clipboard is not properly updated when copying from the editor.
			this._clipboardService.writeResources([]);
		}

		if (!e.clipboardData || !this.isPasteAsEnabled()) {
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

			ranges = [new Range(ranges[0].startLineNumber, 1, ranges[0].startLineNumber, 1 + model.getLineLength(ranges[0].startLineNumber))];
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
			const results = coalesce(await Promise.all(providers.map(async provider => {
				try {
					return await provider.prepareDocumentPaste!(model, ranges, dataTransfer, token);
				} catch (err) {
					console.error(err);
					return undefined;
				}
			})));

			// Values from higher priority providers should overwrite values from lower priority ones.
			// Reverse the array to so that the calls to `replace` below will do this
			results.reverse();

			for (const result of results) {
				for (const [mime, value] of result) {
					dataTransfer.replace(mime, value);
				}
			}

			return dataTransfer;
		});

		CopyPasteController._currentCopyOperation?.dataTransferPromise.cancel();
		CopyPasteController._currentCopyOperation = { handle: handle, dataTransferPromise: promise };
	}

	private async handlePaste(e: ClipboardEvent) {
		if (!e.clipboardData || !this._editor.hasTextFocus()) {
			return;
		}

		MessageController.get(this._editor)?.closeMessage();
		this._currentPasteOperation?.cancel();
		this._currentPasteOperation = undefined;

		const model = this._editor.getModel();
		const selections = this._editor.getSelections();
		if (!selections?.length || !model) {
			return;
		}

		if (
			!this.isPasteAsEnabled()
			&& !this._pasteAsActionContext // Still enable if paste as was explicitly requested
		) {
			return;
		}

		const metadata = this.fetchCopyMetadata(e);
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
			.filter(provider => {
				// Filter out providers that don't match the requested paste types
				const preference = this._pasteAsActionContext?.preferred;
				if (preference) {
					if (provider.providedPasteEditKinds && !this.providerMatchesPreference(provider, preference)) {
						return false;
					}
				}

				// And providers that don't handle any of mime types in the clipboard
				return provider.pasteMimeTypes?.some(type => matchesMimeType(type, allPotentialMimeTypes));
			});
		if (!allProviders.length) {
			if (this._pasteAsActionContext?.preferred) {
				this.showPasteAsNoEditMessage(selections, this._pasteAsActionContext.preferred);
			}
			return;
		}

		// Prevent the editor's default paste handler from running.
		// Note that after this point, we are fully responsible for handling paste.
		// If we can't provider a paste for any reason, we need to explicitly delegate pasting back to the editor.
		e.preventDefault();
		e.stopImmediatePropagation();

		if (this._pasteAsActionContext) {
			this.showPasteAsPick(this._pasteAsActionContext.preferred, allProviders, selections, dataTransfer, metadata);
		} else {
			this.doPasteInline(allProviders, selections, dataTransfer, metadata, e);
		}
	}

	private showPasteAsNoEditMessage(selections: readonly Selection[], preference: PastePreference) {
		MessageController.get(this._editor)?.showMessage(localize('pasteAsError', "No paste edits for '{0}' found", preference instanceof HierarchicalKind ? preference.value : preference.providerId), selections[0].getStartPosition());
	}

	private doPasteInline(allProviders: readonly DocumentPasteEditProvider[], selections: readonly Selection[], dataTransfer: VSDataTransfer, metadata: CopyMetadata | undefined, clipboardEvent: ClipboardEvent): void {
		const editor = this._editor;
		if (!editor.hasModel()) {
			return;
		}

		const editorStateCts = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection, undefined);

		const p = createCancelablePromise(async (pToken) => {
			const editor = this._editor;
			if (!editor.hasModel()) {
				return;
			}
			const model = editor.getModel();

			const disposables = new DisposableStore();
			const cts = disposables.add(new CancellationTokenSource(pToken));
			disposables.add(editorStateCts.token.onCancellationRequested(() => cts.cancel()));

			const token = cts.token;
			try {
				await this.mergeInDataFromCopy(dataTransfer, metadata, token);
				if (token.isCancellationRequested) {
					return;
				}

				const supportedProviders = allProviders.filter(provider => this.isSupportedPasteProvider(provider, dataTransfer));
				if (!supportedProviders.length
					|| (supportedProviders.length === 1 && supportedProviders[0] instanceof DefaultTextPasteOrDropEditProvider) // Only our default text provider is active
				) {
					return this.applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent);
				}

				const context: DocumentPasteContext = {
					triggerKind: DocumentPasteTriggerKind.Automatic,
				};
				const editSession = await this.getPasteEdits(supportedProviders, dataTransfer, model, selections, context, token);
				disposables.add(editSession);
				if (token.isCancellationRequested) {
					return;
				}

				// If the only edit returned is our default text edit, use the default paste handler
				if (editSession.edits.length === 1 && editSession.edits[0].provider instanceof DefaultTextPasteOrDropEditProvider) {
					return this.applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent);
				}

				if (editSession.edits.length) {
					const canShowWidget = editor.getOption(EditorOption.pasteAs).showPasteSelector === 'afterPaste';
					return this._postPasteWidgetManager.applyEditAndShowIfNeeded(selections, { activeEditIndex: 0, allEdits: editSession.edits }, canShowWidget, (edit, token) => {
						return new Promise<PasteEditWithProvider>((resolve, reject) => {
							(async () => {
								try {
									const resolveP = edit.provider.resolveDocumentPasteEdit?.(edit, token);
									const showP = new DeferredPromise<void>();
									const resolved = resolveP && await this._pasteProgressManager.showWhile(selections[0].getEndPosition(), localize('resolveProcess', "Resolving paste edit. Click to cancel"), Promise.race([showP.p, resolveP]), {
										cancel: () => {
											showP.cancel();
											return reject(new CancellationError());
										}
									}, 0);
									if (resolved) {
										edit.additionalEdit = resolved.additionalEdit;
									}
									return resolve(edit);
								} catch (err) {
									return reject(err);
								}
							})();
						});
					}, token);
				}

				await this.applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent);
			} finally {
				disposables.dispose();
				if (this._currentPasteOperation === p) {
					this._currentPasteOperation = undefined;
				}
			}
		});

		this._pasteProgressManager.showWhile(selections[0].getEndPosition(), localize('pasteIntoEditorProgress', "Running paste handlers. Click to cancel and do basic paste"), p, {
			cancel: async () => {
				try {
					p.cancel();

					if (editorStateCts.token.isCancellationRequested) {
						return;
					}

					await this.applyDefaultPasteHandler(dataTransfer, metadata, editorStateCts.token, clipboardEvent);
				} finally {
					editorStateCts.dispose();
				}
			}
		}).then(() => {
			editorStateCts.dispose();
		});
		this._currentPasteOperation = p;
	}

	private showPasteAsPick(preference: PastePreference | undefined, allProviders: readonly DocumentPasteEditProvider[], selections: readonly Selection[], dataTransfer: VSDataTransfer, metadata: CopyMetadata | undefined): void {
		const p = createCancelablePromise(async (token) => {
			const editor = this._editor;
			if (!editor.hasModel()) {
				return;
			}
			const model = editor.getModel();

			const disposables = new DisposableStore();
			const tokenSource = disposables.add(new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection, undefined, token));
			try {
				await this.mergeInDataFromCopy(dataTransfer, metadata, tokenSource.token);
				if (tokenSource.token.isCancellationRequested) {
					return;
				}

				// Filter out any providers the don't match the full data transfer we will send them.
				let supportedProviders = allProviders.filter(provider => this.isSupportedPasteProvider(provider, dataTransfer, preference));
				if (preference) {
					// We are looking for a specific edit
					supportedProviders = supportedProviders.filter(provider => this.providerMatchesPreference(provider, preference));
				}

				const context: DocumentPasteContext = {
					triggerKind: DocumentPasteTriggerKind.PasteAs,
					only: preference && preference instanceof HierarchicalKind ? preference : undefined,
				};
				let editSession = disposables.add(await this.getPasteEdits(supportedProviders, dataTransfer, model, selections, context, tokenSource.token));
				if (tokenSource.token.isCancellationRequested) {
					return;
				}

				// Filter out any edits that don't match the requested kind
				if (preference) {
					editSession = {
						edits: editSession.edits.filter(edit => {
							if (preference instanceof HierarchicalKind) {
								return preference.contains(edit.kind);
							} else {
								return preference.providerId === edit.provider.id;
							}
						}),
						dispose: editSession.dispose
					};
				}

				if (!editSession.edits.length) {
					if (context.only) {
						this.showPasteAsNoEditMessage(selections, context.only);
					}
					return;
				}

				let pickedEdit: DocumentPasteEdit | undefined;
				if (preference) {
					pickedEdit = editSession.edits.at(0);
				} else {
					const selected = await this._quickInputService.pick(
						editSession.edits.map((edit): IQuickPickItem & { edit: DocumentPasteEdit } => ({
							label: edit.title,
							description: edit.kind?.value,
							edit,
						})), {
						placeHolder: localize('pasteAsPickerPlaceholder', "Select Paste Action"),
					});
					pickedEdit = selected?.edit;
				}

				if (!pickedEdit) {
					return;
				}

				const combinedWorkspaceEdit = createCombinedWorkspaceEdit(model.uri, selections, pickedEdit);
				await this._bulkEditService.apply(combinedWorkspaceEdit, { editor: this._editor });
			} finally {
				disposables.dispose();
				if (this._currentPasteOperation === p) {
					this._currentPasteOperation = undefined;
				}
			}
		});

		this._progressService.withProgress({
			location: ProgressLocation.Window,
			title: localize('pasteAsProgress', "Running paste handlers"),
		}, () => p);
	}

	private setCopyMetadata(dataTransfer: DataTransfer, metadata: CopyMetadata) {
		dataTransfer.setData(vscodeClipboardMime, JSON.stringify(metadata));
	}

	private fetchCopyMetadata(e: ClipboardEvent): CopyMetadata | undefined {
		if (!e.clipboardData) {
			return;
		}

		// Prefer using the clipboard data we saved off
		const rawMetadata = e.clipboardData.getData(vscodeClipboardMime);
		if (rawMetadata) {
			try {
				return JSON.parse(rawMetadata);
			} catch {
				return undefined;
			}
		}

		// Otherwise try to extract the generic text editor metadata
		const [_, metadata] = ClipboardEventUtils.getTextData(e.clipboardData);
		if (metadata) {
			return {
				defaultPastePayload: {
					mode: metadata.mode,
					multicursorText: metadata.multicursorText ?? null,
					pasteOnNewLine: !!metadata.isFromEmptySelection,
				},
			};
		}

		return undefined;
	}

	private async mergeInDataFromCopy(dataTransfer: VSDataTransfer, metadata: CopyMetadata | undefined, token: CancellationToken): Promise<void> {
		if (metadata?.id && CopyPasteController._currentCopyOperation?.handle === metadata.id) {
			const toMergeDataTransfer = await CopyPasteController._currentCopyOperation.dataTransferPromise;
			if (token.isCancellationRequested) {
				return;
			}

			for (const [key, value] of toMergeDataTransfer) {
				dataTransfer.replace(key, value);
			}
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

	private async getPasteEdits(providers: readonly DocumentPasteEditProvider[], dataTransfer: VSDataTransfer, model: ITextModel, selections: readonly Selection[], context: DocumentPasteContext, token: CancellationToken): Promise<DocumentPasteWithProviderEditsSession> {
		const disposables = new DisposableStore();

		const results = await raceCancellation(
			Promise.all(providers.map(async provider => {
				try {
					const edits = await provider.provideDocumentPasteEdits?.(model, selections, dataTransfer, context, token);
					if (edits) {
						disposables.add(edits);
					}
					return edits?.edits?.map(edit => ({ ...edit, provider }));
				} catch (err) {
					if (!isCancellationError(err)) {
						console.error(err);
					}
					return undefined;
				}
			})),
			token);
		const edits = coalesce(results ?? []).flat().filter(edit => {
			return !context.only || context.only.contains(edit.kind);
		});
		return {
			edits: sortEditsByYieldTo(edits),
			dispose: () => disposables.dispose()
		};
	}

	private async applyDefaultPasteHandler(dataTransfer: VSDataTransfer, metadata: CopyMetadata | undefined, token: CancellationToken, clipboardEvent: ClipboardEvent) {
		const textDataTransfer = dataTransfer.get(Mimes.text) ?? dataTransfer.get('text');
		const text = (await textDataTransfer?.asString()) ?? '';
		if (token.isCancellationRequested) {
			return;
		}

		const payload: PastePayload = {
			clipboardEvent,
			text,
			pasteOnNewLine: metadata?.defaultPastePayload.pasteOnNewLine ?? false,
			multicursorText: metadata?.defaultPastePayload.multicursorText ?? null,
			mode: null,
		};
		this._editor.trigger('keyboard', Handler.Paste, payload);
	}

	/**
	 * Filter out providers if they:
	 * - Don't handle any of the data transfer types we have
	 * - Don't match the preferred paste kind
	 */
	private isSupportedPasteProvider(provider: DocumentPasteEditProvider, dataTransfer: VSDataTransfer, preference?: PastePreference): boolean {
		if (!provider.pasteMimeTypes?.some(type => dataTransfer.matches(type))) {
			return false;
		}

		return !preference || this.providerMatchesPreference(provider, preference);
	}

	private providerMatchesPreference(provider: DocumentPasteEditProvider, preference: PastePreference): boolean {
		if (preference instanceof HierarchicalKind) {
			if (!provider.providedPasteEditKinds) {
				return true;
			}
			return provider.providedPasteEditKinds.some(providedKind => preference.contains(providedKind));
		} else {
			return provider.id === preference.providerId;
		}
	}
}
