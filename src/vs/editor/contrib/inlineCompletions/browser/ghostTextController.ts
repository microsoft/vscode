/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { firstNonWhitespaceIndex } from 'vs/base/common/strings';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { CursorColumns } from 'vs/editor/common/core/cursorColumns';
import { Range } from 'vs/editor/common/core/range';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { GhostTextModel } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextModel';
import { GhostTextWidget } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextWidget';
import * as nls from 'vs/nls';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

export class GhostTextController extends Disposable {
	public static readonly inlineSuggestionVisible = new RawContextKey<boolean>('inlineSuggestionVisible', false, nls.localize('inlineSuggestionVisible', "Whether an inline suggestion is visible"));
	public static readonly inlineSuggestionHasIndentation = new RawContextKey<boolean>('inlineSuggestionHasIndentation', false, nls.localize('inlineSuggestionHasIndentation', "Whether the inline suggestion starts with whitespace"));
	public static readonly inlineSuggestionHasIndentationLessThanTabSize = new RawContextKey<boolean>('inlineSuggestionHasIndentationLessThanTabSize', true, nls.localize('inlineSuggestionHasIndentationLessThanTabSize', "Whether the inline suggestion starts with whitespace that is less than what would be inserted by tab"));
	/**
	 * Enables to use Ctrl+Left to undo partially accepted inline completions.
	 */
	public static readonly canUndoInlineSuggestion = new RawContextKey<boolean>('canUndoInlineSuggestion', false, nls.localize('canUndoInlineSuggestion', "Whether undo would undo an inline suggestion"));

	static ID = 'editor.contrib.ghostTextController';

	public static get(editor: ICodeEditor): GhostTextController | null {
		return editor.getContribution<GhostTextController>(GhostTextController.ID);
	}

	private triggeredExplicitly = false;
	protected readonly activeController = this._register(new MutableDisposable<ActiveGhostTextController>());
	public get activeModel(): GhostTextModel | undefined {
		return this.activeController.value?.model;
	}

	private readonly activeModelDidChangeEmitter = this._register(new Emitter<void>());
	public readonly onActiveModelDidChange = this.activeModelDidChangeEmitter.event;

	/**
	 * Tracks the first alternative version id until which only partial inline suggestions can be undone.
	 * Any other content change will invalidate this.
	 * This field is used to set the corresponding context key.
	 */
	private firstUndoableVersionId: number | undefined = undefined;

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(this.editor.onDidChangeModelContent((e) => {
			if (!e.isUndoing || this.firstUndoableVersionId && this.editor.getModel()!.getAlternativeVersionId() < this.firstUndoableVersionId) {
				this.activeController.value?.contextKeys.canUndoInlineSuggestion.reset();
				this.firstUndoableVersionId = undefined; // Will be set again if this change was caused by an inline suggestion.
			}
		}));

		this._register(this.editor.onDidChangeCursorPosition((e) => {
			if (e.reason === CursorChangeReason.Explicit) {
				this.activeController.value?.contextKeys.canUndoInlineSuggestion.reset();
				this.firstUndoableVersionId = undefined;
			}
		}));

		this._register(this.editor.onDidChangeModel(() => {
			this.updateModelController();
		}));
		this._register(this.editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.suggest) || e.hasChanged(EditorOption.inlineSuggest)) {
				this.updateModelController();
			}
		}));
		this.updateModelController();
	}

	// Don't call this method when not necessary. It will recreate the activeController.
	private updateModelController(): void {
		const suggestOptions = this.editor.getOption(EditorOption.suggest);
		const inlineSuggestOptions = this.editor.getOption(EditorOption.inlineSuggest);

		this.activeController.value = undefined;
		// ActiveGhostTextController is only created if one of those settings is set or if the inline completions are triggered explicitly.
		this.activeController.value =
			this.editor.hasModel() && (suggestOptions.preview || inlineSuggestOptions.enabled || this.triggeredExplicitly)
				? this.instantiationService.createInstance(
					ActiveGhostTextController,
					this.editor
				)
				: undefined;
		this.activeModelDidChangeEmitter.fire();
	}

	public shouldShowHoverAt(hoverRange: Range): boolean {
		return this.activeModel?.shouldShowHoverAt(hoverRange) || false;
	}

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return this.activeController.value?.widget?.shouldShowHoverAtViewZone(viewZoneId) || false;
	}

	public trigger(): void {
		this.triggeredExplicitly = true;
		if (!this.activeController.value) {
			this.updateModelController();
		}
		this.activeModel?.triggerInlineCompletion();
	}

	public commitPartially(): void {
		const nextVersion = this.firstUndoableVersionId; // Read this before committing, as it will be reset.
		this.activeModel?.commitInlineCompletionPartially();
		this.activeController?.value?.contextKeys.canUndoInlineSuggestion.set(true);
		// Don't override this field if the previous command already accepted some inline suggestion.
		this.firstUndoableVersionId = nextVersion ?? this.editor.getModel()!.getAlternativeVersionId();
	}

	public commit(): void {
		this.activeModel?.commitInlineCompletion();
	}

	public hide(): void {
		this.activeModel?.hideInlineCompletion();
	}

	public showNextInlineCompletion(): void {
		this.activeModel?.showNextInlineCompletion();
	}

	public showPreviousInlineCompletion(): void {
		this.activeModel?.showPreviousInlineCompletion();
	}

	public async hasMultipleInlineCompletions(): Promise<boolean> {
		const result = await this.activeModel?.hasMultipleInlineCompletions();
		return result !== undefined ? result : false;
	}
}

