/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { onUnexpectedError, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeyCodeChord } from '../../../../base/common/keybindings.js';
import { DisposableStore, dispose, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import * as platform from '../../../../base/common/platform.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { assertType, isObject } from '../../../../base/common/types.js';
import { StableEditorScrollState } from '../../../browser/stableEditorScroll.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorCommand, EditorContributionInstantiation, registerEditorAction, registerEditorCommand, registerEditorContribution, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { EditOperation } from '../../../common/core/editOperation.js';
import { IPosition, Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { IEditorContribution, ScrollType } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ITextModel, TrackedRangeStickiness } from '../../../common/model.js';
import { CompletionItemInsertTextRule, CompletionItemProvider, CompletionTriggerKind } from '../../../common/languages.js';
import { SnippetController2 } from '../../snippet/browser/snippetController2.js';
import { SnippetParser } from '../../snippet/browser/snippetParser.js';
import { ISuggestMemoryService } from './suggestMemory.js';
import { WordContextKey } from './wordContextKey.js';
import * as nls from '../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CompletionItem, Context as SuggestContext, ISuggestItemPreselector, suggestWidgetStatusbarMenu } from './suggest.js';
import { SuggestAlternatives } from './suggestAlternatives.js';
import { CommitCharacterController } from './suggestCommitCharacters.js';
import { State, SuggestModel } from './suggestModel.js';
import { OvertypingCapturer } from './suggestOvertypingCapturer.js';
import { ISelectedSuggestion, SuggestWidget } from './suggestWidget.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { basename, extname } from '../../../../base/common/resources.js';
import { hash } from '../../../../base/common/hash.js';
import { WindowIdleValue, getWindow } from '../../../../base/browser/dom.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';

// sticky suggest widget which doesn't disappear on focus out and such
const _sticky = false
	// || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
	;

class LineSuffix {

	private readonly _decorationOptions = ModelDecorationOptions.register({
		description: 'suggest-line-suffix',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	});

	private _marker: string | undefined;

	constructor(private readonly _model: ITextModel, private readonly _position: IPosition) {
		// spy on what's happening right of the cursor. two cases:
		// 1. end of line -> check that it's still end of line
		// 2. mid of line -> add a marker and compute the delta
		const maxColumn = _model.getLineMaxColumn(_position.lineNumber);
		if (maxColumn !== _position.column) {
			const offset = _model.getOffsetAt(_position);
			const end = _model.getPositionAt(offset + 1);
			_model.changeDecorations(accessor => {
				if (this._marker) {
					accessor.removeDecoration(this._marker);
				}
				this._marker = accessor.addDecoration(Range.fromPositions(_position, end), this._decorationOptions);
			});
		}
	}

	dispose(): void {
		if (this._marker && !this._model.isDisposed()) {
			this._model.changeDecorations(accessor => {
				accessor.removeDecoration(this._marker!);
				this._marker = undefined;
			});
		}
	}

	delta(position: IPosition): number {
		if (this._model.isDisposed() || this._position.lineNumber !== position.lineNumber) {
			// bail out early if things seems fishy
			return 0;
		}
		// read the marker (in case suggest was triggered at line end) or compare
		// the cursor to the line end.
		if (this._marker) {
			const range = this._model.getDecorationRange(this._marker);
			const end = this._model.getOffsetAt(range!.getStartPosition());
			return end - this._model.getOffsetAt(position);
		} else {
			return this._model.getLineMaxColumn(position.lineNumber) - position.column;
		}
	}
}

const enum InsertFlags {
	None = 0,
	NoBeforeUndoStop = 1,
	NoAfterUndoStop = 2,
	KeepAlternativeSuggestions = 4,
	AlternativeOverwriteConfig = 8
}

export class SuggestController implements IEditorContribution {

	public static readonly ID: string = 'editor.contrib.suggestController';

	public static get(editor: ICodeEditor): SuggestController | null {
		return editor.getContribution<SuggestController>(SuggestController.ID);
	}

	readonly editor: ICodeEditor;
	readonly model: SuggestModel;
	readonly widget: WindowIdleValue<SuggestWidget>;

	private readonly _alternatives: WindowIdleValue<SuggestAlternatives>;
	private readonly _lineSuffix = new MutableDisposable<LineSuffix>();
	private readonly _toDispose = new DisposableStore();
	private readonly _overtypingCapturer: WindowIdleValue<OvertypingCapturer>;
	private readonly _selectors = new PriorityRegistry<ISuggestItemPreselector>(s => s.priority);

	private readonly _onWillInsertSuggestItem = new Emitter<{ item: CompletionItem }>();
	readonly onWillInsertSuggestItem: Event<{ item: CompletionItem }> = this._onWillInsertSuggestItem.event;

	constructor(
		editor: ICodeEditor,
		@ISuggestMemoryService private readonly _memoryService: ISuggestMemoryService,
		@ICommandService private readonly _commandService: ICommandService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		this.editor = editor;
		this.model = _instantiationService.createInstance(SuggestModel, this.editor,);

		// default selector
		this._selectors.register({
			priority: 0,
			select: (model, pos, items) => this._memoryService.select(model, pos, items)
		});

		// context key: update insert/replace mode
		const ctxInsertMode = SuggestContext.InsertMode.bindTo(_contextKeyService);
		ctxInsertMode.set(editor.getOption(EditorOption.suggest).insertMode);
		this._toDispose.add(this.model.onDidTrigger(() => ctxInsertMode.set(editor.getOption(EditorOption.suggest).insertMode)));

		this.widget = this._toDispose.add(new WindowIdleValue(getWindow(editor.getDomNode()), () => {

			const widget = this._instantiationService.createInstance(SuggestWidget, this.editor);

			this._toDispose.add(widget);
			this._toDispose.add(widget.onDidSelect(item => this._insertSuggestion(item, InsertFlags.None), this));

			// Wire up logic to accept a suggestion on certain characters
			const commitCharacterController = new CommitCharacterController(this.editor, widget, this.model, item => this._insertSuggestion(item, InsertFlags.NoAfterUndoStop));
			this._toDispose.add(commitCharacterController);


			// Wire up makes text edit context key
			const ctxMakesTextEdit = SuggestContext.MakesTextEdit.bindTo(this._contextKeyService);
			const ctxHasInsertAndReplace = SuggestContext.HasInsertAndReplaceRange.bindTo(this._contextKeyService);
			const ctxCanResolve = SuggestContext.CanResolve.bindTo(this._contextKeyService);

			this._toDispose.add(toDisposable(() => {
				ctxMakesTextEdit.reset();
				ctxHasInsertAndReplace.reset();
				ctxCanResolve.reset();
			}));

			this._toDispose.add(widget.onDidFocus(({ item }) => {

				// (ctx: makesTextEdit)
				const position = this.editor.getPosition()!;
				const startColumn = item.editStart.column;
				const endColumn = position.column;
				let value = true;
				if (
					this.editor.getOption(EditorOption.acceptSuggestionOnEnter) === 'smart'
					&& this.model.state === State.Auto
					&& !item.completion.additionalTextEdits
					&& !(item.completion.insertTextRules! & CompletionItemInsertTextRule.InsertAsSnippet)
					&& endColumn - startColumn === item.completion.insertText.length
				) {
					const oldText = this.editor.getModel()!.getValueInRange({
						startLineNumber: position.lineNumber,
						startColumn,
						endLineNumber: position.lineNumber,
						endColumn
					});
					value = oldText !== item.completion.insertText;
				}
				ctxMakesTextEdit.set(value);

				// (ctx: hasInsertAndReplaceRange)
				ctxHasInsertAndReplace.set(!Position.equals(item.editInsertEnd, item.editReplaceEnd));

				// (ctx: canResolve)
				ctxCanResolve.set(Boolean(item.provider.resolveCompletionItem) || Boolean(item.completion.documentation) || item.completion.detail !== item.completion.label);
			}));

			this._toDispose.add(widget.onDetailsKeyDown(e => {
				// cmd + c on macOS, ctrl + c on Win / Linux
				if (
					e.toKeyCodeChord().equals(new KeyCodeChord(true, false, false, false, KeyCode.KeyC)) ||
					(platform.isMacintosh && e.toKeyCodeChord().equals(new KeyCodeChord(false, false, false, true, KeyCode.KeyC)))
				) {
					e.stopPropagation();
					return;
				}

				if (!e.toKeyCodeChord().isModifierKey()) {
					this.editor.focus();
				}
			}));

			return widget;
		}));

		// Wire up text overtyping capture
		this._overtypingCapturer = this._toDispose.add(new WindowIdleValue(getWindow(editor.getDomNode()), () => {
			return this._toDispose.add(new OvertypingCapturer(this.editor, this.model));
		}));

		this._alternatives = this._toDispose.add(new WindowIdleValue(getWindow(editor.getDomNode()), () => {
			return this._toDispose.add(new SuggestAlternatives(this.editor, this._contextKeyService));
		}));

		this._toDispose.add(_instantiationService.createInstance(WordContextKey, editor));

		this._toDispose.add(this.model.onDidTrigger(e => {
			this.widget.value.showTriggered(e.auto, e.shy ? 250 : 50);
			this._lineSuffix.value = new LineSuffix(this.editor.getModel()!, e.position);
		}));
		this._toDispose.add(this.model.onDidSuggest(e => {
			if (e.triggerOptions.shy) {
				return;
			}
			let index = -1;
			for (const selector of this._selectors.itemsOrderedByPriorityDesc) {
				index = selector.select(this.editor.getModel()!, this.editor.getPosition()!, e.completionModel.items);
				if (index !== -1) {
					break;
				}
			}
			if (index === -1) {
				index = 0;
			}
			if (this.model.state === State.Idle) {
				// selecting an item can "pump" out selection/cursor change events
				// which can cancel suggest halfway through this function. therefore
				// we need to check again and bail if the session has been canceled
				return;
			}
			let noFocus = false;
			if (e.triggerOptions.auto) {
				// don't "focus" item when configured to do
				const options = this.editor.getOption(EditorOption.suggest);
				if (options.selectionMode === 'never' || options.selectionMode === 'always') {
					// simple: always or never
					noFocus = options.selectionMode === 'never';

				} else if (options.selectionMode === 'whenTriggerCharacter') {
					// on with trigger character
					noFocus = e.triggerOptions.triggerKind !== CompletionTriggerKind.TriggerCharacter;

				} else if (options.selectionMode === 'whenQuickSuggestion') {
					// without trigger character or when refiltering
					noFocus = e.triggerOptions.triggerKind === CompletionTriggerKind.TriggerCharacter && !e.triggerOptions.refilter;
				}

			}
			this.widget.value.showSuggestions(e.completionModel, index, e.isFrozen, e.triggerOptions.auto, noFocus);
		}));
		this._toDispose.add(this.model.onDidCancel(e => {
			if (!e.retrigger) {
				this.widget.value.hideWidget();
			}
		}));
		this._toDispose.add(this.editor.onDidBlurEditorWidget(() => {
			if (!_sticky) {
				this.model.cancel();
				this.model.clear();
			}
		}));

		// Manage the acceptSuggestionsOnEnter context key
		const acceptSuggestionsOnEnter = SuggestContext.AcceptSuggestionsOnEnter.bindTo(_contextKeyService);
		const updateFromConfig = () => {
			const acceptSuggestionOnEnter = this.editor.getOption(EditorOption.acceptSuggestionOnEnter);
			acceptSuggestionsOnEnter.set(acceptSuggestionOnEnter === 'on' || acceptSuggestionOnEnter === 'smart');
		};
		this._toDispose.add(this.editor.onDidChangeConfiguration(() => updateFromConfig()));
		updateFromConfig();
	}

	dispose(): void {
		this._alternatives.dispose();
		this._toDispose.dispose();
		this.widget.dispose();
		this.model.dispose();
		this._lineSuffix.dispose();
		this._onWillInsertSuggestItem.dispose();
	}

	protected _insertSuggestion(
		event: ISelectedSuggestion | undefined,
		flags: InsertFlags
	): void {
		if (!event || !event.item) {
			this._alternatives.value.reset();
			this.model.cancel();
			this.model.clear();
			return;
		}
		if (!this.editor.hasModel()) {
			return;
		}
		const snippetController = SnippetController2.get(this.editor);
		if (!snippetController) {
			return;
		}

		this._onWillInsertSuggestItem.fire({ item: event.item });

		const model = this.editor.getModel();
		const modelVersionNow = model.getAlternativeVersionId();
		const { item } = event;

		//
		const tasks: Promise<any>[] = [];
		const cts = new CancellationTokenSource();

		// pushing undo stops *before* additional text edits and
		// *after* the main edit
		if (!(flags & InsertFlags.NoBeforeUndoStop)) {
			this.editor.pushUndoStop();
		}

		// compute overwrite[Before|After] deltas BEFORE applying extra edits
		const info = this.getOverwriteInfo(item, Boolean(flags & InsertFlags.AlternativeOverwriteConfig));

		// keep item in memory
		this._memoryService.memorize(model, this.editor.getPosition(), item);

		const isResolved = item.isResolved;

		// telemetry data points: duration of command execution, info about async additional edits (-1=n/a, -2=none, 1=success, 0=failed)
		let _commandExectionDuration = -1;
		let _additionalEditsAppliedAsync = -1;

		if (Array.isArray(item.completion.additionalTextEdits)) {

			// cancel -> stops all listening and closes widget
			this.model.cancel();

			// sync additional edits
			const scrollState = StableEditorScrollState.capture(this.editor);
			this.editor.executeEdits(
				'suggestController.additionalTextEdits.sync',
				item.completion.additionalTextEdits.map(edit => {
					let range = Range.lift(edit.range);
					if (range.startLineNumber === item.position.lineNumber && range.startColumn > item.position.column) {
						// shift additional edit when it is "after" the completion insertion position
						const columnDelta = this.editor.getPosition()!.column - item.position.column;
						const startColumnDelta = columnDelta;
						const endColumnDelta = Range.spansMultipleLines(range) ? 0 : columnDelta;
						range = new Range(range.startLineNumber, range.startColumn + startColumnDelta, range.endLineNumber, range.endColumn + endColumnDelta);
					}
					return EditOperation.replaceMove(range, edit.text);
				})
			);
			scrollState.restoreRelativeVerticalPositionOfCursor(this.editor);

		} else if (!isResolved) {
			// async additional edits
			const sw = new StopWatch();
			let position: IPosition | undefined;

			const docListener = model.onDidChangeContent(e => {
				if (e.isFlush) {
					cts.cancel();
					docListener.dispose();
					return;
				}
				for (const change of e.changes) {
					const thisPosition = Range.getEndPosition(change.range);
					if (!position || Position.isBefore(thisPosition, position)) {
						position = thisPosition;
					}
				}
			});

			const oldFlags = flags;
			flags |= InsertFlags.NoAfterUndoStop;
			let didType = false;
			const typeListener = this.editor.onWillType(() => {
				typeListener.dispose();
				didType = true;
				if (!(oldFlags & InsertFlags.NoAfterUndoStop)) {
					this.editor.pushUndoStop();
				}
			});

			tasks.push(item.resolve(cts.token).then(() => {
				if (!item.completion.additionalTextEdits || cts.token.isCancellationRequested) {
					return undefined;
				}
				if (position && item.completion.additionalTextEdits.some(edit => Position.isBefore(position!, Range.getStartPosition(edit.range)))) {
					return false;
				}
				if (didType) {
					this.editor.pushUndoStop();
				}
				const scrollState = StableEditorScrollState.capture(this.editor);
				this.editor.executeEdits(
					'suggestController.additionalTextEdits.async',
					item.completion.additionalTextEdits.map(edit => EditOperation.replaceMove(Range.lift(edit.range), edit.text))
				);
				scrollState.restoreRelativeVerticalPositionOfCursor(this.editor);
				if (didType || !(oldFlags & InsertFlags.NoAfterUndoStop)) {
					this.editor.pushUndoStop();
				}
				return true;
			}).then(applied => {
				this._logService.trace('[suggest] async resolving of edits DONE (ms, applied?)', sw.elapsed(), applied);
				_additionalEditsAppliedAsync = applied === true ? 1 : applied === false ? 0 : -2;
			}).finally(() => {
				docListener.dispose();
				typeListener.dispose();
			}));
		}

		let { insertText } = item.completion;
		if (!(item.completion.insertTextRules! & CompletionItemInsertTextRule.InsertAsSnippet)) {
			insertText = SnippetParser.escape(insertText);
		}

		// cancel -> stops all listening and closes widget
		this.model.cancel();

		snippetController.insert(insertText, {
			overwriteBefore: info.overwriteBefore,
			overwriteAfter: info.overwriteAfter,
			undoStopBefore: false,
			undoStopAfter: false,
			adjustWhitespace: !(item.completion.insertTextRules! & CompletionItemInsertTextRule.KeepWhitespace),
			clipboardText: event.model.clipboardText,
			overtypingCapturer: this._overtypingCapturer.value
		});

		if (!(flags & InsertFlags.NoAfterUndoStop)) {
			this.editor.pushUndoStop();
		}

		if (item.completion.command) {
			if (item.completion.command.id === TriggerSuggestAction.id) {
				// retigger
				this.model.trigger({ auto: true, retrigger: true });
			} else {
				// exec command, done
				const sw = new StopWatch();
				tasks.push(this._commandService.executeCommand(item.completion.command.id, ...(item.completion.command.arguments ? [...item.completion.command.arguments] : [])).catch(e => {
					if (item.completion.extensionId) {
						onUnexpectedExternalError(e);
					} else {
						onUnexpectedError(e);
					}
				}).finally(() => {
					_commandExectionDuration = sw.elapsed();
				}));
			}
		}

		if (flags & InsertFlags.KeepAlternativeSuggestions) {
			this._alternatives.value.set(event, next => {

				// cancel resolving of additional edits
				cts.cancel();

				// this is not so pretty. when inserting the 'next'
				// suggestion we undo until we are at the state at
				// which we were before inserting the previous suggestion...
				while (model.canUndo()) {
					if (modelVersionNow !== model.getAlternativeVersionId()) {
						model.undo();
					}
					this._insertSuggestion(
						next,
						InsertFlags.NoBeforeUndoStop | InsertFlags.NoAfterUndoStop | (flags & InsertFlags.AlternativeOverwriteConfig ? InsertFlags.AlternativeOverwriteConfig : 0)
					);
					break;
				}
			});
		}

		this._alertCompletionItem(item);

		// clear only now - after all tasks are done
		Promise.all(tasks).finally(() => {
			this._reportSuggestionAcceptedTelemetry(item, model, isResolved, _commandExectionDuration, _additionalEditsAppliedAsync, event.index, event.model.items);

			this.model.clear();
			cts.dispose();
		});
	}

	private _reportSuggestionAcceptedTelemetry(item: CompletionItem, model: ITextModel, itemResolved: boolean, commandExectionDuration: number, additionalEditsAppliedAsync: number, index: number, completionItems: CompletionItem[]): void {
		if (Math.random() > 0.0001) { // 0.01%
			return;
		}

		const labelMap = new Map<string, number[]>();

		for (let i = 0; i < Math.min(30, completionItems.length); i++) {
			const label = completionItems[i].textLabel;

			if (labelMap.has(label)) {
				labelMap.get(label)!.push(i);
			} else {
				labelMap.set(label, [i]);
			}
		}

		const firstIndexArray = labelMap.get(item.textLabel);
		const hasDuplicates = firstIndexArray && firstIndexArray.length > 1;
		const firstIndex = hasDuplicates ? firstIndexArray[0] : -1;

		type AcceptedSuggestion = {
			extensionId: string; providerId: string;
			fileExtension: string; languageId: string; basenameHash: string; kind: number;
			resolveInfo: number; resolveDuration: number;
			commandDuration: number;
			additionalEditsAsync: number;
			index: number; firstIndex: number;
		};
		type AcceptedSuggestionClassification = {
			owner: 'jrieken';
			comment: 'Information accepting completion items';
			extensionId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'Extension contributing the completions item' };
			providerId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'Provider of the completions item' };
			basenameHash: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'Hash of the basename of the file into which the completion was inserted' };
			fileExtension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'File extension of the file into which the completion was inserted' };
			languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Language type of the file into which the completion was inserted' };
			kind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The completion item kind' };
			resolveInfo: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'If the item was inserted before resolving was done' };
			resolveDuration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How long resolving took to finish' };
			commandDuration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How long a completion item command took' };
			additionalEditsAsync: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Info about asynchronously applying additional edits' };
			index: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The index of the completion item in the sorted list.' };
			firstIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When there are multiple completions, the index of the first instance.' };
		};

		this._telemetryService.publicLog2<AcceptedSuggestion, AcceptedSuggestionClassification>('suggest.acceptedSuggestion', {
			extensionId: item.extensionId?.value ?? 'unknown',
			providerId: item.provider._debugDisplayName ?? 'unknown',
			kind: item.completion.kind,
			basenameHash: hash(basename(model.uri)).toString(16),
			languageId: model.getLanguageId(),
			fileExtension: extname(model.uri),
			resolveInfo: !item.provider.resolveCompletionItem ? -1 : itemResolved ? 1 : 0,
			resolveDuration: item.resolveDuration,
			commandDuration: commandExectionDuration,
			additionalEditsAsync: additionalEditsAppliedAsync,
			index,
			firstIndex,
		});
	}

	getOverwriteInfo(item: CompletionItem, toggleMode: boolean): { overwriteBefore: number; overwriteAfter: number } {
		assertType(this.editor.hasModel());

		let replace = this.editor.getOption(EditorOption.suggest).insertMode === 'replace';
		if (toggleMode) {
			replace = !replace;
		}
		const overwriteBefore = item.position.column - item.editStart.column;
		const overwriteAfter = (replace ? item.editReplaceEnd.column : item.editInsertEnd.column) - item.position.column;
		const columnDelta = this.editor.getPosition().column - item.position.column;
		const suffixDelta = this._lineSuffix.value ? this._lineSuffix.value.delta(this.editor.getPosition()) : 0;

		return {
			overwriteBefore: overwriteBefore + columnDelta,
			overwriteAfter: overwriteAfter + suffixDelta
		};
	}

	private _alertCompletionItem(item: CompletionItem): void {
		if (isNonEmptyArray(item.completion.additionalTextEdits)) {
			const msg = nls.localize('aria.alert.snippet', "Accepting '{0}' made {1} additional edits", item.textLabel, item.completion.additionalTextEdits.length);
			alert(msg);
		}
	}

	triggerSuggest(onlyFrom?: Set<CompletionItemProvider>, auto?: boolean, noFilter?: boolean): void {
		if (this.editor.hasModel()) {
			this.model.trigger({
				auto: auto ?? false,
				completionOptions: { providerFilter: onlyFrom, kindFilter: noFilter ? new Set() : undefined }
			});
			this.editor.revealPosition(this.editor.getPosition(), ScrollType.Smooth);
			this.editor.focus();
		}
	}

	triggerSuggestAndAcceptBest(arg: { fallback: string }): void {
		if (!this.editor.hasModel()) {
			return;

		}
		const positionNow = this.editor.getPosition();

		const fallback = () => {
			if (positionNow.equals(this.editor.getPosition()!)) {
				this._commandService.executeCommand(arg.fallback);
			}
		};

		const makesTextEdit = (item: CompletionItem): boolean => {
			if (item.completion.insertTextRules! & CompletionItemInsertTextRule.InsertAsSnippet || item.completion.additionalTextEdits) {
				// snippet, other editor -> makes edit
				return true;
			}
			const position = this.editor.getPosition()!;
			const startColumn = item.editStart.column;
			const endColumn = position.column;
			if (endColumn - startColumn !== item.completion.insertText.length) {
				// unequal lengths -> makes edit
				return true;
			}
			const textNow = this.editor.getModel()!.getValueInRange({
				startLineNumber: position.lineNumber,
				startColumn,
				endLineNumber: position.lineNumber,
				endColumn
			});
			// unequal text -> makes edit
			return textNow !== item.completion.insertText;
		};

		Event.once(this.model.onDidTrigger)(_ => {
			// wait for trigger because only then the cancel-event is trustworthy
			const listener: IDisposable[] = [];

			Event.any<any>(this.model.onDidTrigger, this.model.onDidCancel)(() => {
				// retrigger or cancel -> try to type default text
				dispose(listener);
				fallback();
			}, undefined, listener);

			this.model.onDidSuggest(({ completionModel }) => {
				dispose(listener);
				if (completionModel.items.length === 0) {
					fallback();
					return;
				}
				const index = this._memoryService.select(this.editor.getModel()!, this.editor.getPosition()!, completionModel.items);
				const item = completionModel.items[index];
				if (!makesTextEdit(item)) {
					fallback();
					return;
				}
				this.editor.pushUndoStop();
				this._insertSuggestion({ index, item, model: completionModel }, InsertFlags.KeepAlternativeSuggestions | InsertFlags.NoBeforeUndoStop | InsertFlags.NoAfterUndoStop);

			}, undefined, listener);
		});

		this.model.trigger({ auto: false, shy: true });
		this.editor.revealPosition(positionNow, ScrollType.Smooth);
		this.editor.focus();
	}

	acceptSelectedSuggestion(keepAlternativeSuggestions: boolean, alternativeOverwriteConfig: boolean): void {
		const item = this.widget.value.getFocusedItem();
		let flags = 0;
		if (keepAlternativeSuggestions) {
			flags |= InsertFlags.KeepAlternativeSuggestions;
		}
		if (alternativeOverwriteConfig) {
			flags |= InsertFlags.AlternativeOverwriteConfig;
		}
		this._insertSuggestion(item, flags);
	}

	acceptNextSuggestion() {
		this._alternatives.value.next();
	}

	acceptPrevSuggestion() {
		this._alternatives.value.prev();
	}

	cancelSuggestWidget(): void {
		this.model.cancel();
		this.model.clear();
		this.widget.value.hideWidget();
	}

	focusSuggestion(): void {
		this.widget.value.focusSelected();
	}

	selectNextSuggestion(): void {
		this.widget.value.selectNext();
	}

	selectNextPageSuggestion(): void {
		this.widget.value.selectNextPage();
	}

	selectLastSuggestion(): void {
		this.widget.value.selectLast();
	}

	selectPrevSuggestion(): void {
		this.widget.value.selectPrevious();
	}

	selectPrevPageSuggestion(): void {
		this.widget.value.selectPreviousPage();
	}

	selectFirstSuggestion(): void {
		this.widget.value.selectFirst();
	}

	toggleSuggestionDetails(): void {
		this.widget.value.toggleDetails();
	}

	toggleExplainMode(): void {
		this.widget.value.toggleExplainMode();
	}

	toggleSuggestionFocus(): void {
		this.widget.value.toggleDetailsFocus();
	}

	resetWidgetSize(): void {
		this.widget.value.resetPersistedSize();
	}

	forceRenderingAbove() {
		this.widget.value.forceRenderingAbove();
	}

	stopForceRenderingAbove() {
		if (!this.widget.isInitialized) {
			// This method has no effect if the widget is not initialized yet.
			return;
		}
		this.widget.value.stopForceRenderingAbove();
	}

	registerSelector(selector: ISuggestItemPreselector): IDisposable {
		return this._selectors.register(selector);
	}
}

