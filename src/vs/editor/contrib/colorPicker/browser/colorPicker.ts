/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editorAction, EditorAction, CommonEditorRegistry } from "vs/editor/common/editorCommonExtensions";
import { KeyCode, KeyMod } from "vs/base/common/keyCodes";
import { ServicesAccessor } from "vs/platform/instantiation/common/instantiation";
import { EditorContextKeys } from "vs/editor/common/editorContextKeys";
import * as nls from 'vs/nls';
import { ICommonCodeEditor, IEditorContribution, IModelDeltaDecoration } from "vs/editor/common/editorCommon";
import { editorContribution } from "vs/editor/browser/editorBrowserExtensions";
import { ICodeEditor } from "vs/editor/browser/editorBrowser";
import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { Disposable, empty as EmptyDisposable } from "vs/base/common/lifecycle";
import { registerThemingParticipant } from "vs/platform/theme/common/themeService";
import { editorWidgetBackground, editorWidgetBorder } from "vs/platform/theme/common/colorRegistry";
import { Color } from "vs/base/common/color";
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';

@editorContribution
export class ColorPickerController extends Disposable implements IEditorContribution {
	private static ID: string = 'editor.contrib.colorPicker';

	private widget: ColorPickerWidget;
	// private model: ColorPickerModel;

	constructor(private editor: ICodeEditor) {
		super();
	}

	public getId(): string {
		return ColorPickerController.ID;
	}

	public static get(editor: ICommonCodeEditor): ColorPickerController {
		return editor.getContribution<ColorPickerController>(this.ID);
	}

	public dispose(): void {
		if (this.widget.visible) {
			this.widget.dispose();
		}
	}
}

@editorContribution
export class FakeColorDecorations extends Disposable implements IEditorContribution {

	private static ID: string = 'editor.contrib.fakeColorDecorations';

	private decorationsDisposable = EmptyDisposable;

	private static decorationOptions = ModelDecorationOptions.register({
		inlineClassName: 'detected-color',
		color: Color.green
		// hoverMessage: Color.green.toString()
	});

	constructor(private editor: ICodeEditor) {
		super();

		this._register(editor.onDidChangeModel(e => {
			this.decorationsDisposable.dispose();

			const model = editor.getModel();
			const decoration: IModelDeltaDecoration = {
				range: {
					startLineNumber: 4,
					startColumn: 1,
					endLineNumber: 4,
					endColumn: 10
				},
				options: FakeColorDecorations.decorationOptions
			};

			const old = model.deltaDecorations([], [decoration]);

			this.decorationsDisposable = {
				dispose: () => {
					model.deltaDecorations(old, []);
				}
			};
		}));
	}

	public getId(): string {
		return FakeColorDecorations.ID;
	}

	dispose(): void {
		super.dispose();
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