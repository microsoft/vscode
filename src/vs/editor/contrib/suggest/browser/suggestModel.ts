/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TimeoutTimer } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { getLeadingWhitespace, isHighSurrogate, isLowSurrogate } from 'vs/base/common/strings';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { CursorChangeReason, ICursorSelectionChangedEvent } from 'vs/editor/common/cursorEvents';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { ITextModel } from 'vs/editor/common/model';
import { CompletionContext, CompletionItemKind, CompletionItemProvider, CompletionTriggerKind } from 'vs/editor/common/languages';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { WordDistance } from 'vs/editor/contrib/suggest/browser/wordDistance';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ILogService } from 'vs/platform/log/common/log';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CompletionModel } from './completionModel';
import { CompletionDurations, CompletionItem, CompletionOptions, getSnippetSuggestSupport, getSuggestionComparator, provideSuggestionItems, QuickSuggestionsOptions, SnippetSortOrder } from './suggest';
import { IWordAtPosition } from 'vs/editor/common/core/wordHelper';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

export interface ICancelEvent {
	readonly retrigger: boolean;
}

export interface ITriggerEvent {
	readonly auto: boolean;
	readonly shy: boolean;
	readonly position: IPosition;
}

export interface ISuggestEvent {
	readonly completionModel: CompletionModel;
	readonly isFrozen: boolean;
	readonly auto: boolean;
	readonly shy: boolean;
}

export interface SuggestTriggerContext {
	readonly auto: boolean;
	readonly shy: boolean;
	readonly triggerKind?: CompletionTriggerKind;
	readonly triggerCharacter?: string;
}

export class LineContext {

	static shouldAutoTrigger(editor: ICodeEditor): boolean {
		if (!editor.hasModel()) {
			return false;
		}
		const model = editor.getModel();
		const pos = editor.getPosition();
		model.tokenization.tokenizeIfCheap(pos.lineNumber);

		const word = model.getWordAtPosition(pos);
		if (!word) {
			return false;
		}
		if (word.endColumn !== pos.column) {
			return false;
		}
		if (!isNaN(Number(word.word))) {
			return false;
		}
		return true;
	}

	readonly lineNumber: number;
	readonly column: number;
	readonly leadingLineContent: string;
	readonly leadingWord: IWordAtPosition;
	readonly auto: boolean;
	readonly shy: boolean;

	constructor(model: ITextModel, position: Position, auto: boolean, shy: boolean) {
		this.leadingLineContent = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
		this.leadingWord = model.getWordUntilPosition(position);
		this.lineNumber = position.lineNumber;
		this.column = position.column;
		this.auto = auto;
		this.shy = shy;
	}
}

export const enum State {
	Idle = 0,
	Manual = 1,
	Auto = 2
}

function isSuggestPreviewEnabled(editor: ICodeEditor): boolean {
	return editor.getOption(EditorOption.suggest).preview;
}

function canShowQuickSuggest(editor: ICodeEditor, contextKeyService: IContextKeyService, configurationService: IConfigurationService): boolean {
	if (!Boolean(contextKeyService.getContextKeyValue('inlineSuggestionVisible'))) {
		// Allow if there is no inline suggestion.
		return true;
	}

	const allowQuickSuggestions = configurationService.getValue('editor.inlineSuggest.allowQuickSuggestions');
	if (allowQuickSuggestions !== undefined) {
		// Use setting if available.
		return Boolean(allowQuickSuggestions);
	}

	// Don't allow if inline suggestions are visible and no suggest preview is configured.
	// TODO disabled for copilot
	return false && isSuggestPreviewEnabled(editor);
}

function canShowSuggestOnTriggerCharacters(editor: ICodeEditor, contextKeyService: IContextKeyService, configurationService: IConfigurationService): boolean {
	if (!Boolean(contextKeyService.getContextKeyValue('inlineSuggestionVisible'))) {
		// Allow if there is no inline suggestion.
		return true;
	}

	const allowQuickSuggestions = configurationService.getValue('editor.inlineSuggest.allowSuggestOnTriggerCharacters');
	if (allowQuickSuggestions !== undefined) {
		// Use setting if available.
		return Boolean(allowQuickSuggestions);
	}

	// Don't allow if inline suggestions are visible and no suggest preview is configured.
	// TODO disabled for copilot
	return false && isSuggestPreviewEnabled(editor);
}

