/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorCommand, EditorContributionInstantiation, registerEditorAction, registerEditorCommand, registerEditorContribution, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import * as languages from '../../../common/languages.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ParameterHintsModel, TriggerContext } from './parameterHintsModel.js';
import { Context } from './provideSignatureHelp.js';
import * as nls from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ParameterHintsWidget } from './parameterHintsWidget.js';

export class ParameterHintsController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.controller.parameterHints';

	public static get(editor: ICodeEditor): ParameterHintsController | null {
		return editor.getContribution<ParameterHintsController>(ParameterHintsController.ID);
	}

	private readonly editor: ICodeEditor;
	private readonly model: ParameterHintsModel;
	private readonly widget: Lazy<ParameterHintsWidget>;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		this.editor = editor;

		this.model = this._register(new ParameterHintsModel(editor, languageFeaturesService.signatureHelpProvider));

		this._register(this.model.onChangedHints(newParameterHints => {
			if (newParameterHints) {
				this.widget.value.show();
				this.widget.value.render(newParameterHints);
			} else {
				this.widget.rawValue?.hide();
			}
		}));

		this.widget = new Lazy(() => this._register(instantiationService.createInstance(ParameterHintsWidget, this.editor, this.model)));
	}

	cancel(): void {
		this.model.cancel();
	}

	previous(): void {
		this.widget.rawValue?.previous();
	}

	next(): void {
		this.widget.rawValue?.next();
	}

	trigger(context: TriggerContext): void {
		this.model.trigger(context, 0);
	}

	focus(): void {
		this.widget.rawValue?.focus();
	}

	scrollUp(): void {
		this.widget.rawValue?.scrollUp();
	}

	scrollDown(): void {
		this.widget.rawValue?.scrollDown();
	}

	scrollLeft(): void {
		this.widget.rawValue?.scrollLeft();
	}

	scrollRight(): void {
		this.widget.rawValue?.scrollRight();
	}

	pageUp(): void {
		this.widget.rawValue?.pageUp();
	}

	pageDown(): void {
		this.widget.rawValue?.pageDown();
	}

	goToTop(): void {
		this.widget.rawValue?.goToTop();
	}

	goToBottom(): void {
		this.widget.rawValue?.goToBottom();
	}
}

export class TriggerParameterHintsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.triggerParameterHints',
			label: nls.localize2('parameterHints.trigger.label', "Trigger Parameter Hints"),
			precondition: EditorContextKeys.hasSignatureHelpProvider,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = ParameterHintsController.get(editor);
		controller?.trigger({
			triggerKind: languages.SignatureHelpTriggerKind.Invoke
		});
	}
}

export class FocusParameterHintsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.focusParameterHints',
			label: nls.localize2('parameterHints.focus.label', "Focus Parameter Hints"),
			precondition: Context.Visible,
			metadata: {
				description: nls.localize2('parameterHints.focus.description', 'Move focus to the parameter hints widget so its contents can be scrolled with the keyboard.')
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		ParameterHintsController.get(editor)?.focus();
	}
}

export class ScrollUpParameterHintsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.scrollUpParameterHints',
			label: nls.localize2('parameterHints.scrollUp.label', "Scroll Up Parameter Hints"),
			precondition: Context.Focused,
			kbOpts: {
				kbExpr: Context.Focused,
				primary: KeyCode.UpArrow,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('parameterHints.scrollUp.description', 'Scroll up the parameter hints widget.')
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		ParameterHintsController.get(editor)?.scrollUp();
	}
}

export class ScrollDownParameterHintsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.scrollDownParameterHints',
			label: nls.localize2('parameterHints.scrollDown.label', "Scroll Down Parameter Hints"),
			precondition: Context.Focused,
			kbOpts: {
				kbExpr: Context.Focused,
				primary: KeyCode.DownArrow,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('parameterHints.scrollDown.description', 'Scroll down the parameter hints widget.')
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		ParameterHintsController.get(editor)?.scrollDown();
	}
}

export class ScrollLeftParameterHintsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.scrollLeftParameterHints',
			label: nls.localize2('parameterHints.scrollLeft.label', "Scroll Left Parameter Hints"),
			precondition: Context.Focused,
			kbOpts: {
				kbExpr: Context.Focused,
				primary: KeyCode.LeftArrow,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('parameterHints.scrollLeft.description', 'Scroll left the parameter hints widget.')
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		ParameterHintsController.get(editor)?.scrollLeft();
	}
}

