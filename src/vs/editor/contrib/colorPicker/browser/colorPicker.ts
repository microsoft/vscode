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
import { ColorPickerModel } from "vs/editor/contrib/colorPicker/browser/colorPickerModel";
import { registerThemingParticipant } from "vs/platform/theme/common/themeService";
import { editorWidgetBackground, editorWidgetBorder } from "vs/platform/theme/common/colorRegistry";

@editorContribution
export class ColorPickerController extends Disposable implements IEditorContribution {
	private static ID: string = 'editor.contrib.colorPicker';

	private widget: ColorPickerWidget;
	private model: ColorPickerModel;

	constructor(private editor: ICodeEditor) {
		super();

		this.model = new ColorPickerModel();
		this.widget = this._register(new ColorPickerWidget(this.model, editor));
		this.model.widget = this.widget;

		this._register(editor.onDidChangeModel(() =>
			this.dispose()
		));
	}

	public getId(): string {
		return ColorPickerController.ID;
	}

	public static get(editor: ICommonCodeEditor): ColorPickerController {
		return editor.getContribution<ColorPickerController>(this.ID);
	}

	public pickColor(): void {
		// Convert color from editors to string, pass it to widget
		const color = 'rgba(0, 171, 84, 1)'; // temp colour that is picked from editor
		this.model.originalColor = color;
		this.model.selectedColor = color;

		this.widget.show();
	}

	public selectColor(color: string): void {
		this.model.selectedColor = color;
	}

	public changeColorType(): void {
		console.log('Colour type change triggered');
	}

	public dispose(): void {
		if (this.widget.visible) {
			this.widget.dispose();
		}
	}
}

registerThemingParticipant((theme, collector) => {
	const widgetBackground = theme.getColor(editorWidgetBackground);
	collector.addRule(`.monaco-editor .colorpicker-widget { background-color: ${widgetBackground}; }`);

	const widgetBorder = theme.getColor(editorWidgetBorder);
	collector.addRule(`.monaco-editor .colorpicker-widget { border: 1px solid ${widgetBorder}; }`);
	collector.addRule(`.monaco-editor .colorpicker-header { border-bottom: 1px solid ${widgetBorder}; }`);
});

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