class PriorityRegistry<T> {
	private readonly _items = new Array<T>();

	constructor(private readonly prioritySelector: (item: T) => number) { }

	register(value: T): IDisposable {
		if (this._items.indexOf(value) !== -1) {
			throw new Error('Value is already registered');
		}
		this._items.push(value);
		this._items.sort((s1, s2) => this.prioritySelector(s2) - this.prioritySelector(s1));

		return {
			dispose: () => {
				const idx = this._items.indexOf(value);
				if (idx >= 0) {
					this._items.splice(idx, 1);
				}
			}
		};
	}

	get itemsOrderedByPriorityDesc(): readonly T[] {
		return this._items;
	}
}

export class TriggerSuggestAction extends EditorAction {

	static readonly id = 'editor.action.triggerSuggest';

	constructor() {
		super({
			id: TriggerSuggestAction.id,
			label: nls.localize2('suggest.trigger.label', "Trigger Suggest"),
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCompletionItemProvider, SuggestContext.Visible.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyCode.Space,
				secondary: [KeyMod.CtrlCmd | KeyCode.KeyI],
				mac: { primary: KeyMod.WinCtrl | KeyCode.Space, secondary: [KeyMod.Alt | KeyCode.Escape, KeyMod.CtrlCmd | KeyCode.KeyI] },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	run(_accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		const controller = SuggestController.get(editor);

		if (!controller) {
			return;
		}

		type TriggerArgs = { auto: boolean };
		let auto: boolean | undefined;
		if (args && typeof args === 'object') {
			if ((<TriggerArgs>args).auto === true) {
				auto = true;
			}
		}

		controller.triggerSuggest(undefined, auto, undefined);
	}
}

registerEditorContribution(SuggestController.ID, SuggestController, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorAction(TriggerSuggestAction);

const weight = KeybindingWeight.EditorContrib + 90;

const SuggestCommand = EditorCommand.bindToContribution<SuggestController>(SuggestController.get);


registerEditorCommand(new SuggestCommand({
	id: 'acceptSelectedSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.HasFocusedSuggestion),
	handler(x) {
		x.acceptSelectedSuggestion(true, false);
	},
	kbOpts: [{
		// normal tab
		primary: KeyCode.Tab,
		kbExpr: ContextKeyExpr.and(SuggestContext.Visible, EditorContextKeys.textInputFocus),
		weight,
	}, {
		// accept on enter has special rules
		primary: KeyCode.Enter,
		kbExpr: ContextKeyExpr.and(SuggestContext.Visible, EditorContextKeys.textInputFocus, SuggestContext.AcceptSuggestionsOnEnter, SuggestContext.MakesTextEdit),
		weight,
	}],
	menuOpts: [{
		menuId: suggestWidgetStatusbarMenu,
		title: nls.localize('accept.insert', "Insert"),
		group: 'left',
		order: 1,
		when: SuggestContext.HasInsertAndReplaceRange.toNegated()
	}, {
		menuId: suggestWidgetStatusbarMenu,
		title: nls.localize('accept.insert', "Insert"),
		group: 'left',
		order: 1,
		when: ContextKeyExpr.and(SuggestContext.HasInsertAndReplaceRange, SuggestContext.InsertMode.isEqualTo('insert'))
	}, {
		menuId: suggestWidgetStatusbarMenu,
		title: nls.localize('accept.replace', "Replace"),
		group: 'left',
		order: 1,
		when: ContextKeyExpr.and(SuggestContext.HasInsertAndReplaceRange, SuggestContext.InsertMode.isEqualTo('replace'))
	}]
}));

registerEditorCommand(new SuggestCommand({
	id: 'acceptAlternativeSelectedSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, EditorContextKeys.textInputFocus, SuggestContext.HasFocusedSuggestion),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyMod.Shift | KeyCode.Enter,
		secondary: [KeyMod.Shift | KeyCode.Tab],
	},
	handler(x) {
		x.acceptSelectedSuggestion(false, true);
	},
	menuOpts: [{
		menuId: suggestWidgetStatusbarMenu,
		group: 'left',
		order: 2,
		when: ContextKeyExpr.and(SuggestContext.HasInsertAndReplaceRange, SuggestContext.InsertMode.isEqualTo('insert')),
		title: nls.localize('accept.replace', "Replace")
	}, {
		menuId: suggestWidgetStatusbarMenu,
		group: 'left',
		order: 2,
		when: ContextKeyExpr.and(SuggestContext.HasInsertAndReplaceRange, SuggestContext.InsertMode.isEqualTo('replace')),
		title: nls.localize('accept.insert', "Insert")
	}]
}));


// continue to support the old command
CommandsRegistry.registerCommandAlias('acceptSelectedSuggestionOnEnter', 'acceptSelectedSuggestion');

registerEditorCommand(new SuggestCommand({
	id: 'hideSuggestWidget',
	precondition: SuggestContext.Visible,
	handler: x => x.cancelSuggestWidget(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'selectNextSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
	handler: c => c.selectNextSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.DownArrow,
		secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
		mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KeyN] }
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'selectNextPageSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
	handler: c => c.selectNextPageSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.PageDown,
		secondary: [KeyMod.CtrlCmd | KeyCode.PageDown]
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'selectLastSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
	handler: c => c.selectLastSuggestion()
}));

registerEditorCommand(new SuggestCommand({
	id: 'selectPrevSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
	handler: c => c.selectPrevSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.UpArrow,
		secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
		mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KeyP] }
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'selectPrevPageSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
	handler: c => c.selectPrevPageSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.PageUp,
		secondary: [KeyMod.CtrlCmd | KeyCode.PageUp]
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'selectFirstSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
	handler: c => c.selectFirstSuggestion()
}));