export class SuggestModel implements IDisposable {

	private readonly _toDispose = new DisposableStore();
	private readonly _triggerCharacterListener = new DisposableStore();
	private readonly _triggerQuickSuggest = new TimeoutTimer();
	private _state: State = State.Idle;

	private _requestToken?: CancellationTokenSource;
	private _context?: LineContext;
	private _currentSelection: Selection;

	private _completionModel: CompletionModel | undefined;
	private readonly _completionDisposables = new DisposableStore();
	private readonly _onDidCancel = new Emitter<ICancelEvent>();
	private readonly _onDidTrigger = new Emitter<ITriggerEvent>();
	private readonly _onDidSuggest = new Emitter<ISuggestEvent>();

	readonly onDidCancel: Event<ICancelEvent> = this._onDidCancel.event;
	readonly onDidTrigger: Event<ITriggerEvent> = this._onDidTrigger.event;
	readonly onDidSuggest: Event<ISuggestEvent> = this._onDidSuggest.event;

	constructor(
		private readonly _editor: ICodeEditor,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
	) {
		this._currentSelection = this._editor.getSelection() || new Selection(1, 1, 1, 1);

		// wire up various listeners
		this._toDispose.add(this._editor.onDidChangeModel(() => {
			this._updateTriggerCharacters();
			this.cancel();
		}));
		this._toDispose.add(this._editor.onDidChangeModelLanguage(() => {
			this._updateTriggerCharacters();
			this.cancel();
		}));
		this._toDispose.add(this._editor.onDidChangeConfiguration(() => {
			this._updateTriggerCharacters();
		}));
		this._toDispose.add(this._languageFeaturesService.completionProvider.onDidChange(() => {
			this._updateTriggerCharacters();
			this._updateActiveSuggestSession();
		}));

		let editorIsComposing = false;
		this._toDispose.add(this._editor.onDidCompositionStart(() => {
			editorIsComposing = true;
		}));
		this._toDispose.add(this._editor.onDidCompositionEnd(() => {
			editorIsComposing = false;
			this._onCompositionEnd();
		}));
		this._toDispose.add(this._editor.onDidChangeCursorSelection(e => {
			// only trigger suggest when the editor isn't composing a character
			if (!editorIsComposing) {
				this._onCursorChange(e);
			}
		}));
		this._toDispose.add(this._editor.onDidChangeModelContent(() => {
			// only filter completions when the editor isn't composing a character
			// allow-any-unicode-next-line
			// e.g. ¨ + u makes ü but just ¨ cannot be used for filtering
			if (!editorIsComposing) {
				this._refilterCompletionItems();
			}
		}));

		this._updateTriggerCharacters();
	}

	dispose(): void {
		dispose(this._triggerCharacterListener);
		dispose([this._onDidCancel, this._onDidSuggest, this._onDidTrigger, this._triggerQuickSuggest]);
		this._toDispose.dispose();
		this._completionDisposables.dispose();
		this.cancel();
	}

	private _updateTriggerCharacters(): void {
		this._triggerCharacterListener.clear();

		if (this._editor.getOption(EditorOption.readOnly)
			|| !this._editor.hasModel()
			|| !this._editor.getOption(EditorOption.suggestOnTriggerCharacters)) {

			return;
		}

		const supportsByTriggerCharacter = new Map<string, Set<CompletionItemProvider>>();
		for (const support of this._languageFeaturesService.completionProvider.all(this._editor.getModel())) {
			for (const ch of support.triggerCharacters || []) {
				let set = supportsByTriggerCharacter.get(ch);
				if (!set) {
					set = new Set();
					set.add(getSnippetSuggestSupport());
					supportsByTriggerCharacter.set(ch, set);
				}
				set.add(support);
			}
		}


		const checkTriggerCharacter = (text?: string) => {

			if (!canShowSuggestOnTriggerCharacters(this._editor, this._contextKeyService, this._configurationService)) {
				return;
			}

			if (LineContext.shouldAutoTrigger(this._editor)) {
				// don't trigger by trigger characters when this is a case for quick suggest
				return;
			}

			if (!text) {
				// came here from the compositionEnd-event
				const position = this._editor.getPosition()!;
				const model = this._editor.getModel()!;
				text = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
			}

			let lastChar = '';
			if (isLowSurrogate(text.charCodeAt(text.length - 1))) {
				if (isHighSurrogate(text.charCodeAt(text.length - 2))) {
					lastChar = text.substr(text.length - 2);
				}
			} else {
				lastChar = text.charAt(text.length - 1);
			}

			const supports = supportsByTriggerCharacter.get(lastChar);
			if (supports) {
				// keep existing items that where not computed by the
				// supports/providers that want to trigger now
				const existing = this._completionModel
					? { items: this._completionModel.adopt(supports), clipboardText: this._completionModel.clipboardText }
					: undefined;
				this.trigger({ auto: true, shy: false, triggerCharacter: lastChar }, Boolean(this._completionModel), supports, existing);
			}
		};

		this._triggerCharacterListener.add(this._editor.onDidType(checkTriggerCharacter));
		this._triggerCharacterListener.add(this._editor.onDidCompositionEnd(() => checkTriggerCharacter()));
	}

