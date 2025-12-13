/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFindFirst } from '../../../../../base/common/arraysFind.js';
import { arrayEqualsC } from '../../../../../base/common/equals.js';
import { BugIndicatingError, onUnexpectedExternalError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservable, IObservableWithChange, IReader, ITransaction, autorun, constObservable, derived, derivedHandleChanges, derivedOpts, mapObservableArrayCached, observableFromEvent, observableSignal, observableValue, recomputeInitiallyAndOnChange, subtransaction, transaction } from '../../../../../base/common/observable.js';
import { firstNonWhitespaceIndex } from '../../../../../base/common/strings.js';
import { isDefined } from '../../../../../base/common/types.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { CursorColumns } from '../../../../common/core/cursorColumns.js';
import { LineRange } from '../../../../common/core/ranges/lineRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { TextReplacement, TextEdit } from '../../../../common/core/edits/textEdit.js';
import { TextLength } from '../../../../common/core/text/textLength.js';
import { ScrollType } from '../../../../common/editorCommon.js';
import { InlineCompletionEndOfLifeReasonKind, InlineCompletion, InlineCompletionTriggerKind, PartialAcceptTriggerKind, InlineCompletionsProvider, InlineCompletionCommand } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { EndOfLinePreference, IModelDeltaDecoration, ITextModel } from '../../../../common/model.js';
import { TextModelText } from '../../../../common/model/textModelText.js';
import { IFeatureDebounceInformation } from '../../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { IModelContentChangedEvent } from '../../../../common/textModelEvents.js';
import { SnippetController2 } from '../../../snippet/browser/snippetController2.js';
import { getEndPositionsAfterApplying, removeTextReplacementCommonSuffixPrefix } from '../utils.js';
import { AnimatedValue, easeOutCubic, ObservableAnimatedValue } from './animation.js';
import { computeGhostText } from './computeGhostText.js';
import { GhostText, GhostTextOrReplacement, ghostTextOrReplacementEquals, ghostTextsOrReplacementsEqual } from './ghostText.js';
import { InlineCompletionsSource } from './inlineCompletionsSource.js';
import { InlineCompletionItem, InlineEditItem, InlineSuggestionItem } from './inlineSuggestionItem.js';
import { InlineCompletionContextWithoutUuid, InlineCompletionEditorType, InlineSuggestRequestInfo, InlineSuggestSku } from './provideInlineCompletions.js';
import { singleTextEditAugments, singleTextRemoveCommonPrefix } from './singleTextEditHelpers.js';
import { SuggestItemInfo } from './suggestWidgetAdapter.js';
import { TextModelEditSource, EditSources } from '../../../../common/textModelEditSource.js';
import { ICodeEditorService } from '../../../../browser/services/codeEditorService.js';
import { InlineCompletionViewData, InlineCompletionViewKind } from '../view/inlineEdits/inlineEditsViewInterface.js';
import { IInlineCompletionsService } from '../../../../browser/services/inlineCompletionsService.js';
import { TypingInterval } from './typingSpeed.js';
import { StringReplacement } from '../../../../common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { URI } from '../../../../../base/common/uri.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';

export class InlineCompletionsModel extends Disposable {
	private readonly _source;
	private readonly _isActive = observableValue<boolean>(this, false);
	private readonly _onlyRequestInlineEditsSignal = observableSignal(this);
	private readonly _forceUpdateExplicitlySignal = observableSignal(this);
	private readonly _noDelaySignal = observableSignal(this);

	private readonly _fetchSpecificProviderSignal = observableSignal<InlineCompletionsProvider | undefined>(this);

	// We use a semantic id to keep the same inline completion selected even if the provider reorders the completions.
	private readonly _selectedInlineCompletionId = observableValue<string | undefined>(this, undefined);
	public readonly primaryPosition = derived(this, reader => this._positions.read(reader)[0] ?? new Position(1, 1));
	public readonly allPositions = derived(this, reader => this._positions.read(reader));

	private readonly sku = observableValue<InlineSuggestSku | undefined>(this, undefined);

	private _isAcceptingPartially = false;
	private readonly _appearedInsideViewport = derived<boolean>(this, reader => {
		const state = this.state.read(reader);
		if (!state || !state.inlineSuggestion) {
			return false;
		}

		return isSuggestionInViewport(this._editor, state.inlineSuggestion);
	});
	public get isAcceptingPartially() { return this._isAcceptingPartially; }

	private readonly _onDidAccept = new Emitter<void>();
	public readonly onDidAccept = this._onDidAccept.event;

	private readonly _editorObs;

	private readonly _typing: TypingInterval;

	private readonly _suggestPreviewEnabled;
	private readonly _suggestPreviewMode;
	private readonly _inlineSuggestMode;
	private readonly _suppressedInlineCompletionGroupIds;
	private readonly _inlineEditsEnabled;
	private readonly _inlineEditsShowCollapsedEnabled;
	private readonly _triggerCommandOnProviderChange;
	private readonly _minShowDelay;
	private readonly _showOnSuggestConflict;
	private readonly _suppressInSnippetMode;
	private readonly _isInSnippetMode;

	get isActive() { return this._isActive; }

	get editor() {
		return this._editor;
	}

