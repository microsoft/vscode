/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { dispose } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommonCodeEditor, IEditorContribution, EditorContextKeys, ModeContextKeys } from 'vs/editor/common/editorCommon';
import { KbExpr } from 'vs/platform/keybinding/common/keybinding';
import { ServicesAccessor, EditorAction, EditorCommand, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorBrowserRegistry } from 'vs/editor/browser/editorBrowserExtensions';
import { ParameterHintsWidget } from './parameterHintsWidget';
import { Context } from '../common/parameterHints';

class ParameterHintsController implements IEditorContribution {

	private static ID = 'editor.controller.parameterHints';

	static get(editor:ICommonCodeEditor): ParameterHintsController {
		return <ParameterHintsController>editor.getContribution(ParameterHintsController.ID);
	}

	private editor:ICodeEditor;
	private widget: ParameterHintsWidget;

	constructor(editor:ICodeEditor, @IInstantiationService instantiationService: IInstantiationService) {
		this.editor = editor;
		this.widget = instantiationService.createInstance(ParameterHintsWidget, this.editor);
	}

	getId(): string {
		return ParameterHintsController.ID;
	}

	cancel(): void {
		this.widget.cancel();
	}

	previous(): void {
		this.widget.previous();
	}

	next(): void {
		this.widget.next();
	}

	trigger(): void {
		this.widget.trigger();
	}

	dispose(): void {
		this.widget = dispose(this.widget);
	}
}

export class TriggerParameterHintsAction extends EditorAction {

	constructor() {
		super(
			'editor.action.triggerParameterHints',
			nls.localize('parameterHints.trigger.label', "Trigger Parameter Hints"),
			'Trigger Parameter Hints',
			false
		);

		this._precondition = ModeContextKeys.hasSignatureHelpProvider;

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space
		};
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		ParameterHintsController.get(editor).trigger();
	}
}

const weight = CommonEditorRegistry.commandWeight(75);

const ParameterHintsCommand = EditorCommand.bindToContribution(
	ParameterHintsController.get, {
		weight: weight,
		kbExpr: KbExpr.and(EditorContextKeys.TextFocus, Context.Visible)
	}
);
const MultipleSignaturesParameterHintsCommand = EditorCommand.bindToContribution(
	ParameterHintsController.get, {
		weight: weight,
		kbExpr: KbExpr.and(EditorContextKeys.TextFocus, Context.Visible, Context.MultipleSignatures)
	}
);

EditorBrowserRegistry.registerEditorContribution(ParameterHintsController);

CommonEditorRegistry.registerEditorAction(new TriggerParameterHintsAction());

CommonEditorRegistry.registerEditorCommand2(new ParameterHintsCommand(
	'closeParameterHints',
	x => x.cancel(),
	{
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
));

CommonEditorRegistry.registerEditorCommand2(new MultipleSignaturesParameterHintsCommand(
	'showPrevParameterHint',
	x => x.previous(),
	{
		primary: KeyCode.UpArrow,
		secondary: [KeyMod.Alt | KeyCode.UpArrow],
		mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.Alt | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KEY_P] }
	}
));
CommonEditorRegistry.registerEditorCommand2(new MultipleSignaturesParameterHintsCommand(
	'showNextParameterHint',
	x => x.next(),
	{
		primary: KeyCode.DownArrow,
		secondary: [KeyMod.Alt | KeyCode.DownArrow],
		mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.Alt | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KEY_N] }
	}
));