	// --- trigger/retrigger/cancel suggest

	get state(): State {
		return this._state;
	}

	cancel(retrigger: boolean = false): void {
		if (this._state !== State.Idle) {
			this._triggerQuickSuggest.cancel();
			this._requestToken?.cancel();
			this._requestToken = undefined;
			this._state = State.Idle;
			this._completionModel = undefined;
			this._context = undefined;
			this._onDidCancel.fire({ retrigger });
		}
	}

	clear() {
		this._completionDisposables.clear();
	}

	private _updateActiveSuggestSession(): void {
		if (this._state !== State.Idle) {
			if (!this._editor.hasModel() || !this._languageFeaturesService.completionProvider.has(this._editor.getModel())) {
				this.cancel();
			} else {
				this.trigger({ auto: this._state === State.Auto, shy: false }, true);
			}
		}
	}

	private _onCursorChange(e: ICursorSelectionChangedEvent): void {

		if (!this._editor.hasModel()) {
			return;
		}

		const prevSelection = this._currentSelection;
		this._currentSelection = this._editor.getSelection();

		if (!e.selection.isEmpty()
			|| (e.reason !== CursorChangeReason.NotSet && e.reason !== CursorChangeReason.Explicit)
			|| (e.source !== 'keyboard' && e.source !== 'deleteLeft')
		) {
			// Early exit if nothing needs to be done!
			// Leave some form of early exit check here if you wish to continue being a cursor position change listener ;)
			this.cancel();
			return;
		}


		if (this._state === State.Idle && e.reason === CursorChangeReason.NotSet) {
			if (prevSelection.containsRange(this._currentSelection) || prevSelection.getEndPosition().isBeforeOrEqual(this._currentSelection.getPosition())) {
				// cursor did move RIGHT due to typing -> trigger quick suggest
				this._doTriggerQuickSuggest();
			}

		} else if (this._state !== State.Idle && e.reason === CursorChangeReason.Explicit) {
			// suggest is active and something like cursor keys are used to move
			// the cursor. this means we can refilter at the new position
			this._refilterCompletionItems();
		}
	}

	private _onCompositionEnd(): void {
		// trigger or refilter when composition ends
		if (this._state === State.Idle) {
			this._doTriggerQuickSuggest();
		} else {
			this._refilterCompletionItems();
		}
	}

