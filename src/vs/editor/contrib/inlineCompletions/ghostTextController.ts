/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorCommand, registerEditorAction, registerEditorCommand, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { GhostTextWidget } from 'vs/editor/contrib/inlineCompletions/ghostTextWidget';
import { InlineCompletionsModel } from 'vs/editor/contrib/inlineCompletions/inlineCompletionsModel';
import { SuggestWidgetAdapterModel } from 'vs/editor/contrib/inlineCompletions/suggestWidgetAdapterModel';
import * as nls from 'vs/nls';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

class GhostTextController extends Disposable {
	public static readonly inlineCompletionsVisible = new RawContextKey<boolean>('inlineCompletionsVisible ', false, nls.localize('inlineCompletionsVisible', "Whether inline suggestions are visible"));
	static ID = 'editor.contrib.ghostTextController';

	public static get(editor: ICodeEditor): GhostTextController {
		return editor.getContribution<GhostTextController>(GhostTextController.ID);
	}

	private readonly widget: GhostTextWidget;
	private readonly activeController = this._register(new MutableDisposable<ActiveGhostTextController>());

	private readonly contextKeys: GhostTextContextKeys;

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
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

	private updateModelController(): void {
		const suggestOptions = this.editor.getOption(EditorOption.suggest);

		this.activeController.value = undefined;
		this.activeController.value = this.editor.hasModel() && suggestOptions.showSuggestionPreview
			? new ActiveGhostTextController(this.editor, this.widget, this.contextKeys)
			: undefined;
	}

	public trigger(): void {
		this.activeController.value?.trigger();
	}

	public commit(): void {
		this.activeController.value?.commit();
	}

	public hide(): void {
		this.activeController.value?.hide();
	}

	public showNextInlineCompletion(): void {
		this.activeController.value?.showNextInlineCompletion();
	}

	public showPreviousInlineCompletion(): void {
		this.activeController.value?.showPreviousInlineCompletion();
	}
}

class GhostTextContextKeys {
	public readonly inlineCompletionVisible = GhostTextController.inlineCompletionsVisible.bindTo(this.contextKeyService);

	constructor(private readonly contextKeyService: IContextKeyService) {
	}
}

/**
 * The controller for a text editor with an initialized text model.
*/
export class ActiveGhostTextController extends Disposable {
	private readonly suggestWidgetAdapterModel = new SuggestWidgetAdapterModel(this.editor);
	private readonly inlineCompletionsModel = new InlineCompletionsModel(this.editor);

	constructor(
		private readonly editor: IActiveCodeEditor,
		private readonly widget: GhostTextWidget,
		private readonly contextKeys: GhostTextContextKeys,
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
		}));

		this._register(this.inlineCompletionsModel.onDidChange(() => {
			this.updateContextKeys();
		}));
	}

	private updateContextKeys(): void {
		this.contextKeys.inlineCompletionVisible.set(
			this.widget.model === this.inlineCompletionsModel
			&& this.inlineCompletionsModel.ghostText !== undefined
		);
	}

	public trigger(): void {
		if (this.widget.model === this.inlineCompletionsModel) {
			this.inlineCompletionsModel.startSession();
		}
	}

	public commit(): void {
		if (this.widget.model === this.inlineCompletionsModel) {
			this.inlineCompletionsModel.commitCurrentSuggestion();
		}
	}

	public hide(): void {
		if (this.widget.model === this.inlineCompletionsModel) {
			this.inlineCompletionsModel.hide();
		}
	}

	public showNextInlineCompletion(): void {
		if (this.widget.model === this.inlineCompletionsModel) {
			this.inlineCompletionsModel.showNextInlineCompletion();
		}
	}

	public showPreviousInlineCompletion(): void {
		if (this.widget.model === this.inlineCompletionsModel) {
			this.inlineCompletionsModel.showPreviousInlineCompletion();
		}
	}

	private updateModel() {
		this.widget.setModel(this.suggestWidgetAdapterModel.isActive ? this.suggestWidgetAdapterModel : this.inlineCompletionsModel);
		this.inlineCompletionsModel.setActive(this.widget.model === this.inlineCompletionsModel);
	}
}

const GhostTextCommand = EditorCommand.bindToContribution(GhostTextController.get);

registerEditorCommand(new GhostTextCommand({
	id: 'commitInlineCompletion',
	precondition: GhostTextController.inlineCompletionsVisible,
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
	constructor() {
		super({
			id: 'editor.action.showNextInlineCompletion',
			label: nls.localize('showNextInlineCompletion', "Show Next Inline Completion"),
			alias: 'Show Next Inline Completion',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: 100,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.RightArrow,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = GhostTextController.get(editor);
		if (controller) {
			controller.showNextInlineCompletion();
		}
	}
}

export class ShowPreviousInlineCompletionAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.showPreviousInlineCompletion',
			label: nls.localize('showPreviousInlineCompletion', "Show Previous Inline Completion"),
			alias: 'Show Previous Inline Completion',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: 100,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.LeftArrow,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = GhostTextController.get(editor);
		if (controller) {
			controller.showNextInlineCompletion();
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