	constructor(
		public readonly textModel: ITextModel,
		private readonly _selectedSuggestItem: IObservable<SuggestItemInfo | undefined>,
		public readonly _textModelVersionId: IObservableWithChange<number | null, IModelContentChangedEvent | undefined>,
		private readonly _positions: IObservable<readonly Position[]>,
		private readonly _debounceValue: IFeatureDebounceInformation,
		private readonly _enabled: IObservable<boolean>,
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IInlineCompletionsService private readonly _inlineCompletionsService: IInlineCompletionsService,
		@IDefaultAccountService defaultAccountService: IDefaultAccountService,
	) {
		super();
		this._source = this._register(this._instantiationService.createInstance(InlineCompletionsSource, this.textModel, this._textModelVersionId, this._debounceValue, this.primaryPosition));
		this.lastTriggerKind = this._source.inlineCompletions.map(this, v => v?.request?.context.triggerKind);

		this._editorObs = observableCodeEditor(this._editor);

		const suggest = this._editorObs.getOption(EditorOption.suggest);
		this._suggestPreviewEnabled = suggest.map(v => v.preview);
		this._suggestPreviewMode = suggest.map(v => v.previewMode);

		const inlineSuggest = this._editorObs.getOption(EditorOption.inlineSuggest);
		this._inlineSuggestMode = inlineSuggest.map(v => v.mode);
		this._suppressedInlineCompletionGroupIds = inlineSuggest.map(v => new Set(v.experimental.suppressInlineSuggestions.split(',')));
		this._inlineEditsEnabled = inlineSuggest.map(v => !!v.edits.enabled);
		this._inlineEditsShowCollapsedEnabled = inlineSuggest.map(s => s.edits.showCollapsed);
		this._triggerCommandOnProviderChange = inlineSuggest.map(s => s.triggerCommandOnProviderChange);
		this._minShowDelay = inlineSuggest.map(s => s.minShowDelay);
		this._showOnSuggestConflict = inlineSuggest.map(s => s.experimental.showOnSuggestConflict);
		this._suppressInSnippetMode = inlineSuggest.map(s => s.suppressInSnippetMode);

		const snippetController = SnippetController2.get(this._editor);
		this._isInSnippetMode = snippetController?.isInSnippetObservable ?? constObservable(false);

		defaultAccountService.getDefaultAccount().then(createDisposableCb(account => this.sku.set(skuFromAccount(account), undefined), this._store));
		this._register(defaultAccountService.onDidChangeDefaultAccount(account => this.sku.set(skuFromAccount(account), undefined)));

		this._typing = this._register(new TypingInterval(this.textModel));

		this._register(this._inlineCompletionsService.onDidChangeIsSnoozing((isSnoozing) => {
			if (isSnoozing) {
				this.stop();
			}
		}));

		{ // Determine editor type
			const isNotebook = this.textModel.uri.scheme === 'vscode-notebook-cell';
			const [diffEditor] = this._codeEditorService.listDiffEditors()
				.filter(d =>
					d.getOriginalEditor().getId() === this._editor.getId() ||
					d.getModifiedEditor().getId() === this._editor.getId());

			this.isInDiffEditor = !!diffEditor;
			this.editorType = isNotebook ? InlineCompletionEditorType.Notebook
				: this.isInDiffEditor ? InlineCompletionEditorType.DiffEditor
					: InlineCompletionEditorType.TextEditor;
		}

		this._register(recomputeInitiallyAndOnChange(this.state, (s) => {
			if (s && s.inlineSuggestion) {
				this._inlineCompletionsService.reportNewCompletion(s.inlineSuggestion.requestUuid);
			}
		}));

		this._register(recomputeInitiallyAndOnChange(this._fetchInlineCompletionsPromise));

		this._register(autorun(reader => {
			this._editorObs.versionId.read(reader);
			this._inAcceptFlow.set(false, undefined);
		}));

		this._register(autorun(reader => {
			const jumpToReset = this.state.map((s, reader) => !s || s.kind === 'inlineEdit' && !s.cursorAtInlineEdit.read(reader)).read(reader);
			if (jumpToReset) {
				this._jumpedToId.set(undefined, undefined);
			}
		}));

		this._register(autorun(reader => {
			const inlineSuggestion = this.state.map(s => s?.inlineSuggestion).read(reader);
			if (inlineSuggestion) {
				inlineSuggestion.addPerformanceMarker('activeSuggestion');
			}
		}));

		const inlineEditSemanticId = this.inlineEditState.map(s => s?.inlineSuggestion.semanticId);

		this._register(autorun(reader => {
			const id = inlineEditSemanticId.read(reader);
			if (id) {
				this._editor.pushUndoStop();
				this._lastShownInlineCompletionInfo = {
					alternateTextModelVersionId: this.textModel.getAlternativeVersionId(),
					inlineCompletion: this.state.get()!.inlineSuggestion!,
				};
			}
		}));

		// TODO: should use getAvailableProviders and update on _suppressedInlineCompletionGroupIds change
		const inlineCompletionProviders = observableFromEvent(this._languageFeaturesService.inlineCompletionsProvider.onDidChange, () => this._languageFeaturesService.inlineCompletionsProvider.all(textModel));
		mapObservableArrayCached(this, inlineCompletionProviders, (provider, store) => {
			if (!provider.onDidChangeInlineCompletions) {
				return;
			}

			store.add(provider.onDidChangeInlineCompletions(() => {
				if (!this._enabled.get()) {
					return;
				}

				// Only update the active editor
				const activeEditor = this._codeEditorService.getFocusedCodeEditor() || this._codeEditorService.getActiveCodeEditor();
				if (activeEditor !== this._editor) {
					return;
				}

				if (this._triggerCommandOnProviderChange.get()) {
					// TODO@hediet remove this and always do the else branch.
					this.trigger(undefined, { onlyFetchInlineEdits: true });
					return;
				}


				// If there is an active suggestion from a different provider, we ignore the update
				const activeState = this.state.get();
				if (activeState && (activeState.inlineSuggestion || activeState.edits) && activeState.inlineSuggestion?.source.provider !== provider) {
					return;
				}

				transaction(tx => {
					this._fetchSpecificProviderSignal.trigger(tx, provider);
					this.trigger(tx);
				});

			}));
		}).recomputeInitiallyAndOnChange(this._store);

		this._didUndoInlineEdits.recomputeInitiallyAndOnChange(this._store);
	}

	private _lastShownInlineCompletionInfo: { alternateTextModelVersionId: number; /* already freed! */ inlineCompletion: InlineSuggestionItem } | undefined = undefined;
	private _lastAcceptedInlineCompletionInfo: { textModelVersionIdAfter: number; /* already freed! */ inlineCompletion: InlineSuggestionItem } | undefined = undefined;
	private readonly _didUndoInlineEdits = derivedHandleChanges({
		owner: this,
		changeTracker: {
			createChangeSummary: () => ({ didUndo: false }),
			handleChange: (ctx, changeSummary) => {
				changeSummary.didUndo = ctx.didChange(this._textModelVersionId) && !!ctx.change?.isUndoing;
				return true;
			}
		}
	}, (reader, changeSummary) => {
		const versionId = this._textModelVersionId.read(reader);
		if (versionId !== null
			&& this._lastAcceptedInlineCompletionInfo
			&& this._lastAcceptedInlineCompletionInfo.textModelVersionIdAfter === versionId - 1
			&& this._lastAcceptedInlineCompletionInfo.inlineCompletion.isInlineEdit
			&& changeSummary.didUndo
		) {
			this._lastAcceptedInlineCompletionInfo = undefined;
			return true;
		}
		return false;
	});

	public debugGetSelectedSuggestItem(): IObservable<SuggestItemInfo | undefined> {
		return this._selectedSuggestItem;
	}

	public getIndentationInfo(reader: IReader) {
		let startsWithIndentation = false;
		let startsWithIndentationLessThanTabSize = true;
		const ghostText = this?.primaryGhostText.read(reader);
		if (!!this?._selectedSuggestItem && ghostText && ghostText.parts.length > 0) {
			const { column, lines } = ghostText.parts[0];

			const firstLine = lines[0].line;

			const indentationEndColumn = this.textModel.getLineIndentColumn(ghostText.lineNumber);
			const inIndentation = column <= indentationEndColumn;

			if (inIndentation) {
				let firstNonWsIdx = firstNonWhitespaceIndex(firstLine);
				if (firstNonWsIdx === -1) {
					firstNonWsIdx = firstLine.length - 1;
				}
				startsWithIndentation = firstNonWsIdx > 0;

				const tabSize = this.textModel.getOptions().tabSize;
				const visibleColumnIndentation = CursorColumns.visibleColumnFromColumn(firstLine, firstNonWsIdx + 1, tabSize);
				startsWithIndentationLessThanTabSize = visibleColumnIndentation < tabSize;
			}
		}
		return {
			startsWithIndentation,
			startsWithIndentationLessThanTabSize,
		};
	}