	private _doTriggerQuickSuggest(): void {

		if (QuickSuggestionsOptions.isAllOff(this._editor.getOption(EditorOption.quickSuggestions))) {
			// not enabled
			return;
		}

		if (this._editor.getOption(EditorOption.suggest).snippetsPreventQuickSuggestions && SnippetController2.get(this._editor)?.isInSnippet()) {
			// no quick suggestion when in snippet mode
			return;
		}

		this.cancel();

		this._triggerQuickSuggest.cancelAndSet(() => {
			if (this._state !== State.Idle) {
				return;
			}
			if (!LineContext.shouldAutoTrigger(this._editor)) {
				return;
			}
			if (!this._editor.hasModel() || !this._editor.hasWidgetFocus()) {
				return;
			}
			const model = this._editor.getModel();
			const pos = this._editor.getPosition();
			// validate enabled now
			const config = this._editor.getOption(EditorOption.quickSuggestions);
			if (QuickSuggestionsOptions.isAllOff(config)) {
				return;
			}

			if (!QuickSuggestionsOptions.isAllOn(config)) {
				// Check the type of the token that triggered this
				model.tokenization.tokenizeIfCheap(pos.lineNumber);
				const lineTokens = model.tokenization.getLineTokens(pos.lineNumber);
				const tokenType = lineTokens.getStandardTokenType(lineTokens.findTokenIndexAtOffset(Math.max(pos.column - 1 - 1, 0)));
				if (QuickSuggestionsOptions.valueFor(config, tokenType) !== 'on') {
					return;
				}
			}

			if (!canShowQuickSuggest(this._editor, this._contextKeyService, this._configurationService)) {
				// do not trigger quick suggestions if inline suggestions are shown
				return;
			}

			if (!this._languageFeaturesService.completionProvider.has(model)) {
				return;
			}

			// we made it till here -> trigger now
			this.trigger({ auto: true, shy: false });

		}, this._editor.getOption(EditorOption.quickSuggestionsDelay));
	}

	private _refilterCompletionItems(): void {
		// Re-filter suggestions. This MUST run async because filtering/scoring
		// uses the model content AND the cursor position. The latter is NOT
		// updated when the document has changed (the event which drives this method)
		// and therefore a little pause (next mirco task) is needed. See:
		// https://stackoverflow.com/questions/25915634/difference-between-microtask-and-macrotask-within-an-event-loop-context#25933985
		Promise.resolve().then(() => {
			if (this._state === State.Idle) {
				return;
			}
			if (!this._editor.hasModel()) {
				return;
			}
			const model = this._editor.getModel();
			const position = this._editor.getPosition();
			const ctx = new LineContext(model, position, this._state === State.Auto, false);
			this._onNewContext(ctx);
		});
	}

	trigger(context: SuggestTriggerContext, retrigger: boolean = false, onlyFrom?: Set<CompletionItemProvider>, existing?: { items: CompletionItem[]; clipboardText: string | undefined }, noFilter?: boolean): void {
		if (!this._editor.hasModel()) {
			return;
		}

		const model = this._editor.getModel();
		const auto = context.auto;
		const ctx = new LineContext(model, this._editor.getPosition(), auto, context.shy);

		// Cancel previous requests, change state & update UI
		this.cancel(retrigger);
		this._state = auto ? State.Auto : State.Manual;
		this._onDidTrigger.fire({ auto, shy: context.shy, position: this._editor.getPosition() });

		// Capture context when request was sent
		this._context = ctx;

		// Build context for request
		let suggestCtx: CompletionContext = { triggerKind: context.triggerKind ?? CompletionTriggerKind.Invoke };
		if (context.triggerCharacter) {
			suggestCtx = {
				triggerKind: CompletionTriggerKind.TriggerCharacter,
				triggerCharacter: context.triggerCharacter
			};
		}

		this._requestToken = new CancellationTokenSource();

		// kind filter and snippet sort rules
		const snippetSuggestions = this._editor.getOption(EditorOption.snippetSuggestions);
		let snippetSortOrder = SnippetSortOrder.Inline;
		switch (snippetSuggestions) {
			case 'top':
				snippetSortOrder = SnippetSortOrder.Top;
				break;
			// 	↓ that's the default anyways...
			// case 'inline':
			// 	snippetSortOrder = SnippetSortOrder.Inline;
			// 	break;
			case 'bottom':
				snippetSortOrder = SnippetSortOrder.Bottom;
				break;
		}

		const { itemKind: itemKindFilter, showDeprecated } = SuggestModel._createSuggestFilter(this._editor);
		const completionOptions = new CompletionOptions(snippetSortOrder, !noFilter ? itemKindFilter : new Set(), onlyFrom, showDeprecated);
		const wordDistance = WordDistance.create(this._editorWorkerService, this._editor);

		const completions = provideSuggestionItems(
			this._languageFeaturesService.completionProvider,
			model,
			this._editor.getPosition(),
			completionOptions,
			suggestCtx,
			this._requestToken.token
		);

		Promise.all([completions, wordDistance]).then(async ([completions, wordDistance]) => {

			this._requestToken?.dispose();

			if (!this._editor.hasModel()) {
				return;
			}

			let clipboardText = existing?.clipboardText;
			if (!clipboardText && completions.needsClipboard) {
				clipboardText = await this._clipboardService.readText();
			}

			if (this._state === State.Idle) {
				return;
			}

			const model = this._editor.getModel();
			let items = completions.items;

			if (existing) {
				const cmpFn = getSuggestionComparator(snippetSortOrder);
				items = items.concat(existing.items).sort(cmpFn);
			}

			const ctx = new LineContext(model, this._editor.getPosition(), auto, context.shy);
			this._completionModel = new CompletionModel(items, this._context!.column, {
				leadingLineContent: ctx.leadingLineContent,
				characterCountDelta: ctx.column - this._context!.column
			},
				wordDistance,
				this._editor.getOption(EditorOption.suggest),
				this._editor.getOption(EditorOption.snippetSuggestions),
				undefined,
				clipboardText
			);

			// store containers so that they can be disposed later
			this._completionDisposables.add(completions.disposable);

			this._onNewContext(ctx);

			// finally report telemetry about durations
			this._reportDurationsTelemetry(completions.durations);

		}).catch(onUnexpectedError);
	}

