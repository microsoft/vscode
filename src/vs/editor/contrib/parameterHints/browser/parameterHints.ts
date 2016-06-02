/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import { dispose } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorAction } from 'vs/editor/common/editorAction';
import { ICommonCodeEditor, IEditorActionDescriptorData, IEditorContribution } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry, ContextKey, EditorActionDescriptor } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorBrowserRegistry } from 'vs/editor/browser/editorBrowserExtensions';
import { SignatureHelpProviderRegistry } from 'vs/editor/common/modes';
import { ParameterHintsWidget } from './parameterHintsWidget';
import { Context } from '../common/parameterHints';

class ParameterHintsController implements IEditorContribution {

	static ID = 'editor.controller.parameterHints';

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

	closeWidget(): void {
		this.widget.cancel();
	}

	showPrevHint(): void {
		this.widget.selectPrevious();
	}

	showNextHint(): void {
		this.widget.selectNext();
	}

	trigger(): void {
		this.widget.trigger();
	}

	dispose(): void {
		this.widget = dispose(this.widget);
	}
}

export class TriggerParameterHintsAction extends EditorAction {

	static ID = 'editor.action.triggerParameterHints';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor);
	}

	isSupported(): boolean {
		return SignatureHelpProviderRegistry.has(this.editor.getModel()) && super.isSupported();
	}

	run():TPromise<boolean> {
		ParameterHintsController.get(this.editor).trigger();
		return TPromise.as(true);
	}
}

const weight = CommonEditorRegistry.commandWeight(75);

function handler(fn: (controller: ParameterHintsController)=>void): (ctx, editor: ICommonCodeEditor)=>void {
	return (ctx, editor: ICommonCodeEditor) => fn(ParameterHintsController.get(editor));
}

EditorBrowserRegistry.registerEditorContribution(ParameterHintsController);

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(
	TriggerParameterHintsAction,
	TriggerParameterHintsAction.ID,
	nls.localize('parameterHints.trigger.label', "Trigger Parameter Hints"),
	{ context: ContextKey.EditorTextFocus, primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space },
	'Trigger Parameter Hints'
));

CommonEditorRegistry.registerEditorCommand(
	'closeParameterHints',
	weight,
	{ primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape] },
	true,
	Context.Visible,
	handler(c => c.closeWidget())
);

CommonEditorRegistry.registerEditorCommand(
	'showPrevParameterHint',
	weight,
	{ primary: KeyCode.UpArrow, secondary: [KeyMod.Alt | KeyCode.UpArrow] },
	true,
	Context.Visible,
	handler(c =>c.showPrevHint())
);

CommonEditorRegistry.registerEditorCommand(
	'showNextParameterHint',
	weight,
	{ primary: KeyCode.DownArrow, secondary: [KeyMod.Alt | KeyCode.DownArrow] },
	true,
	Context.Visible,
	handler(c => c.showNextHint())
);