export class ScrollRightParameterHintsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.scrollRightParameterHints',
			label: nls.localize2('parameterHints.scrollRight.label', "Scroll Right Parameter Hints"),
			precondition: Context.Focused,
			kbOpts: {
				kbExpr: Context.Focused,
				primary: KeyCode.RightArrow,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('parameterHints.scrollRight.description', 'Scroll right the parameter hints widget.')
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		ParameterHintsController.get(editor)?.scrollRight();
	}
}

export class PageUpParameterHintsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.pageUpParameterHints',
			label: nls.localize2('parameterHints.pageUp.label', "Page Up Parameter Hints"),
			precondition: Context.Focused,
			kbOpts: {
				kbExpr: Context.Focused,
				primary: KeyCode.PageUp,
				secondary: [KeyMod.Alt | KeyCode.UpArrow],
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('parameterHints.pageUp.description', 'Page up the parameter hints widget.')
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		ParameterHintsController.get(editor)?.pageUp();
	}
}

export class PageDownParameterHintsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.pageDownParameterHints',
			label: nls.localize2('parameterHints.pageDown.label', "Page Down Parameter Hints"),
			precondition: Context.Focused,
			kbOpts: {
				kbExpr: Context.Focused,
				primary: KeyCode.PageDown,
				secondary: [KeyMod.Alt | KeyCode.DownArrow],
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('parameterHints.pageDown.description', 'Page down the parameter hints widget.')
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		ParameterHintsController.get(editor)?.pageDown();
	}
}

export class GoToTopParameterHintsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.goToTopParameterHints',
			label: nls.localize2('parameterHints.goToTop.label', "Go To Top Parameter Hints"),
			precondition: Context.Focused,
			kbOpts: {
				kbExpr: Context.Focused,
				primary: KeyCode.Home,
				secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('parameterHints.goToTop.description', 'Go to the top of the parameter hints widget.')
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		ParameterHintsController.get(editor)?.goToTop();
	}
}

export class GoToBottomParameterHintsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.goToBottomParameterHints',
			label: nls.localize2('parameterHints.goToBottom.label', "Go To Bottom Parameter Hints"),
			precondition: Context.Focused,
			kbOpts: {
				kbExpr: Context.Focused,
				primary: KeyCode.End,
				secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('parameterHints.goToBottom.description', 'Go to the bottom of the parameter hints widget.')
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		ParameterHintsController.get(editor)?.goToBottom();
	}
}

registerEditorContribution(ParameterHintsController.ID, ParameterHintsController, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorAction(TriggerParameterHintsAction);
registerEditorAction(FocusParameterHintsAction);
registerEditorAction(ScrollUpParameterHintsAction);
registerEditorAction(ScrollDownParameterHintsAction);
registerEditorAction(ScrollLeftParameterHintsAction);
registerEditorAction(ScrollRightParameterHintsAction);
registerEditorAction(PageUpParameterHintsAction);
registerEditorAction(PageDownParameterHintsAction);
registerEditorAction(GoToTopParameterHintsAction);
registerEditorAction(GoToBottomParameterHintsAction);

const weight = KeybindingWeight.EditorContrib + 75;

const ParameterHintsCommand = EditorCommand.bindToContribution<ParameterHintsController>(ParameterHintsController.get);

registerEditorCommand(new ParameterHintsCommand({
	id: 'closeParameterHints',
	precondition: Context.Visible,
	handler: x => x.cancel(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.focus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));

registerEditorCommand(new ParameterHintsCommand({
	id: 'showPrevParameterHint',
	precondition: ContextKeyExpr.and(Context.Visible, Context.MultipleSignatures, Context.Focused.toNegated()),
	handler: x => x.previous(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.focus,
		primary: KeyCode.UpArrow,
		secondary: [KeyMod.Alt | KeyCode.UpArrow],
		mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.Alt | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KeyP] }
	}
}));

registerEditorCommand(new ParameterHintsCommand({
	id: 'showNextParameterHint',
	precondition: ContextKeyExpr.and(Context.Visible, Context.MultipleSignatures, Context.Focused.toNegated()),
	handler: x => x.next(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.focus,
		primary: KeyCode.DownArrow,
		secondary: [KeyMod.Alt | KeyCode.DownArrow],
		mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.Alt | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KeyN] }
	}
}));