registerEditorCommand(new SuggestCommand({
	id: 'focusSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.HasFocusedSuggestion.negate()),
	handler: x => x.focusSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyMod.CtrlCmd | KeyCode.Space,
		secondary: [KeyMod.CtrlCmd | KeyCode.KeyI],
		mac: { primary: KeyMod.WinCtrl | KeyCode.Space, secondary: [KeyMod.CtrlCmd | KeyCode.KeyI] }
	},
}));

registerEditorCommand(new SuggestCommand({
	id: 'focusAndAcceptSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.HasFocusedSuggestion.negate()),
	handler: c => {
		c.focusSuggestion();
		c.acceptSelectedSuggestion(true, false);
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'toggleSuggestionDetails',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.HasFocusedSuggestion),
	handler: x => x.toggleSuggestionDetails(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyMod.CtrlCmd | KeyCode.Space,
		secondary: [KeyMod.CtrlCmd | KeyCode.KeyI],
		mac: { primary: KeyMod.WinCtrl | KeyCode.Space, secondary: [KeyMod.CtrlCmd | KeyCode.KeyI] }
	},
	menuOpts: [{
		menuId: suggestWidgetStatusbarMenu,
		group: 'right',
		order: 1,
		when: ContextKeyExpr.and(SuggestContext.DetailsVisible, SuggestContext.CanResolve),
		title: nls.localize('detail.more', "Show Less")
	}, {
		menuId: suggestWidgetStatusbarMenu,
		group: 'right',
		order: 1,
		when: ContextKeyExpr.and(SuggestContext.DetailsVisible.toNegated(), SuggestContext.CanResolve),
		title: nls.localize('detail.less', "Show More")
	}]
}));

