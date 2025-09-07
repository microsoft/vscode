/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from '../../../../base/browser/dom.js';
import { IAction } from '../../../../base/common/actions.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { CancelablePromise, createCancelablePromise, DeferredPromise, raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { createStringDataTransferItem, IReadonlyVSDataTransfer, matchesMimeType, UriList, VSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../base/common/mime.js';
import * as platform from '../../../../base/common/platform.js';
import { upcast } from '../../../../base/common/types.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { ClipboardEventUtils, InMemoryClipboardMetadataManager } from '../../../browser/controller/editContext/clipboardUtils.js';
import { toExternalVSDataTransfer, toVSDataTransfer } from '../../../browser/dataTransfer.js';
import { ICodeEditor, PastePayload } from '../../../browser/editorBrowser.js';
import { IBulkEditService } from '../../../browser/services/bulkEditService.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IRange, Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { Handler, IEditorContribution } from '../../../common/editorCommon.js';
import { DocumentPasteContext, DocumentPasteEdit, DocumentPasteEditProvider, DocumentPasteTriggerKind } from '../../../common/languages.js';
import { ITextModel } from '../../../common/model.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from '../../editorState/browser/editorState.js';
import { InlineProgressManager } from '../../inlineProgress/browser/inlineProgress.js';
import { MessageController } from '../../message/browser/messageController.js';
import { PreferredPasteConfiguration } from './copyPasteContribution.js';
import { DefaultTextPasteOrDropEditProvider } from './defaultProviders.js';
import { createCombinedWorkspaceEdit, sortEditsByYieldTo } from './edit.js';
import { PostEditWidgetManager } from './postEditWidget.js';

export const changePasteTypeCommandId = 'editor.changePasteType';

export const pasteAsPreferenceConfig = 'editor.pasteAs.preferences';

export const pasteWidgetVisibleCtx = new RawContextKey<boolean>('pasteWidgetVisible', false, localize('pasteWidgetVisible', "Whether the paste widget is showing"));

const vscodeClipboardMime = 'application/vnd.code.copymetadata';

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

export type PastePreference =
	| { readonly only: HierarchicalKind }
	| { readonly preferences: readonly HierarchicalKind[] }
	| { readonly providerId: string } // Only used internally
	;

interface CopyOperation {
	readonly providerMimeTypes: readonly string[];
	readonly operation: CancelablePromise<IReadonlyVSDataTransfer | undefined>;
}