	private _telemetryGate: number = 0;

	private _reportDurationsTelemetry(durations: CompletionDurations): void {

		if (this._telemetryGate++ % 230 !== 0) {
			return;
		}

		setTimeout(() => {
			type Durations = { data: string };
			type DurationsClassification = {
				owner: 'jrieken';
				comment: 'Completions performance numbers';
				data: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth' };
			};
			this._telemetryService.publicLog2<Durations, DurationsClassification>('suggest.durations.json', { data: JSON.stringify(durations) });
			this._logService.debug('suggest.durations.json', durations);
		});
	}

	private static _createSuggestFilter(editor: ICodeEditor): { itemKind: Set<CompletionItemKind>; showDeprecated: boolean } {
		// kind filter and snippet sort rules
		const result = new Set<CompletionItemKind>();

		// snippet setting
		const snippetSuggestions = editor.getOption(EditorOption.snippetSuggestions);
		if (snippetSuggestions === 'none') {
			result.add(CompletionItemKind.Snippet);
		}

		// type setting
		const suggestOptions = editor.getOption(EditorOption.suggest);
		if (!suggestOptions.showMethods) { result.add(CompletionItemKind.Method); }
		if (!suggestOptions.showFunctions) { result.add(CompletionItemKind.Function); }
		if (!suggestOptions.showConstructors) { result.add(CompletionItemKind.Constructor); }
		if (!suggestOptions.showFields) { result.add(CompletionItemKind.Field); }
		if (!suggestOptions.showVariables) { result.add(CompletionItemKind.Variable); }
		if (!suggestOptions.showClasses) { result.add(CompletionItemKind.Class); }
		if (!suggestOptions.showStructs) { result.add(CompletionItemKind.Struct); }
		if (!suggestOptions.showInterfaces) { result.add(CompletionItemKind.Interface); }
		if (!suggestOptions.showModules) { result.add(CompletionItemKind.Module); }
		if (!suggestOptions.showProperties) { result.add(CompletionItemKind.Property); }
		if (!suggestOptions.showEvents) { result.add(CompletionItemKind.Event); }
		if (!suggestOptions.showOperators) { result.add(CompletionItemKind.Operator); }
		if (!suggestOptions.showUnits) { result.add(CompletionItemKind.Unit); }
		if (!suggestOptions.showValues) { result.add(CompletionItemKind.Value); }
		if (!suggestOptions.showConstants) { result.add(CompletionItemKind.Constant); }
		if (!suggestOptions.showEnums) { result.add(CompletionItemKind.Enum); }
		if (!suggestOptions.showEnumMembers) { result.add(CompletionItemKind.EnumMember); }
		if (!suggestOptions.showKeywords) { result.add(CompletionItemKind.Keyword); }
		if (!suggestOptions.showWords) { result.add(CompletionItemKind.Text); }
		if (!suggestOptions.showColors) { result.add(CompletionItemKind.Color); }
		if (!suggestOptions.showFiles) { result.add(CompletionItemKind.File); }
		if (!suggestOptions.showReferences) { result.add(CompletionItemKind.Reference); }
		if (!suggestOptions.showColors) { result.add(CompletionItemKind.Customcolor); }
		if (!suggestOptions.showFolders) { result.add(CompletionItemKind.Folder); }
		if (!suggestOptions.showTypeParameters) { result.add(CompletionItemKind.TypeParameter); }
		if (!suggestOptions.showSnippets) { result.add(CompletionItemKind.Snippet); }
		if (!suggestOptions.showUsers) { result.add(CompletionItemKind.User); }
		if (!suggestOptions.showIssues) { result.add(CompletionItemKind.Issue); }

		return { itemKind: result, showDeprecated: suggestOptions.showDeprecated };
	}