	private readonly _preserveCurrentCompletionReasons = new Set([
		VersionIdChangeReason.Redo,
		VersionIdChangeReason.Undo,
		VersionIdChangeReason.AcceptWord,
	]);

	private _getReason(e: IModelContentChangedEvent | undefined): VersionIdChangeReason {
		if (e?.isUndoing) { return VersionIdChangeReason.Undo; }
		if (e?.isRedoing) { return VersionIdChangeReason.Redo; }
		if (this.isAcceptingPartially) { return VersionIdChangeReason.AcceptWord; }
		return VersionIdChangeReason.Other;
	}

	public readonly dontRefetchSignal = observableSignal(this);

	private readonly _fetchInlineCompletionsPromise = derivedHandleChanges({
		owner: this,
		changeTracker: {
			createChangeSummary: () => ({
				dontRefetch: false,
				preserveCurrentCompletion: false,
				inlineCompletionTriggerKind: InlineCompletionTriggerKind.Automatic,
				onlyRequestInlineEdits: false,
				shouldDebounce: true,
				provider: undefined as InlineCompletionsProvider | undefined,
				textChange: false,
				changeReason: '',
			}),
			handleChange: (ctx, changeSummary) => {
				/** @description fetch inline completions */
				if (ctx.didChange(this._textModelVersionId)) {
					if (this._preserveCurrentCompletionReasons.has(this._getReason(ctx.change))) {
						changeSummary.preserveCurrentCompletion = true;
					}
					const detailedReasons = ctx.change?.detailedReasons ?? [];
					changeSummary.changeReason = detailedReasons.length > 0 ? detailedReasons[0].getType() : '';
					changeSummary.textChange = true;
				} else if (ctx.didChange(this._forceUpdateExplicitlySignal)) {
					changeSummary.preserveCurrentCompletion = true;
					changeSummary.inlineCompletionTriggerKind = InlineCompletionTriggerKind.Explicit;
				} else if (ctx.didChange(this.dontRefetchSignal)) {
					changeSummary.dontRefetch = true;
				} else if (ctx.didChange(this._onlyRequestInlineEditsSignal)) {
					changeSummary.onlyRequestInlineEdits = true;
				} else if (ctx.didChange(this._fetchSpecificProviderSignal)) {
					changeSummary.provider = ctx.change;
				}
				return true;
			},
		},
	}, (reader, changeSummary) => {
		this._source.clearOperationOnTextModelChange.read(reader); // Make sure the clear operation runs before the fetch operation
		this._noDelaySignal.read(reader);
		this.dontRefetchSignal.read(reader);
		this._onlyRequestInlineEditsSignal.read(reader);
		this._forceUpdateExplicitlySignal.read(reader);
		this._fetchSpecificProviderSignal.read(reader);
		const shouldUpdate = ((this._enabled.read(reader) && this._selectedSuggestItem.read(reader)) || this._isActive.read(reader))
			&& (!this._inlineCompletionsService.isSnoozing() || changeSummary.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit);
		if (!shouldUpdate) {
			this._source.cancelUpdate();
			return undefined;
		}

		this._textModelVersionId.read(reader); // Refetch on text change

		const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.read(undefined);
		let suggestItem = this._selectedSuggestItem.read(reader);
		if (this._shouldShowOnSuggestConflict.read(undefined)) {
			suggestItem = undefined;
		}
		if (suggestWidgetInlineCompletions && !suggestItem) {
			this._source.seedInlineCompletionsWithSuggestWidget();
		}

		if (changeSummary.dontRefetch) {
			return Promise.resolve(true);
		}

		if (this._didUndoInlineEdits.read(reader) && changeSummary.inlineCompletionTriggerKind !== InlineCompletionTriggerKind.Explicit) {
			transaction(tx => {
				this._source.clear(tx);
			});
			return undefined;
		}

		let reason: string = '';
		if (changeSummary.provider) {
			reason += 'providerOnDidChange';
		} else if (changeSummary.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit) {
			reason += 'explicit';
		}
		if (changeSummary.changeReason) {
			reason += reason.length > 0 ? `:${changeSummary.changeReason}` : changeSummary.changeReason;
		}

		const typingInterval = this._typing.getTypingInterval();
		const requestInfo: InlineSuggestRequestInfo = {
			editorType: this.editorType,
			startTime: Date.now(),
			languageId: this.textModel.getLanguageId(),
			reason,
			typingInterval: typingInterval.averageInterval,
			typingIntervalCharacterCount: typingInterval.characterCount,
			availableProviders: [],
			sku: this.sku.read(undefined),
		};

		let context: InlineCompletionContextWithoutUuid = {
			triggerKind: changeSummary.inlineCompletionTriggerKind,
			selectedSuggestionInfo: suggestItem?.toSelectedSuggestionInfo(),
			includeInlineCompletions: !changeSummary.onlyRequestInlineEdits,
			includeInlineEdits: this._inlineEditsEnabled.read(reader),
			requestIssuedDateTime: requestInfo.startTime,
			earliestShownDateTime: requestInfo.startTime + (changeSummary.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit || this.inAcceptFlow.read(undefined) ? 0 : this._minShowDelay.read(undefined)),
		};

		if (context.triggerKind === InlineCompletionTriggerKind.Automatic && changeSummary.textChange) {
			if (this.textModel.getAlternativeVersionId() === this._lastShownInlineCompletionInfo?.alternateTextModelVersionId) {
				// When undoing back to a version where an inline edit/completion was shown,
				// we want to show an inline edit (or completion) again if it was originally an inline edit (or completion).
				context = {
					...context,
					includeInlineCompletions: !this._lastShownInlineCompletionInfo.inlineCompletion.isInlineEdit,
					includeInlineEdits: this._lastShownInlineCompletionInfo.inlineCompletion.isInlineEdit,
				};
			}
		}

		const itemToPreserveCandidate = this.selectedInlineCompletion.read(undefined) ?? this._inlineCompletionItems.read(undefined)?.inlineEdit;
		const itemToPreserve = changeSummary.preserveCurrentCompletion || itemToPreserveCandidate?.forwardStable
			? itemToPreserveCandidate : undefined;
		const userJumpedToActiveCompletion = this._jumpedToId.map(jumpedTo => !!jumpedTo && jumpedTo === this._inlineCompletionItems.read(undefined)?.inlineEdit?.semanticId);

		const providers = changeSummary.provider
			? { providers: [changeSummary.provider], label: 'single:' + changeSummary.provider.providerId?.toString() }
			: { providers: this._languageFeaturesService.inlineCompletionsProvider.all(this.textModel), label: undefined }; // TODO: should use inlineCompletionProviders
		const availableProviders = this.getAvailableProviders(providers.providers);
		requestInfo.availableProviders = availableProviders.map(p => p.providerId).filter(isDefined);

		return this._source.fetch(availableProviders, providers.label, context, itemToPreserve?.identity, changeSummary.shouldDebounce, userJumpedToActiveCompletion, requestInfo);
	});