export class CopyPasteController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.copyPasteActionController';

	public static get(editor: ICodeEditor): CopyPasteController | null {
		return editor.getContribution<CopyPasteController>(CopyPasteController.ID);
	}

	public static setConfigureDefaultAction(action: IAction) {
		CopyPasteController._configureDefaultAction = action;
	}

	private static _configureDefaultAction?: IAction;

	/**
	 * Global tracking the last copy operation.
	 *
	 * This is shared across all editors so that you can copy and paste between groups.
	 *
	 * TODO: figure out how to make this work with multiple windows
	 */
	private static _currentCopyOperation?: {
		readonly handle: string;
		readonly operations: ReadonlyArray<CopyOperation>;
	};

	private readonly _editor: ICodeEditor;

	private _currentPasteOperation?: CancelablePromise<void>;
	private _pasteAsActionContext?: { readonly preferred?: PastePreference };

	private readonly _pasteProgressManager: InlineProgressManager;
	private readonly _postPasteWidgetManager: PostEditWidgetManager<PasteEditWithProvider>;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configService: IConfigurationService,
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

		this._postPasteWidgetManager = this._register(instantiationService.createInstance(PostEditWidgetManager, 'pasteIntoEditor', editor, pasteWidgetVisibleCtx,
			{ id: changePasteTypeCommandId, label: localize('postPasteWidgetTitle', "Show paste options...") },
			() => CopyPasteController._configureDefaultAction ? [CopyPasteController._configureDefaultAction] : []
		));
	}

	public changePasteType() {
		this._postPasteWidgetManager.tryShowSelector();
	}

	public async pasteAs(preferred?: PastePreference) {
		this._logService.trace('CopyPasteController.pasteAs');
		this._editor.focus();
		try {
			this._logService.trace('Before calling editor.action.clipboardPasteAction');
			this._pasteAsActionContext = { preferred };
			await this._commandService.executeCommand('editor.action.clipboardPasteAction');
		} finally {
			this._pasteAsActionContext = undefined;
		}
	}

	public clearWidgets() {
		this._postPasteWidgetManager.clear();
	}

	private isPasteAsEnabled(): boolean {
		return this._editor.getOption(EditorOption.pasteAs).enabled;
	}

	public async finishedPaste(): Promise<void> {
		await this._currentPasteOperation;
	}

	private handleCopy(e: ClipboardEvent) {
		let id: string | null = null;
		if (e.clipboardData) {
			const [text, metadata] = ClipboardEventUtils.getTextData(e.clipboardData);
			const storedMetadata = metadata || InMemoryClipboardMetadataManager.INSTANCE.get(text);
			id = storedMetadata?.id || null;
			this._logService.trace('CopyPasteController#handleCopy for id : ', id, ' with text.length : ', text.length);
		} else {
			this._logService.trace('CopyPasteController#handleCopy');
		}
		if (!this._editor.hasTextFocus()) {
			return;
		}

		// Explicitly clear the clipboard internal state.
		// This is needed because on web, the browser clipboard is faked out using an in-memory store.
		// This means the resources clipboard is not properly updated when copying from the editor.
		this._clipboardService.clearInternalState?.();

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
		const handle = id ?? generateUuid();
		this.setCopyMetadata(e.clipboardData, {
			id: handle,
			providerCopyMimeTypes,
			defaultPastePayload
		});

		const operations = providers.map((provider): CopyOperation => {
			return {
				providerMimeTypes: provider.copyMimeTypes,
				operation: createCancelablePromise(token =>
					provider.prepareDocumentPaste!(model, ranges, dataTransfer, token)
						.catch(err => {
							console.error(err);
							return undefined;
						}))
			};
		});

		CopyPasteController._currentCopyOperation?.operations.forEach(entry => entry.operation.cancel());
		CopyPasteController._currentCopyOperation = { handle, operations };
	}

	private async handlePaste(e: ClipboardEvent) {
		if (e.clipboardData) {
			const [text, metadata] = ClipboardEventUtils.getTextData(e.clipboardData);
			const metadataComputed = metadata || InMemoryClipboardMetadataManager.INSTANCE.get(text);
			this._logService.trace('CopyPasteController#handlePaste for id : ', metadataComputed?.id);
		} else {
			this._logService.trace('CopyPasteController#handlePaste');
		}
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
			this._editor.getOption(EditorOption.readOnly) // Never enabled if editor is readonly.
			|| (!this.isPasteAsEnabled() && !this._pasteAsActionContext) // Or feature disabled (but still enable if paste was explicitly requested)
		) {
			return;
		}

		const metadata = this.fetchCopyMetadata(e);
		this._logService.trace('CopyPasteController#handlePaste with metadata : ', metadata?.id, ' and text.length : ', e.clipboardData.getData('text/plain').length);
		const dataTransfer = toExternalVSDataTransfer(e.clipboardData);
		dataTransfer.delete(vscodeClipboardMime);

		const fileTypes = Array.from(e.clipboardData.files).map(file => file.type);

		const allPotentialMimeTypes = [
			...e.clipboardData.types,
			...fileTypes,
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
					if (!this.providerMatchesPreference(provider, preference)) {
						return false;
					}
				}

				// And providers that don't handle any of mime types in the clipboard
				return provider.pasteMimeTypes?.some(type => matchesMimeType(type, allPotentialMimeTypes));
			});
		if (!allProviders.length) {
			if (this._pasteAsActionContext?.preferred) {
				this.showPasteAsNoEditMessage(selections, this._pasteAsActionContext.preferred);

				// Also prevent default paste from applying
				e.preventDefault();
				e.stopImmediatePropagation();
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
		const kindLabel = 'only' in preference
			? preference.only.value
			: 'preferences' in preference
				? (preference.preferences.length ? preference.preferences.map(preference => preference.value).join(', ') : localize('noPreferences', "empty"))
				: preference.providerId;

		MessageController.get(this._editor)?.showMessage(localize('pasteAsError', "No paste edits for '{0}' found", kindLabel), selections[0].getStartPosition());
	}

	private doPasteInline(allProviders: readonly DocumentPasteEditProvider[], selections: readonly Selection[], dataTransfer: VSDataTransfer, metadata: CopyMetadata | undefined, clipboardEvent: ClipboardEvent): void {
		this._logService.trace('CopyPasteController#doPasteInline');
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
				await this.mergeInDataFromCopy(allProviders, dataTransfer, metadata, token);
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
					return this._postPasteWidgetManager.applyEditAndShowIfNeeded(selections, { activeEditIndex: this.getInitialActiveEditIndex(model, editSession.edits), allEdits: editSession.edits }, canShowWidget, async (edit, resolveToken) => {
						if (!edit.provider.resolveDocumentPasteEdit) {
							return edit;
						}

						const resolveP = edit.provider.resolveDocumentPasteEdit(edit, resolveToken);
						const showP = new DeferredPromise<void>();
						const resolved = await this._pasteProgressManager.showWhile(selections[0].getEndPosition(), localize('resolveProcess', "Resolving paste edit for '{0}'. Click to cancel", edit.title), raceCancellation(Promise.race([showP.p, resolveP]), resolveToken), {
							cancel: () => showP.cancel()
						}, 0);

						if (resolved) {
							edit.insertText = resolved.insertText;
							edit.additionalEdit = resolved.additionalEdit;
						}
						return edit;
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
				p.cancel();
				if (editorStateCts.token.isCancellationRequested) {
					return;
				}

				await this.applyDefaultPasteHandler(dataTransfer, metadata, editorStateCts.token, clipboardEvent);
			}
		}).finally(() => {
			editorStateCts.dispose();
		});
		this._currentPasteOperation = p;
	}

	private showPasteAsPick(preference: PastePreference | undefined, allProviders: readonly DocumentPasteEditProvider[], selections: readonly Selection[], dataTransfer: VSDataTransfer, metadata: CopyMetadata | undefined): void {
		this._logService.trace('CopyPasteController#showPasteAsPick');
		const p = createCancelablePromise(async (token) => {
			const editor = this._editor;
			if (!editor.hasModel()) {
				return;
			}
			const model = editor.getModel();

			const disposables = new DisposableStore();
			const tokenSource = disposables.add(new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection, undefined, token));
			try {
				await this.mergeInDataFromCopy(allProviders, dataTransfer, metadata, tokenSource.token);
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
					only: preference && 'only' in preference ? preference.only : undefined,
				};
				let editSession = disposables.add(await this.getPasteEdits(supportedProviders, dataTransfer, model, selections, context, tokenSource.token));
				if (tokenSource.token.isCancellationRequested) {
					return;
				}

				// Filter out any edits that don't match the requested kind
				if (preference) {
					editSession = {
						edits: editSession.edits.filter(edit => {
							if ('only' in preference) {
								return preference.only.contains(edit.kind);
							} else if ('preferences' in preference) {
								return preference.preferences.some(preference => preference.contains(edit.kind));
							} else {
								return preference.providerId === edit.provider.id;
							}
						}),
						dispose: editSession.dispose
					};
				}

				if (!editSession.edits.length) {
					if (preference) {
						this.showPasteAsNoEditMessage(selections, preference);
					}
					return;
				}

				let pickedEdit: DocumentPasteEdit | undefined;
				if (preference) {
					pickedEdit = editSession.edits.at(0);
				} else {
					type ItemWithEdit = IQuickPickItem & { edit?: DocumentPasteEdit };
					const configureDefaultItem: ItemWithEdit = {
						id: 'editor.pasteAs.default',
						label: localize('pasteAsDefault', "Configure default paste action"),
						edit: undefined,
					};

					const selected = await this._quickInputService.pick<ItemWithEdit>(
						[
							...editSession.edits.map((edit): ItemWithEdit => ({
								label: edit.title,
								description: edit.kind?.value,
								edit,
							})),
							...(CopyPasteController._configureDefaultAction ? [
								upcast<IQuickPickSeparator>({ type: 'separator' }),
								{
									label: CopyPasteController._configureDefaultAction.label,
									edit: undefined,
								}
							] : [])
						], {
						placeHolder: localize('pasteAsPickerPlaceholder', "Select Paste Action"),
					});

					if (selected === configureDefaultItem) {
						CopyPasteController._configureDefaultAction?.run();
						return;
					}

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
		this._logService.trace('CopyPasteController#setCopyMetadata new id : ', metadata.id);
		dataTransfer.setData(vscodeClipboardMime, JSON.stringify(metadata));
	}

	private fetchCopyMetadata(e: ClipboardEvent): CopyMetadata | undefined {
		this._logService.trace('CopyPasteController#fetchCopyMetadata');
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

	private async mergeInDataFromCopy(allProviders: readonly DocumentPasteEditProvider[], dataTransfer: VSDataTransfer, metadata: CopyMetadata | undefined, token: CancellationToken): Promise<void> {
		this._logService.trace('CopyPasteController#mergeInDataFromCopy with metadata : ', metadata?.id);
		if (metadata?.id && CopyPasteController._currentCopyOperation?.handle === metadata.id) {
			// Only resolve providers that have data we may care about
			const toResolve = CopyPasteController._currentCopyOperation.operations
				.filter(op => allProviders.some(provider => provider.pasteMimeTypes.some(type => matchesMimeType(type, op.providerMimeTypes))))
				.map(op => op.operation);

			const toMergeResults = await Promise.all(toResolve);
			if (token.isCancellationRequested) {
				return;
			}

			// Values from higher priority providers should overwrite values from lower priority ones.
			// Reverse the array to so that the calls to `DataTransfer.replace` later will do this
			for (const toMergeData of toMergeResults.reverse()) {
				if (toMergeData) {
					for (const [key, value] of toMergeData) {
						dataTransfer.replace(key, value);
					}
				}
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
		this._logService.trace('CopyPasteController#applyDefaultPasteHandler for id : ', metadata?.id);
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
		if ('only' in preference) {
			return provider.providedPasteEditKinds.some(providedKind => preference.only.contains(providedKind));
		} else if ('preferences' in preference) {
			return preference.preferences.some(providedKind => preference.preferences.some(preferredKind => preferredKind.contains(providedKind)));
		} else {
			return provider.id === preference.providerId;
		}
	}

	private getInitialActiveEditIndex(model: ITextModel, edits: readonly DocumentPasteEdit[]): number {
		const preferredProviders = this._configService.getValue<PreferredPasteConfiguration[]>(pasteAsPreferenceConfig, { resource: model.uri });
		for (const config of Array.isArray(preferredProviders) ? preferredProviders : []) {
			const desiredKind = new HierarchicalKind(config);
			const editIndex = edits.findIndex(edit => desiredKind.contains(edit.kind));
			if (editIndex >= 0) {
				return editIndex;
			}
		}

		return 0;
	}
}