	private _onNewContext(ctx: LineContext): void {

		if (!this._context) {
			// happens when 24x7 IntelliSense is enabled and still in its delay
			return;
		}

		if (ctx.lineNumber !== this._context.lineNumber) {
			// e.g. happens when pressing Enter while IntelliSense is computed
			this.cancel();
			return;
		}

		if (getLeadingWhitespace(ctx.leadingLineContent) !== getLeadingWhitespace(this._context.leadingLineContent)) {
			// cancel IntelliSense when line start changes
			// happens when the current word gets outdented
			this.cancel();
			return;
		}

		if (ctx.column < this._context.column) {
			// typed -> moved cursor LEFT -> retrigger if still on a word
			if (ctx.leadingWord.word) {
				this.trigger({ auto: this._context.auto, shy: false }, true);
			} else {
				this.cancel();
			}
			return;
		}

		if (!this._completionModel) {
			// happens when IntelliSense is not yet computed
			return;
		}

		if (ctx.leadingWord.word.length !== 0 && ctx.leadingWord.startColumn > this._context.leadingWord.startColumn) {
			// started a new word while IntelliSense shows -> retrigger

			// Select those providers have not contributed to this completion model and re-trigger completions for
			// them. Also adopt the existing items and merge them into the new completion model
			const inactiveProvider = new Set(this._languageFeaturesService.completionProvider.all(this._editor.getModel()!));
			for (let provider of this._completionModel.allProvider) {
				inactiveProvider.delete(provider);
			}
			const items = this._completionModel.adopt(new Set());
			this.trigger({ auto: this._context.auto, shy: false }, true, inactiveProvider, { items, clipboardText: this._completionModel.clipboardText });
			return;
		}

		if (ctx.column > this._context.column && this._completionModel.incomplete.size > 0 && ctx.leadingWord.word.length !== 0) {
			// typed -> moved cursor RIGHT & incomple model & still on a word -> retrigger
			const { incomplete } = this._completionModel;
			const items = this._completionModel.adopt(incomplete);
			this.trigger({ auto: this._state === State.Auto, shy: false, triggerKind: CompletionTriggerKind.TriggerForIncompleteCompletions }, true, incomplete, { items, clipboardText: this._completionModel.clipboardText });

		} else {
			// typed -> moved cursor RIGHT -> update UI
			let oldLineContext = this._completionModel.lineContext;
			let isFrozen = false;

			this._completionModel.lineContext = {
				leadingLineContent: ctx.leadingLineContent,
				characterCountDelta: ctx.column - this._context.column
			};

			if (this._completionModel.items.length === 0) {

				if (LineContext.shouldAutoTrigger(this._editor) && this._context.leadingWord.endColumn < ctx.leadingWord.startColumn) {
					// retrigger when heading into a new word
					this.trigger({ auto: this._context.auto, shy: false }, true);
					return;
				}

				if (!this._context.auto) {
					// freeze when IntelliSense was manually requested
					this._completionModel.lineContext = oldLineContext;
					isFrozen = this._completionModel.items.length > 0;

					if (isFrozen && ctx.leadingWord.word.length === 0) {
						// there were results before but now there aren't
						// and also we are not on a word anymore -> cancel
						this.cancel();
						return;
					}

				} else {
					// nothing left
					this.cancel();
					return;
				}
			}

			this._onDidSuggest.fire({
				completionModel: this._completionModel,
				auto: this._context.auto,
				shy: this._context.shy,
				isFrozen,
			});
		}
	}
}