	// TODO: This is not an ideal implementation of excludesGroupIds, however as this is currently still behind proposed API
	// and due to the time constraints, we are using a simplified approach
	private getAvailableProviders(providers: InlineCompletionsProvider[]): InlineCompletionsProvider[] {
		const suppressedProviderGroupIds = this._suppressedInlineCompletionGroupIds.get();
		const unsuppressedProviders = providers.filter(provider => !(provider.groupId && suppressedProviderGroupIds.has(provider.groupId)));

		const excludedGroupIds = new Set<string>();
		for (const provider of unsuppressedProviders) {
			provider.excludesGroupIds?.forEach(p => excludedGroupIds.add(p));
		}

		const availableProviders: InlineCompletionsProvider[] = [];
		for (const provider of unsuppressedProviders) {
			if (provider.groupId && excludedGroupIds.has(provider.groupId)) {
				continue;
			}
			availableProviders.push(provider);
		}

		return availableProviders;
	}

	public async trigger(tx?: ITransaction, options: { onlyFetchInlineEdits?: boolean; noDelay?: boolean; provider?: InlineCompletionsProvider; explicit?: boolean } = {}): Promise<void> {
		subtransaction(tx, tx => {
			if (options.onlyFetchInlineEdits) {
				this._onlyRequestInlineEditsSignal.trigger(tx);
			}
			if (options.noDelay) {
				this._noDelaySignal.trigger(tx);
			}
			this._isActive.set(true, tx);

			if (options.explicit) {
				this._inAcceptFlow.set(true, tx);
				this._forceUpdateExplicitlySignal.trigger(tx);
			}
			if (options.provider) {
				this._fetchSpecificProviderSignal.trigger(tx, options.provider);
			}
		});
		await this._fetchInlineCompletionsPromise.get();
	}

	public async triggerExplicitly(tx?: ITransaction, onlyFetchInlineEdits: boolean = false): Promise<void> {
		return this.trigger(tx, { onlyFetchInlineEdits, explicit: true });
	}