registerEditorCommand(new SuggestCommand({
	id: 'toggleExplainMode',
	precondition: SuggestContext.Visible,
	handler: x => x.toggleExplainMode(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib,
		primary: KeyMod.CtrlCmd | KeyCode.Slash,
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'toggleSuggestionFocus',
	precondition: SuggestContext.Visible,
	handler: x => x.toggleSuggestionFocus(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Space,
		mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Space }
	}
}));

//#region tab completions

registerEditorCommand(new SuggestCommand({
	id: 'insertBestCompletion',
	precondition: ContextKeyExpr.and(
		EditorContextKeys.textInputFocus,
		ContextKeyExpr.equals('config.editor.tabCompletion', 'on'),
		WordContextKey.AtEnd,
		SuggestContext.Visible.toNegated(),
		SuggestAlternatives.OtherSuggestions.toNegated(),
		SnippetController2.InSnippetMode.toNegated()
	),
	handler: (x, arg) => {

		x.triggerSuggestAndAcceptBest(isObject(arg) ? { fallback: 'tab', ...arg } : { fallback: 'tab' });
	},
	kbOpts: {
		weight,
		primary: KeyCode.Tab
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'insertNextSuggestion',
	precondition: ContextKeyExpr.and(
		EditorContextKeys.textInputFocus,
		ContextKeyExpr.equals('config.editor.tabCompletion', 'on'),
		SuggestAlternatives.OtherSuggestions,
		SuggestContext.Visible.toNegated(),
		SnippetController2.InSnippetMode.toNegated()
	),
	handler: x => x.acceptNextSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.Tab
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'insertPrevSuggestion',
	precondition: ContextKeyExpr.and(
		EditorContextKeys.textInputFocus,
		ContextKeyExpr.equals('config.editor.tabCompletion', 'on'),
		SuggestAlternatives.OtherSuggestions,
		SuggestContext.Visible.toNegated(),
		SnippetController2.InSnippetMode.toNegated()
	),
	handler: x => x.acceptPrevSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyMod.Shift | KeyCode.Tab
	}
}));


registerEditorAction(class extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.resetSuggestSize',
			label: nls.localize2('suggest.reset.label', "Reset Suggest Widget Size"),
			precondition: undefined
		});
	}

	run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		SuggestController.get(editor)?.resetWidgetSize();
	}
});
