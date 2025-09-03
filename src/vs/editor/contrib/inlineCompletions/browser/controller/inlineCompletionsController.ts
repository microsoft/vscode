/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { timeout } from '../../../../../base/common/async.js';
import { cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { createHotClass } from '../../../../../base/common/hotReloadHelpers.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ITransaction, autorun, derived, derivedDisposable, derivedObservableWithCache, observableFromEvent, observableSignal, observableValue, runOnChange, runOnChangeWithStore, transaction, waitForState } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { isUndefined } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { hotClassGetOriginalInstance } from '../../../../../platform/observable/common/wrapInHotClass.js';
import { CoreEditingCommands } from '../../../../browser/coreCommands.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../browser/observableCodeEditor.js';
import { getOuterEditor } from '../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { CursorChangeReason } from '../../../../common/cursorEvents.js';
import { ILanguageFeatureDebounceService } from '../../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { InlineSuggestionHintsContentWidget } from '../hintsWidget/inlineCompletionsHintsWidget.js';
import { TextModelChangeRecorder } from '../model/changeRecorder.js';
import { InlineCompletionsModel } from '../model/inlineCompletionsModel.js';
import { ObservableSuggestWidgetAdapter } from '../model/suggestWidgetAdapter.js';
import { ObservableContextKeyService } from '../utils.js';
import { InlineCompletionsView } from '../view/inlineCompletionsView.js';
import { inlineSuggestCommitId } from './commandIds.js';
import { InlineCompletionContextKeys } from './inlineCompletionContextKeys.js';

export class InlineCompletionsController extends Disposable {
	private static readonly _instances = new Set<InlineCompletionsController>();

	public static hot = createHotClass(InlineCompletionsController);
	public static ID = 'editor.contrib.inlineCompletionsController';

	/**
	 * Find the controller in the focused editor or in the outer editor (if applicable)
	 */
	public static getInFocusedEditorOrParent(accessor: ServicesAccessor): InlineCompletionsController | null {
		const outerEditor = getOuterEditor(accessor);
		if (!outerEditor) {
			return null;
		}
		return InlineCompletionsController.get(outerEditor);
	}

	public static get(editor: ICodeEditor): InlineCompletionsController | null {
		return hotClassGetOriginalInstance(editor.getContribution<InlineCompletionsController>(InlineCompletionsController.ID));
	}

	private readonly _editorObs;
	private readonly _positions;

	private readonly _suggestWidgetAdapter;

	private readonly _enabledInConfig;
	private readonly _isScreenReaderEnabled;
	private readonly _editorDictationInProgress;
	private readonly _enabled;

	private readonly _debounceValue;

	private readonly _focusIsInMenu;
	private readonly _focusIsInEditorOrMenu;

	private readonly _cursorIsInIndentation;

	public readonly model;

	private readonly _playAccessibilitySignal;

	private readonly _hideInlineEditOnSelectionChange;

	protected readonly _view;

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICommandService private readonly _commandService: ICommandService,
		@ILanguageFeatureDebounceService private readonly _debounceService: ILanguageFeatureDebounceService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super();
		this._editorObs = observableCodeEditor(this.editor);
		this._positions = derived(this, reader => this._editorObs.selections.read(reader)?.map(s => s.getEndPosition()) ?? [new Position(1, 1)]);
		this._suggestWidgetAdapter = this._register(new ObservableSuggestWidgetAdapter(
			this._editorObs,
			item => this.model.get()?.handleSuggestAccepted(item),
			() => this.model.get()?.selectedInlineCompletion.get()?.getSingleTextEdit(),
		));
		this._enabledInConfig = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).enabled);
		this._isScreenReaderEnabled = observableFromEvent(this, this._accessibilityService.onDidChangeScreenReaderOptimized, () => this._accessibilityService.isScreenReaderOptimized());
		this._editorDictationInProgress = observableFromEvent(this,
			this._contextKeyService.onDidChangeContext,
			() => this._contextKeyService.getContext(this.editor.getDomNode()).getValue('editorDictation.inProgress') === true
		);
		this._enabled = derived(this, reader => this._enabledInConfig.read(reader) && (!this._isScreenReaderEnabled.read(reader) || !this._editorDictationInProgress.read(reader)));
		this._debounceValue = this._debounceService.for(
			this._languageFeaturesService.inlineCompletionsProvider,
			'InlineCompletionsDebounce',
			{ min: 50, max: 50 }
		);
		this._focusIsInMenu = observableValue<boolean>(this, false);
		this._focusIsInEditorOrMenu = derived(this, reader => {
			const editorHasFocus = this._editorObs.isFocused.read(reader);
			const menuHasFocus = this._focusIsInMenu.read(reader);
			return editorHasFocus || menuHasFocus;
		});
		this._cursorIsInIndentation = derived(this, reader => {
			const cursorPos = this._editorObs.cursorPosition.read(reader);
			if (cursorPos === null) { return false; }
			const model = this._editorObs.model.read(reader);
			if (!model) { return false; }
			this._editorObs.versionId.read(reader);
			const indentMaxColumn = model.getLineIndentColumn(cursorPos.lineNumber);
			return cursorPos.column <= indentMaxColumn;
		});
		this.model = derivedDisposable<InlineCompletionsModel | undefined>(this, reader => {
			if (this._editorObs.isReadonly.read(reader)) { return undefined; }
			const textModel = this._editorObs.model.read(reader);
			if (!textModel) { return undefined; }

			const model: InlineCompletionsModel = this._instantiationService.createInstance(
				InlineCompletionsModel,
				textModel,
				this._suggestWidgetAdapter.selectedItem,
				this._editorObs.versionId,
				this._positions,
				this._debounceValue,
				this._enabled,
				this.editor,
			);
			return model;
		}).recomputeInitiallyAndOnChange(this._store);
		this._playAccessibilitySignal = observableSignal(this);
		this._hideInlineEditOnSelectionChange = this._editorObs.getOption(EditorOption.inlineSuggest).map(val => true);
		this._view = this._register(this._instantiationService.createInstance(InlineCompletionsView, this.editor, this.model, this._focusIsInMenu));

		InlineCompletionsController._instances.add(this);
		this._register(toDisposable(() => InlineCompletionsController._instances.delete(this)));

		this._register(autorun(reader => {
			// Cancel all other inline completions when a new one starts
			const model = this.model.read(reader);
			if (!model) { return; }
			const state = model.state.read(reader);
			if (!state) { return; }
			if (!this._focusIsInEditorOrMenu.get()) { return; }

			// This controller is in focus, hence reject others.
			// However if we display a NES that relates to another edit then trigger NES on that related controller
			const nextEditUri = state.kind === 'inlineEdit' ? state.nextEditUri : undefined;
			for (const ctrl of InlineCompletionsController._instances) {
				if (ctrl === this) {
					continue;
				} else if (nextEditUri && isEqual(nextEditUri, ctrl.editor.getModel()?.uri)) {
					// The next edit in other edito is related to this controller, trigger it.
					ctrl.model.get()?.trigger();
				} else {
					ctrl.reject();
				}
			}
		}));
		this._register(autorun(reader => {
			// Cancel all other inline completions when a new one starts
			const model = this.model.read(reader);
			const uri = this.editor.getModel()?.uri;
			if (!model || !uri) { return; }

			// This NES was accepted, its possible there is an NES that points to this editor.
			// I.e. there's an NES that reads `Go To Next Edit`,
			// If there is one that points to this editor, then we need to hide that as this NES was accepted.
			reader.store.add(model.onDidAccept(() => {
				for (const ctrl of InlineCompletionsController._instances) {
					if (ctrl === this) {
						continue;
					}
					// Find the nes from another editor that points to this.
					const state = ctrl.model.get()?.state.get();
					if (state?.kind === 'inlineEdit' && isEqual(state.nextEditUri, uri)) {
						ctrl.model.get()?.stop('automatic');
					}
				}
			}));

		}));

		this._register(runOnChange(this._editorObs.onDidType, (_value, _changes) => {
			if (this._enabled.get()) {
				this.model.get()?.trigger();
			}
		}));

		this._register(runOnChange(this._editorObs.onDidPaste, (_value, _changes) => {
			if (this._enabled.get()) {
				this.model.get()?.trigger();
			}
		}));

		this._register(this._commandService.onDidExecuteCommand((e) => {
			// These commands don't trigger onDidType.
			const commands = new Set([
				CoreEditingCommands.Tab.id,
				CoreEditingCommands.DeleteLeft.id,
				CoreEditingCommands.DeleteRight.id,
				inlineSuggestCommitId,
				'acceptSelectedSuggestion',
			]);
			if (commands.has(e.commandId) && editor.hasTextFocus() && this._enabled.get()) {
				let noDelay = false;
				if (e.commandId === inlineSuggestCommitId) {
					noDelay = true;
				}
				this._editorObs.forceUpdate(tx => {
					/** @description onDidExecuteCommand */
					this.model.get()?.trigger(tx, { noDelay });
				});
			}
		}));

		this._register(runOnChange(this._editorObs.selections, (_value, _, changes) => {
			if (changes.some(e => e.reason === CursorChangeReason.Explicit || e.source === 'api')) {
				if (!this._hideInlineEditOnSelectionChange.get() && this.model.get()?.state.get()?.kind === 'inlineEdit') {
					return;
				}
				const m = this.model.get();
				if (!m) { return; }
				if (m.state.get()?.kind === 'ghostText') {
					this.model.get()?.stop();
				}
			}
		}));

		this._register(autorun(reader => {
			const isFocused = this._focusIsInEditorOrMenu.read(reader);
			const model = this.model.get();
			if (isFocused) {
				// If this model already has an NES for another editor, then leave as is
				// Else stop other models.
				const state = model?.state?.get();
				if (!state || state.kind !== 'inlineEdit' || !state.nextEditUri) {
					transaction(tx => {
						for (const ctrl of InlineCompletionsController._instances) {
							if (ctrl !== this) {
								ctrl.model.get()?.stop('automatic', tx);
							}
						}
					});
				}
				return;
			}

			// This is a hidden setting very useful for debugging
			if (this._contextKeyService.getContextKeyValue<boolean>('accessibleViewIsShown')
				|| this._configurationService.getValue('editor.inlineSuggest.keepOnBlur')
				|| editor.getOption(EditorOption.inlineSuggest).keepOnBlur
				|| InlineSuggestionHintsContentWidget.dropDownVisible) {
				return;
			}

			if (!model) { return; }
			if (model.state.get()?.inlineCompletion?.isFromExplicitRequest && model.inlineEditAvailable.get()) {
				// dont hide inline edits on blur when requested explicitly
				return;
			}

			transaction(tx => {
				/** @description InlineCompletionsController.onDidBlurEditorWidget */
				model.stop('automatic', tx);
			});
		}));

		this._register(autorun(reader => {
			/** @description InlineCompletionsController.forceRenderingAbove */
			const state = this.model.read(reader)?.inlineCompletionState.read(reader);
			if (state?.suggestItem) {
				if (state.primaryGhostText.lineCount >= 2) {
					this._suggestWidgetAdapter.forceRenderingAbove();
				}
			} else {
				this._suggestWidgetAdapter.stopForceRenderingAbove();
			}
		}));
		this._register(toDisposable(() => {
			this._suggestWidgetAdapter.stopForceRenderingAbove();
		}));

		const currentInlineCompletionBySemanticId = derivedObservableWithCache<string | undefined>(this, (reader, last) => {
			const model = this.model.read(reader);
			const state = model?.state.read(reader);
			if (this._suggestWidgetAdapter.selectedItem.get()) {
				return last;
			}
			return state?.inlineCompletion?.semanticId;
		});
		this._register(runOnChangeWithStore(derived(reader => {
			this._playAccessibilitySignal.read(reader);
			currentInlineCompletionBySemanticId.read(reader);
			return {};
		}), async (_value, _, _deltas, store) => {
			/** @description InlineCompletionsController.playAccessibilitySignalAndReadSuggestion */
			const model = this.model.get();
			const state = model?.state.get();
			if (!state || !model) { return; }
			const lineText = state.kind === 'ghostText' ? model.textModel.getLineContent(state.primaryGhostText.lineNumber) : '';

			await timeout(50, cancelOnDispose(store));
			await waitForState(this._suggestWidgetAdapter.selectedItem, isUndefined, () => false, cancelOnDispose(store));
			await this._accessibilitySignalService.playSignal(state.kind === 'ghostText' ? AccessibilitySignal.inlineSuggestion : AccessibilitySignal.nextEditSuggestion);

			if (this.editor.getOption(EditorOption.screenReaderAnnounceInlineSuggestion)) {
				if (state.kind === 'ghostText') {
					this._provideScreenReaderUpdate(state.primaryGhostText.renderForScreenReader(lineText));
				} else {
					this._provideScreenReaderUpdate(''); // Only announce Alt+F2
				}
			}
		}));

		// TODO@hediet
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('accessibility.verbosity.inlineCompletions')) {
				this.editor.updateOptions({ inlineCompletionsAccessibilityVerbose: this._configurationService.getValue('accessibility.verbosity.inlineCompletions') });
			}
		}));
		this.editor.updateOptions({ inlineCompletionsAccessibilityVerbose: this._configurationService.getValue('accessibility.verbosity.inlineCompletions') });

		const contextKeySvcObs = new ObservableContextKeyService(this._contextKeyService);

		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.cursorInIndentation, this._cursorIsInIndentation));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.hasSelection, reader => !this._editorObs.cursorSelection.read(reader)?.isEmpty()));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.cursorAtInlineEdit, this.model.map((m, reader) => m?.inlineEditState?.read(reader)?.cursorAtInlineEdit.read(reader))));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.tabShouldAcceptInlineEdit, this.model.map((m, r) => !!m?.tabShouldAcceptInlineEdit.read(r))));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.tabShouldJumpToInlineEdit, this.model.map((m, r) => !!m?.tabShouldJumpToInlineEdit.read(r))));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.inlineEditVisible, reader => this.model.read(reader)?.inlineEditState.read(reader) !== undefined));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.inlineSuggestionHasIndentation,
			reader => this.model.read(reader)?.getIndentationInfo(reader)?.startsWithIndentation
		));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.inlineSuggestionHasIndentationLessThanTabSize,
			reader => this.model.read(reader)?.getIndentationInfo(reader)?.startsWithIndentationLessThanTabSize
		));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.suppressSuggestions, reader => {
			const model = this.model.read(reader);
			const state = model?.inlineCompletionState.read(reader);
			return state?.primaryGhostText && state?.inlineCompletion ? state.inlineCompletion.source.inlineSuggestions.suppressSuggestions : undefined;
		}));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.inlineSuggestionVisible, reader => {
			const model = this.model.read(reader);
			const state = model?.inlineCompletionState.read(reader);
			return !!state?.inlineCompletion && state?.primaryGhostText !== undefined && !state?.primaryGhostText.isEmpty();
		}));
		const firstGhostTextPos = derived(this, reader => {
			const model = this.model.read(reader);
			const state = model?.inlineCompletionState.read(reader);
			const primaryGhostText = state?.primaryGhostText;
			if (!primaryGhostText || primaryGhostText.isEmpty()) {
				return undefined;
			}
			const firstPartPos = new Position(primaryGhostText.lineNumber, primaryGhostText.parts[0].column);
			return firstPartPos;
		});
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.cursorBeforeGhostText, reader => {
			const firstPartPos = firstGhostTextPos.read(reader);
			if (!firstPartPos) {
				return false;
			}
			const cursorPos = this._editorObs.cursorPosition.read(reader);
			if (!cursorPos) {
				return false;
			}
			return firstPartPos.equals(cursorPos);
		}));

		this._register(this._instantiationService.createInstance(TextModelChangeRecorder, this.editor));
	}

	public playAccessibilitySignal(tx: ITransaction) {
		this._playAccessibilitySignal.trigger(tx);
	}

	private _provideScreenReaderUpdate(content: string): void {
		const accessibleViewShowing = this._contextKeyService.getContextKeyValue<boolean>('accessibleViewIsShown');
		const accessibleViewKeybinding = this._keybindingService.lookupKeybinding('editor.action.accessibleView');
		let hint: string | undefined;
		if (!accessibleViewShowing && accessibleViewKeybinding && this.editor.getOption(EditorOption.inlineCompletionsAccessibilityVerbose)) {
			hint = localize('showAccessibleViewHint', "Inspect this in the accessible view ({0})", accessibleViewKeybinding.getAriaLabel());
		}
		alert(hint ? content + ', ' + hint : content);
	}

	public shouldShowHoverAt(range: Range) {
		const ghostText = this.model.get()?.primaryGhostText.get();
		if (!ghostText) {
			return false;
		}
		return ghostText.parts.some(p => range.containsPosition(new Position(ghostText.lineNumber, p.column)));
	}

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return this._view.shouldShowHoverAtViewZone(viewZoneId);
	}

	public reject(): void {
		transaction(tx => {
			const m = this.model.get();
			if (m) {
				m.stop('explicitCancel', tx);
				// Only if this controller is in focus can we cancel others.
				if (this._focusIsInEditorOrMenu.get()) {
					for (const ctrl of InlineCompletionsController._instances) {
						if (ctrl !== this) {
							ctrl.model.get()?.stop('automatic', tx);
						}
					}
				}
			}
		});
	}

	public jump(): void {
		const m = this.model.get();
		if (m) {
			m.jump();
		}
	}

	public testOnlyDisableUi() {
		this._view.dispose();
	}
}