	public stop(stopReason: 'explicitCancel' | 'automatic' = 'automatic', tx?: ITransaction): void {
		subtransaction(tx, tx => {
			if (stopReason === 'explicitCancel') {
				const inlineCompletion = this.state.get()?.inlineSuggestion;
				if (inlineCompletion) {
					inlineCompletion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Rejected });
				}
			}

			this._isActive.set(false, tx);
			this._source.clear(tx);
		});
	}

	private readonly _inlineCompletionItems = derivedOpts({ owner: this }, reader => {
		const c = this._source.inlineCompletions.read(reader);
		if (!c) { return undefined; }
		const cursorPosition = this.primaryPosition.read(reader);
		let inlineEdit: InlineEditItem | undefined = undefined;
		const visibleCompletions: InlineCompletionItem[] = [];
		for (const completion of c.inlineCompletions) {
			if (!completion.isInlineEdit) {
				if (completion.isVisible(this.textModel, cursorPosition)) {
					visibleCompletions.push(completion);
				}
			} else {
				inlineEdit = completion;
			}
		}

		if (visibleCompletions.length !== 0) {
			// Don't show the inline edit if there is a visible completion
			inlineEdit = undefined;
		}

		return {
			inlineCompletions: visibleCompletions,
			inlineEdit,
		};
	});

	private readonly _filteredInlineCompletionItems = derivedOpts({ owner: this, equalsFn: arrayEqualsC() }, reader => {
		const c = this._inlineCompletionItems.read(reader);
		return c?.inlineCompletions ?? [];
	});

	public readonly selectedInlineCompletionIndex = derived<number>(this, (reader) => {
		const selectedInlineCompletionId = this._selectedInlineCompletionId.read(reader);
		const filteredCompletions = this._filteredInlineCompletionItems.read(reader);
		const idx = this._selectedInlineCompletionId === undefined ? -1
			: filteredCompletions.findIndex(v => v.semanticId === selectedInlineCompletionId);
		if (idx === -1) {
			// Reset the selection so that the selection does not jump back when it appears again
			this._selectedInlineCompletionId.set(undefined, undefined);
			return 0;
		}
		return idx;
	});

	public readonly selectedInlineCompletion = derived<InlineCompletionItem | undefined>(this, (reader) => {
		const filteredCompletions = this._filteredInlineCompletionItems.read(reader);
		const idx = this.selectedInlineCompletionIndex.read(reader);
		return filteredCompletions[idx];
	});

	public readonly activeCommands = derivedOpts<InlineCompletionCommand[]>({ owner: this, equalsFn: arrayEqualsC() },
		r => this.selectedInlineCompletion.read(r)?.source.inlineSuggestions.commands ?? []
	);

	public readonly lastTriggerKind: IObservable<InlineCompletionTriggerKind | undefined>;

	public readonly inlineCompletionsCount = derived<number | undefined>(this, reader => {
		if (this.lastTriggerKind.read(reader) === InlineCompletionTriggerKind.Explicit) {
			return this._filteredInlineCompletionItems.read(reader).length;
		} else {
			return undefined;
		}
	});

	private readonly _hasVisiblePeekWidgets = derived(this, reader => this._editorObs.openedPeekWidgets.read(reader) > 0);

	private readonly _shouldShowOnSuggestConflict = derived(this, reader => {
		const showOnSuggestConflict = this._showOnSuggestConflict.read(reader);
		if (showOnSuggestConflict !== 'never') {
			const hasInlineCompletion = !!this.selectedInlineCompletion.read(reader);
			if (hasInlineCompletion) {
				const item = this._selectedSuggestItem.read(reader);
				if (!item) {
					return false;
				}
				if (showOnSuggestConflict === 'whenSuggestListIsIncomplete') {
					return item.listIncomplete;
				}
				return true;
			}
		}
		return false;
	});

	public readonly state = derivedOpts<{
		kind: 'ghostText';
		edits: readonly TextReplacement[];
		primaryGhostText: GhostTextOrReplacement;
		ghostTexts: readonly GhostTextOrReplacement[];
		suggestItem: SuggestItemInfo | undefined;
		inlineSuggestion: InlineCompletionItem | undefined;
	} | {
		kind: 'inlineEdit';
		edits: readonly TextReplacement[];
		inlineSuggestion: InlineEditItem;
		cursorAtInlineEdit: IObservable<boolean>;
		nextEditUri: URI | undefined;
	} | undefined>({
		owner: this,
		equalsFn: (a, b) => {
			if (!a || !b) { return a === b; }

			if (a.kind === 'ghostText' && b.kind === 'ghostText') {
				return ghostTextsOrReplacementsEqual(a.ghostTexts, b.ghostTexts)
					&& a.inlineSuggestion === b.inlineSuggestion
					&& a.suggestItem === b.suggestItem;
			} else if (a.kind === 'inlineEdit' && b.kind === 'inlineEdit') {
				return a.inlineSuggestion === b.inlineSuggestion;
			}
			return false;
		}
	}, (reader) => {
		const model = this.textModel;

		if (this._suppressInSnippetMode.read(reader) && this._isInSnippetMode.read(reader)) {
			return undefined;
		}

		const item = this._inlineCompletionItems.read(reader);
		const inlineEditResult = item?.inlineEdit;
		if (inlineEditResult) {
			if (this._hasVisiblePeekWidgets.read(reader)) {
				return undefined;
			}
			const cursorAtInlineEdit = this.primaryPosition.map(cursorPos => LineRange.fromRangeInclusive(inlineEditResult.targetRange).addMargin(1, 1).contains(cursorPos.lineNumber));
			const stringEdit = inlineEditResult.action?.kind === 'edit' ? inlineEditResult.action.stringEdit : undefined;
			const replacements = stringEdit ? TextEdit.fromStringEdit(stringEdit, new TextModelText(this.textModel)).replacements : [];

			const nextEditUri = (item.inlineEdit?.command?.id === 'vscode.open' || item.inlineEdit?.command?.id === '_workbench.open') &&
				// eslint-disable-next-line local/code-no-any-casts
				item.inlineEdit?.command.arguments?.length ? URI.from(<any>item.inlineEdit?.command.arguments[0]) : undefined;
			return { kind: 'inlineEdit', inlineSuggestion: inlineEditResult, edits: replacements, cursorAtInlineEdit, nextEditUri };
		}

		const suggestItem = this._selectedSuggestItem.read(reader);
		if (!this._shouldShowOnSuggestConflict.read(reader) && suggestItem) {
			const suggestCompletionEdit = singleTextRemoveCommonPrefix(suggestItem.getSingleTextEdit(), model);
			const augmentation = this._computeAugmentation(suggestCompletionEdit, reader);

			const isSuggestionPreviewEnabled = this._suggestPreviewEnabled.read(reader);
			if (!isSuggestionPreviewEnabled && !augmentation) { return undefined; }

			const fullEdit = augmentation?.edit ?? suggestCompletionEdit;
			const fullEditPreviewLength = augmentation ? augmentation.edit.text.length - suggestCompletionEdit.text.length : 0;

			const mode = this._suggestPreviewMode.read(reader);
			const positions = this._positions.read(reader);
			const allPotentialEdits = [fullEdit, ...getSecondaryEdits(this.textModel, positions, fullEdit)];
			const validEditsAndGhostTexts = allPotentialEdits
				.map((edit, idx) => ({ edit, ghostText: edit ? computeGhostText(edit, model, mode, positions[idx], fullEditPreviewLength) : undefined }))
				.filter(({ edit, ghostText }) => edit !== undefined && ghostText !== undefined);
			const edits = validEditsAndGhostTexts.map(({ edit }) => edit!);
			const ghostTexts = validEditsAndGhostTexts.map(({ ghostText }) => ghostText!);
			const primaryGhostText = ghostTexts[0] ?? new GhostText(fullEdit.range.endLineNumber, []);
			return { kind: 'ghostText', edits, primaryGhostText, ghostTexts, inlineSuggestion: augmentation?.completion, suggestItem };
		} else {
			if (!this._isActive.read(reader)) { return undefined; }
			const inlineSuggestion = this.selectedInlineCompletion.read(reader);
			if (!inlineSuggestion) { return undefined; }

			const replacement = inlineSuggestion.getSingleTextEdit();
			const mode = this._inlineSuggestMode.read(reader);
			const positions = this._positions.read(reader);
			const allPotentialEdits = [replacement, ...getSecondaryEdits(this.textModel, positions, replacement)];
			const validEditsAndGhostTexts = allPotentialEdits
				.map((edit, idx) => ({ edit, ghostText: edit ? computeGhostText(edit, model, mode, positions[idx], 0) : undefined }))
				.filter(({ edit, ghostText }) => edit !== undefined && ghostText !== undefined);
			const edits = validEditsAndGhostTexts.map(({ edit }) => edit!);
			const ghostTexts = validEditsAndGhostTexts.map(({ ghostText }) => ghostText!);
			if (!ghostTexts[0]) { return undefined; }
			return { kind: 'ghostText', edits, primaryGhostText: ghostTexts[0], ghostTexts, inlineSuggestion, suggestItem: undefined };
		}
	});

	public readonly status = derived(this, reader => {
		if (this._source.loading.read(reader)) { return 'loading'; }
		const s = this.state.read(reader);
		if (s?.kind === 'ghostText') { return 'ghostText'; }
		if (s?.kind === 'inlineEdit') { return 'inlineEdit'; }
		return 'noSuggestion';
	});

	public readonly inlineCompletionState = derived(this, reader => {
		const s = this.state.read(reader);
		if (!s || s.kind !== 'ghostText') {
			return undefined;
		}
		if (this._editorObs.inComposition.read(reader)) {
			return undefined;
		}
		return s;
	});

	public readonly inlineEditState = derived(this, reader => {
		const s = this.state.read(reader);
		if (!s || s.kind !== 'inlineEdit') {
			return undefined;
		}
		return s;
	});

	public readonly inlineEditAvailable = derived(this, reader => {
		const s = this.inlineEditState.read(reader);
		return !!s;
	});

	private _computeAugmentation(suggestCompletion: TextReplacement, reader: IReader | undefined) {
		const model = this.textModel;
		const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.read(reader);
		const candidateInlineCompletions = suggestWidgetInlineCompletions
			? suggestWidgetInlineCompletions.inlineCompletions.filter(c => !c.isInlineEdit)
			: [this.selectedInlineCompletion.read(reader)].filter(isDefined);

		const augmentedCompletion = mapFindFirst(candidateInlineCompletions, completion => {
			let r = completion.getSingleTextEdit();
			r = singleTextRemoveCommonPrefix(
				r,
				model,
				Range.fromPositions(r.range.getStartPosition(), suggestCompletion.range.getEndPosition())
			);
			return singleTextEditAugments(r, suggestCompletion) ? { completion, edit: r } : undefined;
		});

		return augmentedCompletion;
	}

	public readonly warning = derived(this, reader => {
		return this.inlineCompletionState.read(reader)?.inlineSuggestion?.warning;
	});

	public readonly ghostTexts = derivedOpts({ owner: this, equalsFn: ghostTextsOrReplacementsEqual }, reader => {
		const v = this.inlineCompletionState.read(reader);
		if (!v) {
			return undefined;
		}
		return v.ghostTexts;
	});

	public readonly primaryGhostText = derivedOpts({ owner: this, equalsFn: ghostTextOrReplacementEquals }, reader => {
		const v = this.inlineCompletionState.read(reader);
		if (!v) {
			return undefined;
		}
		return v?.primaryGhostText;
	});

	public readonly showCollapsed = derived<boolean>(this, reader => {
		const state = this.state.read(reader);
		if (!state || state.kind !== 'inlineEdit') {
			return false;
		}

		if (state.inlineSuggestion.hint || state.inlineSuggestion.action?.kind === 'jumpTo') {
			return false;
		}

		const isCurrentModelVersion = state.inlineSuggestion.updatedEditModelVersion === this._textModelVersionId.read(reader);
		return (this._inlineEditsShowCollapsedEnabled.read(reader) || !isCurrentModelVersion)
			&& this._jumpedToId.read(reader) !== state.inlineSuggestion.semanticId
			&& !this._inAcceptFlow.read(reader);
	});

	private readonly _tabShouldIndent = derived(this, reader => {
		if (this._inAcceptFlow.read(reader)) {
			return false;
		}

		function isMultiLine(range: Range): boolean {
			return range.startLineNumber !== range.endLineNumber;
		}

		function getNonIndentationRange(model: ITextModel, lineNumber: number): Range {
			const columnStart = model.getLineIndentColumn(lineNumber);
			const lastNonWsColumn = model.getLineLastNonWhitespaceColumn(lineNumber);
			const columnEnd = Math.max(lastNonWsColumn, columnStart);
			return new Range(lineNumber, columnStart, lineNumber, columnEnd);
		}

		const selections = this._editorObs.selections.read(reader);
		return selections?.some(s => {
			if (s.isEmpty()) {
				return this.textModel.getLineLength(s.startLineNumber) === 0;
			} else {
				return isMultiLine(s) || s.containsRange(getNonIndentationRange(this.textModel, s.startLineNumber));
			}
		});
	});

	public readonly tabShouldJumpToInlineEdit = derived(this, reader => {
		if (this._tabShouldIndent.read(reader)) {
			return false;
		}

		const s = this.inlineEditState.read(reader);
		if (!s) {
			return false;
		}


		if (s.inlineSuggestion.action?.kind === 'jumpTo') {
			return true;
		}

		if (this.showCollapsed.read(reader)) {
			return true;
		}

		if (this._inAcceptFlow.read(reader) && this._appearedInsideViewport.read(reader)) {
			return false;
		}

		return !s.cursorAtInlineEdit.read(reader);
	});

	public readonly tabShouldAcceptInlineEdit = derived(this, reader => {
		const s = this.inlineEditState.read(reader);
		if (!s) {
			return false;
		}
		if (s.inlineSuggestion.action?.kind === 'jumpTo') {
			return false;
		}
		if (this.showCollapsed.read(reader)) {
			return false;
		}
		if (this._tabShouldIndent.read(reader)) {
			return false;
		}
		if (this._inAcceptFlow.read(reader) && this._appearedInsideViewport.read(reader)) {
			return true;
		}
		if (s.inlineSuggestion.targetRange.startLineNumber === this._editorObs.cursorLineNumber.read(reader)) {
			return true;
		}
		if (this._jumpedToId.read(reader) === s.inlineSuggestion.semanticId) {
			return true;
		}

		return s.cursorAtInlineEdit.read(reader);
	});

	public readonly isInDiffEditor;

	public readonly editorType: InlineCompletionEditorType;

	private async _deltaSelectedInlineCompletionIndex(delta: 1 | -1): Promise<void> {
		await this.triggerExplicitly();

		const completions = this._filteredInlineCompletionItems.get() || [];
		if (completions.length > 0) {
			const newIdx = (this.selectedInlineCompletionIndex.get() + delta + completions.length) % completions.length;
			this._selectedInlineCompletionId.set(completions[newIdx].semanticId, undefined);
		} else {
			this._selectedInlineCompletionId.set(undefined, undefined);
		}
	}

	public async next(): Promise<void> { await this._deltaSelectedInlineCompletionIndex(1); }

	public async previous(): Promise<void> { await this._deltaSelectedInlineCompletionIndex(-1); }

	private _getMetadata(completion: InlineSuggestionItem, languageId: string, type: 'word' | 'line' | undefined = undefined): TextModelEditSource {
		if (type) {
			return EditSources.inlineCompletionPartialAccept({
				nes: completion.isInlineEdit,
				requestUuid: completion.requestUuid,
				providerId: completion.source.provider.providerId,
				languageId,
				type,
				correlationId: completion.getSourceCompletion().correlationId,
			});
		} else {
			return EditSources.inlineCompletionAccept({
				nes: completion.isInlineEdit,
				requestUuid: completion.requestUuid,
				correlationId: completion.getSourceCompletion().correlationId,
				providerId: completion.source.provider.providerId,
				languageId
			});
		}
	}

	public async accept(editor: ICodeEditor = this._editor, alternativeAction: boolean = false): Promise<void> {
		if (editor.getModel() !== this.textModel) {
			throw new BugIndicatingError();
		}

		let completion: InlineSuggestionItem;
		let isNextEditUri = false;
		const state = this.state.get();
		if (state?.kind === 'ghostText') {
			if (!state || state.primaryGhostText.isEmpty() || !state.inlineSuggestion) {
				return;
			}
			completion = state.inlineSuggestion;
		} else if (state?.kind === 'inlineEdit') {
			completion = state.inlineSuggestion;
			isNextEditUri = !!state.nextEditUri;
		} else {
			return;
		}

		// Make sure the completion list will not be disposed before the text change is sent.
		completion.addRef();

		try {
			let followUpTrigger = false;
			editor.pushUndoStop();
			if (isNextEditUri) {
				// Do nothing
			} else if (completion.action?.kind === 'edit') {
				const action = completion.action;
				if (alternativeAction && action.alternativeAction) {
					followUpTrigger = true;
					const altCommand = action.alternativeAction.command;
					await this._commandService
						.executeCommand(altCommand.id, ...(altCommand.arguments || []))
						.then(undefined, onUnexpectedExternalError);
				} else if (action.snippetInfo) {
					const mainEdit = TextReplacement.delete(action.textReplacement.range);
					const additionalEdits = completion.additionalTextEdits.map(e => new TextReplacement(Range.lift(e.range), e.text ?? ''));
					const edit = TextEdit.fromParallelReplacementsUnsorted([mainEdit, ...additionalEdits]);
					editor.edit(edit, this._getMetadata(completion, this.textModel.getLanguageId()));

					editor.setPosition(action.snippetInfo.range.getStartPosition(), 'inlineCompletionAccept');
					SnippetController2.get(editor)?.insert(action.snippetInfo.snippet, { undoStopBefore: false });
				} else {
					const edits = state.edits;

					// The cursor should move to the end of the edit, not the end of the range provided by the extension
					// Inline Edit diffs (human readable) the suggestion from the extension so it already removes common suffix/prefix
					// Inline Completions does diff the suggestion so it may contain common suffix
					let minimalEdits = edits;
					if (state.kind === 'ghostText') {
						minimalEdits = removeTextReplacementCommonSuffixPrefix(edits, this.textModel);
					}
					const selections = getEndPositionsAfterApplying(minimalEdits).map(p => Selection.fromPositions(p));

					const additionalEdits = completion.additionalTextEdits.map(e => new TextReplacement(Range.lift(e.range), e.text ?? ''));
					const edit = TextEdit.fromParallelReplacementsUnsorted([...edits, ...additionalEdits]);

					editor.edit(edit, this._getMetadata(completion, this.textModel.getLanguageId()));

					if (completion.hint === undefined) {
						// do not move the cursor when the completion is displayed in a different location
						editor.setSelections(state.kind === 'inlineEdit' ? selections.slice(-1) : selections, 'inlineCompletionAccept');
					}

					if (state.kind === 'inlineEdit' && !this._accessibilityService.isMotionReduced()) {
						const editRanges = edit.getNewRanges();
						const dec = this._store.add(new FadeoutDecoration(editor, editRanges, () => {
							this._store.delete(dec);
						}));
					}
				}
			}

			this._onDidAccept.fire();

			// Reset before invoking the command, as the command might cause a follow up trigger (which we don't want to reset).
			this.stop();

			if (completion.command) {
				await this._commandService
					.executeCommand(completion.command.id, ...(completion.command.arguments || []))
					.then(undefined, onUnexpectedExternalError);
			}

			// TODO: how can we make alternative actions to retrigger?
			if (followUpTrigger) {
				this.trigger(undefined);
			}

			completion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Accepted, alternativeAction });
		} finally {
			completion.removeRef();
			this._inAcceptFlow.set(true, undefined);
			this._lastAcceptedInlineCompletionInfo = { textModelVersionIdAfter: this.textModel.getVersionId(), inlineCompletion: completion };
		}
	}

	public async acceptNextWord(): Promise<void> {
		await this._acceptNext(this._editor, 'word', (pos, text) => {
			const langId = this.textModel.getLanguageIdAtPosition(pos.lineNumber, pos.column);
			const config = this._languageConfigurationService.getLanguageConfiguration(langId);
			const wordRegExp = new RegExp(config.wordDefinition.source, config.wordDefinition.flags.replace('g', ''));

			const m1 = text.match(wordRegExp);
			let acceptUntilIndexExclusive = 0;
			if (m1 && m1.index !== undefined) {
				if (m1.index === 0) {
					acceptUntilIndexExclusive = m1[0].length;
				} else {
					acceptUntilIndexExclusive = m1.index;
				}
			} else {
				acceptUntilIndexExclusive = text.length;
			}

			const wsRegExp = /\s+/g;
			const m2 = wsRegExp.exec(text);
			if (m2 && m2.index !== undefined) {
				if (m2.index + m2[0].length < acceptUntilIndexExclusive) {
					acceptUntilIndexExclusive = m2.index + m2[0].length;
				}
			}
			return acceptUntilIndexExclusive;
		}, PartialAcceptTriggerKind.Word);
	}

	public async acceptNextLine(): Promise<void> {
		await this._acceptNext(this._editor, 'line', (pos, text) => {
			const m = text.match(/\n/);
			if (m && m.index !== undefined) {
				return m.index + 1;
			}
			return text.length;
		}, PartialAcceptTriggerKind.Line);
	}

	private async _acceptNext(editor: ICodeEditor, type: 'word' | 'line', getAcceptUntilIndex: (position: Position, text: string) => number, kind: PartialAcceptTriggerKind): Promise<void> {
		if (editor.getModel() !== this.textModel) {
			throw new BugIndicatingError();
		}

		const state = this.inlineCompletionState.get();
		if (!state || state.primaryGhostText.isEmpty() || !state.inlineSuggestion) {
			return;
		}
		const ghostText = state.primaryGhostText;
		const completion = state.inlineSuggestion;

		if (completion.snippetInfo) {
			// not in WYSIWYG mode, partial commit might change completion, thus it is not supported
			await this.accept(editor);
			return;
		}

		const firstPart = ghostText.parts[0];
		const ghostTextPos = new Position(ghostText.lineNumber, firstPart.column);
		const ghostTextVal = firstPart.text;
		const acceptUntilIndexExclusive = getAcceptUntilIndex(ghostTextPos, ghostTextVal);
		if (acceptUntilIndexExclusive === ghostTextVal.length && ghostText.parts.length === 1) {
			this.accept(editor);
			return;
		}
		const partialGhostTextVal = ghostTextVal.substring(0, acceptUntilIndexExclusive);

		const positions = this._positions.get();
		const cursorPosition = positions[0];

		// Executing the edit might free the completion, so we have to hold a reference on it.
		completion.addRef();
		try {
			this._isAcceptingPartially = true;
			try {
				editor.pushUndoStop();
				const replaceRange = Range.fromPositions(cursorPosition, ghostTextPos);
				const newText = editor.getModel()!.getValueInRange(replaceRange) + partialGhostTextVal;
				const primaryEdit = new TextReplacement(replaceRange, newText);
				const edits = [primaryEdit, ...getSecondaryEdits(this.textModel, positions, primaryEdit)].filter(isDefined);
				const selections = getEndPositionsAfterApplying(edits).map(p => Selection.fromPositions(p));

				editor.edit(TextEdit.fromParallelReplacementsUnsorted(edits), this._getMetadata(completion, type));
				editor.setSelections(selections, 'inlineCompletionPartialAccept');
				editor.revealPositionInCenterIfOutsideViewport(editor.getPosition()!, ScrollType.Smooth);
			} finally {
				this._isAcceptingPartially = false;
			}

			const acceptedRange = Range.fromPositions(completion.editRange.getStartPosition(), TextLength.ofText(partialGhostTextVal).addToPosition(ghostTextPos));
			// This assumes that the inline completion and the model use the same EOL style.
			const text = editor.getModel()!.getValueInRange(acceptedRange, EndOfLinePreference.LF);
			const acceptedLength = text.length;
			completion.reportPartialAccept(
				acceptedLength,
				{ kind, acceptedLength: acceptedLength },
				{ characters: acceptUntilIndexExclusive, ratio: acceptUntilIndexExclusive / ghostTextVal.length, count: 1 }
			);

		} finally {
			completion.removeRef();
		}
	}

	public handleSuggestAccepted(item: SuggestItemInfo) {
		const itemEdit = singleTextRemoveCommonPrefix(item.getSingleTextEdit(), this.textModel);
		const augmentedCompletion = this._computeAugmentation(itemEdit, undefined);
		if (!augmentedCompletion) { return; }

		// This assumes that the inline completion and the model use the same EOL style.
		const alreadyAcceptedLength = this.textModel.getValueInRange(augmentedCompletion.completion.editRange, EndOfLinePreference.LF).length;
		const acceptedLength = alreadyAcceptedLength + itemEdit.text.length;

		augmentedCompletion.completion.reportPartialAccept(itemEdit.text.length, {
			kind: PartialAcceptTriggerKind.Suggest,
			acceptedLength,
		}, {
			characters: itemEdit.text.length,
			count: 1,
			ratio: 1
		});
	}

	public extractReproSample(): Repro {
		const value = this.textModel.getValue();
		const item = this.state.get()?.inlineSuggestion;
		return {
			documentValue: value,
			inlineCompletion: item?.getSourceCompletion(),
		};
	}

	private readonly _jumpedToId = observableValue<undefined | string>(this, undefined);
	private readonly _inAcceptFlow = observableValue(this, false);
	public readonly inAcceptFlow: IObservable<boolean> = this._inAcceptFlow;

	public jump(): void {
		const s = this.inlineEditState.get();
		if (!s) { return; }

		const suggestion = s.inlineSuggestion;
		suggestion.addRef();
		try {
			transaction(tx => {
				if (suggestion.action?.kind === 'jumpTo') {
					this.stop(undefined, tx);
					suggestion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Accepted, alternativeAction: false });
				}

				this._jumpedToId.set(s.inlineSuggestion.semanticId, tx);
				this.dontRefetchSignal.trigger(tx);
				const targetRange = s.inlineSuggestion.targetRange;
				const targetPosition = targetRange.getStartPosition();
				this._editor.setPosition(targetPosition, 'inlineCompletions.jump');

				// TODO: consider using view information to reveal it
				const isSingleLineChange = targetRange.isSingleLine() && (s.inlineSuggestion.hint || (s.inlineSuggestion.action?.kind === 'edit' && !s.inlineSuggestion.action.textReplacement.text.includes('\n')));
				if (isSingleLineChange || s.inlineSuggestion.action?.kind === 'jumpTo') {
					this._editor.revealPosition(targetPosition, ScrollType.Smooth);
				} else {
					const revealRange = new Range(targetRange.startLineNumber - 1, 1, targetRange.endLineNumber + 1, 1);
					this._editor.revealRange(revealRange, ScrollType.Smooth);
				}

				s.inlineSuggestion.identity.setJumpTo(tx);

				this._editor.focus();
			});
		} finally {
			suggestion.removeRef();
		}
	}

	public async handleInlineSuggestionShown(inlineCompletion: InlineSuggestionItem, viewKind: InlineCompletionViewKind, viewData: InlineCompletionViewData, timeWhenShown: number): Promise<void> {
		await inlineCompletion.reportInlineEditShown(this._commandService, viewKind, viewData, this.textModel, timeWhenShown);
	}
}

