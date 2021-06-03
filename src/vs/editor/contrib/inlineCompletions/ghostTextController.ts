/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Range } from 'vs/editor/common/core/range';
import { Disposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorCommand, registerEditorAction, registerEditorCommand, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { GhostTextWidget } from 'vs/editor/contrib/inlineCompletions/ghostTextWidget';
import { InlineCompletionsModel } from 'vs/editor/contrib/inlineCompletions/inlineCompletionsModel';
import { SuggestWidgetAdapterModel } from 'vs/editor/contrib/inlineCompletions/suggestWidgetAdapterModel';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class GhostTextController extends Disposable {
	public static readonly inlineCompletionsVisible = new RawContextKey<boolean>('inlineCompletionsVisible ', false, nls.localize('inlineCompletionsVisible', "Whether inline suggestions are visible"));
	public static readonly inlineCompletionSuggestsIndentation = new RawContextKey<boolean>('inlineCompletionSuggestsIndentation', false, nls.localize('inlineCompletionSuggestsIndentation', "Whether the inline suggestion suggests extending indentation"));

	static ID = 'editor.contrib.ghostTextController';

	public static get(editor: ICodeEditor): GhostTextController {
		return editor.getContribution<GhostTextController>(GhostTextController.ID);
	}

	private readonly widget: GhostTextWidget;
	private readonly activeController = this._register(new MutableDisposable<ActiveGhostTextController>());
	private readonly contextKeys: GhostTextContextKeys;
	private triggeredExplicitly = false;

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.contextKeys = new GhostTextContextKeys(contextKeyService);

		this.widget = this._register(instantiationService.createInstance(GhostTextWidget, this.editor));

		this._register(this.editor.onDidChangeModel(() => {
			this.updateModelController();
		}));
		this._register(this.editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.suggest)) {
				this.updateModelController();
			}
		}));
		this.updateModelController();
	}

	// Don't call this method when not neccessary. It will recreate the activeController.
	private updateModelController(): void {
		const suggestOptions = this.editor.getOption(EditorOption.suggest);

		this.activeController.value = undefined;
		// ActiveGhostTextController is only created if one of those settings is set or if the inline completions are triggered explicitly.
		this.activeController.value =
			this.editor.hasModel() && (suggestOptions.showSuggestionPreview || suggestOptions.showInlineCompletions || this.triggeredExplicitly)
				? this.instantiationService.createInstance(
					ActiveGhostTextController,
					this.editor,
					this.widget,
					this.contextKeys
				)
				: undefined;
	}

	public shouldShowHoverAt(hoverRange: Range): boolean {
		return this.activeController.value?.shouldShowHoverAt(hoverRange) || false;
	}

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return this.widget.shouldShowHoverAtViewZone(viewZoneId);
	}

	public trigger(): void {
		this.triggeredExplicitly = true;
		if (!this.activeController.value) {
			this.updateModelController();
		}
		this.activeController.value?.triggerInlineCompletion();
	}

	public commit(): void {
		this.activeController.value?.commitInlineCompletion();
	}

	public hide(): void {
		this.activeController.value?.hideInlineCompletion();
	}

	public showNextInlineCompletion(): void {
		this.activeController.value?.showNextInlineCompletion();
	}

	public showPreviousInlineCompletion(): void {
		this.activeController.value?.showPreviousInlineCompletion();
	}
}

// TODO: This should be local state to the editor.
// The global state should depend on the local state of the currently focused editor.
// Currently the global state is updated directly, which may lead to conflicts if multiple ghost texts are active.
class GhostTextContextKeys {
	private lastInlineCompletionVisibleValue = false;
	private readonly inlineCompletionVisible = GhostTextController.inlineCompletionsVisible.bindTo(this.contextKeyService);

	private lastInlineCompletionSuggestsIndentationValue = false;
	private readonly inlineCompletionSuggestsIndentation = GhostTextController.inlineCompletionSuggestsIndentation.bindTo(this.contextKeyService);

	constructor(private readonly contextKeyService: IContextKeyService) {
	}

	public setInlineCompletionVisible(value: boolean): void {
		// Only modify the context key if we actually changed it.
		// Thus, we don't overwrite values set by someone else.
		if (value !== this.lastInlineCompletionVisibleValue) {
			this.inlineCompletionVisible.set(value);
			this.lastInlineCompletionVisibleValue = value;
		}
	}

	public setInlineCompletionSuggestsIndentation(value: boolean): void {
		if (value !== this.lastInlineCompletionSuggestsIndentationValue) {
			this.inlineCompletionSuggestsIndentation.set(value);
			this.lastInlineCompletionSuggestsIndentationValue = value;
		}
	}
}

/**
 * The controller for a text editor with an initialized text model.
*/
export class ActiveGhostTextController extends Disposable {
	private readonly suggestWidgetAdapterModel = this._register(new SuggestWidgetAdapterModel(this.editor));
	private readonly inlineCompletionsModel = this._register(new InlineCompletionsModel(this.editor, this.commandService));

