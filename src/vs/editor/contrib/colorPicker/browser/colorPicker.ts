/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editorAction, EditorAction, CommonEditorRegistry } from "vs/editor/common/editorCommonExtensions";
import { KeyCode, KeyMod } from "vs/base/common/keyCodes";
import { ServicesAccessor } from "vs/platform/instantiation/common/instantiation";
import { EditorContextKeys } from "vs/editor/common/editorContextKeys";
import * as nls from 'vs/nls';
import { ICommonCodeEditor, IEditorContribution } from "vs/editor/common/editorCommon";
import { editorContribution } from "vs/editor/browser/editorBrowserExtensions";
import { ICodeEditor } from "vs/editor/browser/editorBrowser";
import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { Disposable } from "vs/base/common/lifecycle";

@editorContribution
export class ColorPickerController extends Disposable implements IEditorContribution {
	private static ID: string = 'editor.contrib.colorPicker';

	private widget: ColorPickerWidget;

	constructor(private editor: ICodeEditor) {
		super();

		console.log('Colour picker controller was instantiated');

		this.widget = this._register(new ColorPickerWidget(this, editor));
	}

	public getId(): string {
		return ColorPickerController.ID;
	}

	public static get(editor: ICommonCodeEditor): ColorPickerController {
		return editor.getContribution<ColorPickerController>(this.ID);
	}

	public pickColor(): void {
		// Convert color from editors to string, pass it to widget
		this.widget.show('rgb(235, 26, 13)');
	}
}

@editorAction
class ColorPickerCommand extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.colorPicker',
			label: nls.localize('editor.action.colorPicker', "Pick Color"),
			alias: 'Pick Color',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		let controller = ColorPickerController.get(editor);
		if (!controller) {
			return;
		}

		controller.pickColor();
	}
}

CommonEditorRegistry.registerEditorAction(new ColorPickerCommand());