interface Repro {
	documentValue: string;
	inlineCompletion: InlineCompletion | undefined;
}

export enum VersionIdChangeReason {
	Undo,
	Redo,
	AcceptWord,
	Other,
}

export function getSecondaryEdits(textModel: ITextModel, positions: readonly Position[], primaryTextRepl: TextReplacement): (TextReplacement | undefined)[] {
	if (positions.length === 1) {
		// No secondary cursor positions
		return [];
	}
	const text = new TextModelText(textModel);
	const textTransformer = text.getTransformer();
	const primaryOffset = textTransformer.getOffset(positions[0]);
	const secondaryOffsets = positions.slice(1).map(pos => textTransformer.getOffset(pos));

	primaryTextRepl = primaryTextRepl.removeCommonPrefixAndSuffix(text);
	const primaryStringRepl = textTransformer.getStringReplacement(primaryTextRepl);

	const deltaFromOffsetToRangeStart = primaryStringRepl.replaceRange.start - primaryOffset;
	const primaryContextRange = primaryStringRepl.replaceRange.join(OffsetRange.emptyAt(primaryOffset));
	const primaryContextValue = text.getValueOfOffsetRange(primaryContextRange);

	const replacements = secondaryOffsets.map(secondaryOffset => {
		const newRangeStart = secondaryOffset + deltaFromOffsetToRangeStart;
		const newRangeEnd = newRangeStart + primaryStringRepl.replaceRange.length;
		const range = new OffsetRange(newRangeStart, newRangeEnd);

		const contextRange = range.join(OffsetRange.emptyAt(secondaryOffset));
		const contextValue = text.getValueOfOffsetRange(contextRange);
		if (contextValue !== primaryContextValue) {
			return undefined;
		}

		const stringRepl = new StringReplacement(range, primaryStringRepl.newText);
		const repl = textTransformer.getTextReplacement(stringRepl);
		return repl;
	}).filter(isDefined);

	return replacements;
}

