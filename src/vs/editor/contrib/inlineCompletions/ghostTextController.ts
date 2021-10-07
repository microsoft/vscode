/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorCommand, registerEditorAction, registerEditorCommand, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { inlineSuggestCommitId } from 'vs/editor/contrib/inlineCompletions/consts';
import { GhostTextModel } from 'vs/editor/contrib/inlineCompletions/ghostTextModel';
import { GhostTextWidget } from 'vs/editor/contrib/inlineCompletions/ghostTextWidget';
import * as nls from 'vs/nls';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';

export class GhostTextController extends Disposable {
	public static readonly inlineSuggestionVisible = new RawContextKey<boolean>('inlineSuggestionVisible', false, nls.localize('inlineSuggestionVisible', "Whether an inline suggestion is visible"));
	public static readonly inlineSuggestionHasIndentation = new RawContextKey<boolean>('inlineSuggestionHasIndentation', false, nls.localize('inlineSuggestionHasIndentation', "Whether the inline suggestion starts with whitespace"));

	static ID = 'editor.contrib.ghostTextController';

	public static get(editor: ICodeEditor): GhostTextController {
		return editor.getContribution<GhostTextController>(GhostTextController.ID);
	}

	private triggeredExplicitly = false;
	protected readonly activeController = this._register(new MutableDisposable<ActiveGhostTextController>());
	public get activeModel(): GhostTextModel | undefined {
		return this.activeController.value?.model;
	}

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this._register(this.editor.onDidChangeModel(() => {
			this.updateModelController();
		}));
		this._register(this.editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.suggest)) {
				this.updateModelController();
			}
			if (e.hasChanged(EditorOption.inlineSuggest)) {
				this.updateModelController();
			}
		}));
		this.updateModelController();
	}

	// Don't call this method when not neccessary. It will recreate the activeController.
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

	constructor(private readonly contextKeyService: IContextKeyService) {
	}
}

/**
 * The controller for a text editor with an initialized text model.
 * Must be disposed as soon as the model detaches from the editor.
*/
export class ActiveGhostTextController extends Disposable {
	private readonly contextKeys = new GhostTextContextKeys(this.contextKeyService);
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

		const ghostText = this.model.inlineCompletionsModel.ghostText;
		if (ghostText && ghostText.parts.length > 0) {
			const { column, lines } = ghostText.parts[0];
			const suggestionStartsWithWs = lines[0].startsWith(' ') || lines[0].startsWith('\t');

			const indentationEndColumn = this.editor.getModel().getLineIndentColumn(ghostText.lineNumber);
			const inIndentation = column <= indentationEndColumn;

			this.contextKeys.inlineCompletionSuggestsIndentation.set(
				!!this.model.activeInlineCompletionsModel
				&& suggestionStartsWithWs && inIndentation
			);
		} else {
			this.contextKeys.inlineCompletionSuggestsIndentation.set(false);
		}
	}
}

const GhostTextCommand = EditorCommand.bindToContribution(GhostTextController.get);

export const commitInlineSuggestionAction = new GhostTextCommand({
	id: inlineSuggestCommitId,
	precondition: GhostTextController.inlineSuggestionVisible,
	handler(x) {
		x.commit();
		x.editor.focus();
	}
});
registerEditorCommand(commitInlineSuggestionAction);
KeybindingsRegistry.registerKeybindingRule({
	primary: KeyCode.Tab,
	weight: 200,
	id: commitInlineSuggestionAction.id,
	when: ContextKeyExpr.and(
		commitInlineSuggestionAction.precondition,
		EditorContextKeys.tabMovesFocus.toNegated(),
		GhostTextController.inlineSuggestionHasIndentation.toNegated()
	),
});

registerEditorCommand(new GhostTextCommand({
	id: 'editor.action.inlineSuggest.hide',
	precondition: GhostTextController.inlineSuggestionVisible,
	kbOpts: {
		weight: 100,
		primary: KeyCode.Escape,
	},
	handler(x) {
		x.hide();
	}
}));

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
				primary: KeyMod.Alt | KeyCode.US_CLOSE_SQUARE_BRACKET,
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
				primary: KeyMod.Alt | KeyCode.US_OPEN_SQUARE_BRACKET,
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
		if (controller) {
			controller.trigger();
		}
	}
}

registerEditorContribution(GhostTextController.ID, GhostTextController);
registerEditorAction(TriggerInlineSuggestionAction);
registerEditorAction(ShowNextInlineSuggestionAction);
registerEditorAction(ShowPreviousInlineSuggestionAction);