class GhostTextContextKeys {
	public readonly inlineCompletionVisible = GhostTextController.inlineSuggestionVisible.bindTo(this.contextKeyService);
	public readonly inlineCompletionSuggestsIndentation = GhostTextController.inlineSuggestionHasIndentation.bindTo(this.contextKeyService);
	public readonly inlineCompletionSuggestsIndentationLessThanTabSize = GhostTextController.inlineSuggestionHasIndentationLessThanTabSize.bindTo(this.contextKeyService);
	public readonly canUndoInlineSuggestion = GhostTextController.canUndoInlineSuggestion.bindTo(this.contextKeyService);

	constructor(private readonly contextKeyService: IContextKeyService) {
	}
}

/**
 * The controller for a text editor with an initialized text model.
 * Must be disposed as soon as the model detaches from the editor.
*/
export class ActiveGhostTextController extends Disposable {
	public readonly contextKeys = new GhostTextContextKeys(this.contextKeyService);
	public readonly model = this._register(this.instantiationService.createInstance(GhostTextModel, this.editor));
	public readonly widget = this._register(this.instantiationService.createInstance(GhostTextWidget, this.editor, this.model));

	constructor(
		private readonly editor: IActiveCodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this._register(toDisposable(() => {
			this.contextKeys.inlineCompletionVisible.set(false);
			this.contextKeys.inlineCompletionSuggestsIndentation.set(false);
			this.contextKeys.inlineCompletionSuggestsIndentationLessThanTabSize.set(true);
		}));

		this._register(this.model.onDidChange(() => {
			this.updateContextKeys();
		}));
		this.updateContextKeys();
	}

	private updateContextKeys(): void {
		this.contextKeys.inlineCompletionVisible.set(
			this.model.activeInlineCompletionsModel?.ghostText !== undefined
		);

		let startsWithIndentation = false;
		let startsWithIndentationLessThanTabSize = true;

		const ghostText = this.model.inlineCompletionsModel.ghostText;
		if (!!this.model.activeInlineCompletionsModel && ghostText && ghostText.parts.length > 0) {
			const { column, lines } = ghostText.parts[0];

			const firstLine = lines[0];

			const indentationEndColumn = this.editor.getModel().getLineIndentColumn(ghostText.lineNumber);
			const inIndentation = column <= indentationEndColumn;

			if (inIndentation) {
				let firstNonWsIdx = firstNonWhitespaceIndex(firstLine);
				if (firstNonWsIdx === -1) {
					firstNonWsIdx = firstLine.length - 1;
				}
				startsWithIndentation = firstNonWsIdx > 0;

				const tabSize = this.editor.getModel().getOptions().tabSize;
				const visibleColumnIndentation = CursorColumns.visibleColumnFromColumn(firstLine, firstNonWsIdx + 1, tabSize);
				startsWithIndentationLessThanTabSize = visibleColumnIndentation < tabSize;
			}
		}

		this.contextKeys.inlineCompletionSuggestsIndentation.set(startsWithIndentation);
		this.contextKeys.inlineCompletionSuggestsIndentationLessThanTabSize.set(startsWithIndentationLessThanTabSize);
	}
}


export class ShowNextInlineSuggestionAction extends EditorAction {
	public static ID = 'editor.action.inlineSuggest.showNext';
	constructor() {
		super({
			id: ShowNextInlineSuggestionAction.ID,
			label: nls.localize('action.inlineSuggest.showNext', "Show Next Inline Suggestion"),
			alias: 'Show Next Inline Suggestion',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, GhostTextController.inlineSuggestionVisible),
			kbOpts: {
				weight: 100,
				primary: KeyMod.Alt | KeyCode.BracketRight,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = GhostTextController.get(editor);
		if (controller) {
			controller.showNextInlineCompletion();
			editor.focus();
		}
	}
}

export class ShowPreviousInlineSuggestionAction extends EditorAction {
	public static ID = 'editor.action.inlineSuggest.showPrevious';
	constructor() {
		super({
			id: ShowPreviousInlineSuggestionAction.ID,
			label: nls.localize('action.inlineSuggest.showPrevious', "Show Previous Inline Suggestion"),
			alias: 'Show Previous Inline Suggestion',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, GhostTextController.inlineSuggestionVisible),
			kbOpts: {
				weight: 100,
				primary: KeyMod.Alt | KeyCode.BracketLeft,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = GhostTextController.get(editor);
		if (controller) {
			controller.showPreviousInlineCompletion();
			editor.focus();
		}
	}
}

export class TriggerInlineSuggestionAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.trigger',
			label: nls.localize('action.inlineSuggest.trigger', "Trigger Inline Suggestion"),
			alias: 'Trigger Inline Suggestion',
			precondition: EditorContextKeys.writable
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = GhostTextController.get(editor);
		controller?.trigger();
	}
}

export class AcceptNextWordOfInlineCompletion extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.acceptNextWord',
			label: nls.localize('action.inlineSuggest.acceptNextWord', "Accept Next Word Of Inline Suggestion"),
			alias: 'Accept Next Word Of Inline Suggestion',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, GhostTextController.inlineSuggestionVisible),
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
			}
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = GhostTextController.get(editor);
		if (controller) {
			controller.commitPartially();
		}
	}
}

KeybindingsRegistry.registerKeybindingRule({
	id: 'undo',
	weight: KeybindingWeight.EditorContrib + 1,
	primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
	when: ContextKeyExpr.and(EditorContextKeys.writable, GhostTextController.canUndoInlineSuggestion),
});