class FadeoutDecoration extends Disposable {
	constructor(
		editor: ICodeEditor,
		ranges: Range[],
		onDispose?: () => void,
	) {
		super();

		if (onDispose) {
			this._register({ dispose: () => onDispose() });
		}

		this._register(observableCodeEditor(editor).setDecorations(constObservable(ranges.map<IModelDeltaDecoration>(range => ({
			range: range,
			options: {
				description: 'animation',
				className: 'edits-fadeout-decoration',
				zIndex: 1,
			}
		})))));

		const animation = new AnimatedValue(1, 0, 1000, easeOutCubic);
		const val = new ObservableAnimatedValue(animation);

		this._register(autorun(reader => {
			const opacity = val.getValue(reader);
			editor.getContainerDomNode().style.setProperty('--animation-opacity', opacity.toString());
			if (animation.isFinished()) {
				this.dispose();
			}
		}));
	}
}

export function isSuggestionInViewport(editor: ICodeEditor, suggestion: InlineSuggestionItem, reader: IReader | undefined = undefined): boolean {
	const targetRange = suggestion.targetRange;

	// TODO make getVisibleRanges reactive!
	observableCodeEditor(editor).scrollTop.read(reader);
	const visibleRanges = editor.getVisibleRanges();

	if (visibleRanges.length < 1) {
		return false;
	}

	const viewportRange = new Range(
		visibleRanges[0].startLineNumber,
		visibleRanges[0].startColumn,
		visibleRanges[visibleRanges.length - 1].endLineNumber,
		visibleRanges[visibleRanges.length - 1].endColumn
	);
	return viewportRange.containsRange(targetRange);
}

function skuFromAccount(account: IDefaultAccount | null): InlineSuggestSku | undefined {
	if (account?.access_type_sku && account?.copilot_plan) {
		return { type: account.access_type_sku, plan: account.copilot_plan };
	}
	return undefined;
}

class DisposableCallback<T> {
	private _cb: ((e: T) => void) | undefined;

	constructor(cb: (e: T) => void) {
		this._cb = cb;
	}

	dispose(): void {
		this._cb = undefined;
	}

	readonly handler = (val: T) => {
		return this._cb?.(val);
	};
}

function createDisposableCb<T>(cb: (e: T) => void, store: DisposableStore): (e: T) => void {
	const dcb = new DisposableCallback(cb);
	store.add(dcb);
	return dcb.handler;
}