	private get activeInlineCompletionsModel(): InlineCompletionsModel | undefined {
		if (this.widget.model === this.inlineCompletionsModel) {
			return this.inlineCompletionsModel;
		}
		return undefined;
	}

	constructor(
		private readonly editor: IActiveCodeEditor,
		private readonly widget: GhostTextWidget,
		private readonly contextKeys: GhostTextContextKeys,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this._register(this.suggestWidgetAdapterModel.onDidChange(() => {
			this.updateModel();
		}));
		this.updateModel();

		this._register(toDisposable(() => {
			if (widget.model === this.suggestWidgetAdapterModel || widget.model === this.inlineCompletionsModel) {
				widget.setModel(undefined);
			}
			this.contextKeys.setInlineCompletionVisible(false);
			this.contextKeys.setInlineCompletionSuggestsIndentation(false);
		}));

		if (this.inlineCompletionsModel) {
			this._register(this.inlineCompletionsModel.onDidChange(() => {
				this.updateContextKeys();
			}));
		}
	}

	private updateContextKeys(): void {
		this.contextKeys.setInlineCompletionVisible(
			this.activeInlineCompletionsModel?.ghostText !== undefined
		);

		if (this.inlineCompletionsModel?.ghostText) {
			const firstLine = this.inlineCompletionsModel.ghostText.lines[0] || '';
			const suggestionStartsWithWs = firstLine.startsWith(' ') || firstLine.startsWith('\t');
			const p = this.inlineCompletionsModel.ghostText.position;
			const indentationEndColumn = this.editor.getModel().getLineIndentColumn(p.lineNumber);
			const inIndentation = p.column <= indentationEndColumn;

			this.contextKeys.setInlineCompletionSuggestsIndentation(
				this.widget.model === this.inlineCompletionsModel
				&& suggestionStartsWithWs && inIndentation
			);
		} else {
			this.contextKeys.setInlineCompletionSuggestsIndentation(false);
		}
	}

	public shouldShowHoverAt(hoverRange: Range): boolean {
		const ghostText = this.activeInlineCompletionsModel?.ghostText;
		if (ghostText) {
			return hoverRange.containsPosition(ghostText.position);
		}
		return false;
	}

	public triggerInlineCompletion(): void {
		this.activeInlineCompletionsModel?.startSession();
	}

	public commitInlineCompletion(): void {
		this.activeInlineCompletionsModel?.commitCurrentSuggestion();
	}

	public hideInlineCompletion(): void {
		this.activeInlineCompletionsModel?.hide();
	}

	public showNextInlineCompletion(): void {
		this.activeInlineCompletionsModel?.showNext();
	}

	public showPreviousInlineCompletion(): void {
		this.activeInlineCompletionsModel?.showPrevious();
	}

	private updateModel() {
		this.widget.setModel(
			this.suggestWidgetAdapterModel.isActive
				? this.suggestWidgetAdapterModel
				: this.inlineCompletionsModel
		);
		this.inlineCompletionsModel?.setActive(this.widget.model === this.inlineCompletionsModel);
	}
}

const GhostTextCommand = EditorCommand.bindToContribution(GhostTextController.get);

registerEditorCommand(new GhostTextCommand({
	id: 'commitInlineCompletion',
	precondition: ContextKeyExpr.and(
		GhostTextController.inlineCompletionsVisible,
		GhostTextController.inlineCompletionSuggestsIndentation.toNegated(),
		EditorContextKeys.tabMovesFocus.toNegated()
	),
	kbOpts: {
		weight: 100,
		primary: KeyCode.Tab,
	},
	handler(x) {
		x.commit();
	}
}));

registerEditorCommand(new GhostTextCommand({
	id: 'hideInlineCompletion',
	precondition: GhostTextController.inlineCompletionsVisible,
	kbOpts: {
		weight: 100,
		primary: KeyCode.Escape,
	},
	handler(x) {
		x.hide();
	}
}));

export class ShowNextInlineCompletionAction extends EditorAction {
	public static ID = 'editor.action.showNextInlineCompletion';
	constructor() {
		super({
			id: ShowNextInlineCompletionAction.ID,
			label: nls.localize('showNextInlineCompletion', "Show Next Inline Completion"),
			alias: 'Show Next Inline Completion',
			precondition: EditorContextKeys.writable,
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

export class ShowPreviousInlineCompletionAction extends EditorAction {
	public static ID = 'editor.action.showPreviousInlineCompletion';
	constructor() {
		super({
			id: ShowPreviousInlineCompletionAction.ID,
			label: nls.localize('showPreviousInlineCompletion', "Show Previous Inline Completion"),
			alias: 'Show Previous Inline Completion',
			precondition: EditorContextKeys.writable,
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

export class TriggerInlineCompletionsAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.triggerInlineCompletions',
			label: nls.localize('triggerInlineCompletionsAction', "Trigger Inline Completions"),
			alias: 'Trigger Inline Completions',
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
registerEditorAction(TriggerInlineCompletionsAction);
registerEditorAction(ShowNextInlineCompletionAction);
registerEditorAction(ShowPreviousInlineCompletionAction);
