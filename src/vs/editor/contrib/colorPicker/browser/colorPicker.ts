/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommonCodeEditor, IEditorContribution, IModelDecorationsChangeAccessor, IModelDeltaDecoration } from "vs/editor/common/editorCommon";
import { editorContribution } from "vs/editor/browser/editorBrowserExtensions";
import { ICodeEditor } from "vs/editor/browser/editorBrowser";
import { IDisposable, dispose } from "vs/base/common/lifecycle";
import { registerThemingParticipant } from "vs/platform/theme/common/themeService";
import { editorWidgetBackground, editorWidgetBorder } from "vs/platform/theme/common/colorRegistry";
// import { Color } from "vs/base/common/color";
// import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { ColorProviderRegistry, IColorInfo } from "vs/editor/common/modes";
import { TPromise } from "vs/base/common/winjs.base";
import { getColors } from "vs/editor/contrib/colorPicker/common/colorPicker";
import { IRange } from "vs/editor/common/core/range";

@editorContribution
export class ColorPicker implements IEditorContribution {
	private static ID: string = 'editor.contrib.colorPicker';

	static RECOMPUTE_TIME = 1000; // ms

	private listenersToRemove: IDisposable[];
	private computePromise: TPromise<void>;
	private timeoutPromise: TPromise<void>;

	private currentDecorations: string[];

	constructor(private editor: ICodeEditor) {
		this.currentDecorations = [];

		this.listenersToRemove = [];
		this.listenersToRemove.push(editor.onDidChangeModelContent((e) => this.onChange()));
		this.listenersToRemove.push(editor.onDidChangeModel((e) => this.onModelChanged()));
		this.listenersToRemove.push(editor.onDidChangeModelLanguage((e) => this.onModelModeChanged()));
		this.listenersToRemove.push(ColorProviderRegistry.onDidChange((e) => this.onModelModeChanged()));

		this.timeoutPromise = null;
		this.computePromise = null;
		this.beginCompute();
	}

	public getId(): string {
		return ColorPicker.ID;
	}

	public static get(editor: ICommonCodeEditor): ColorPicker {
		return editor.getContribution<ColorPicker>(this.ID);
	}

	public dispose(): void {
		this.listenersToRemove = dispose(this.listenersToRemove);
		this.stop();
	}

	private onModelChanged(): void {
		this.stop();
		this.beginCompute();
	}

	private onModelModeChanged(): void {
		this.stop();
		this.beginCompute();
	}

	private onChange(): void {
		if (!this.timeoutPromise) {
			this.timeoutPromise = TPromise.timeout(ColorPicker.RECOMPUTE_TIME);
			this.timeoutPromise.then(() => {
				this.timeoutPromise = null;
				this.beginCompute();
			});
		}
	}

	private beginCompute(): void {
		if (!this.editor.getModel()) {
			return;
		}

		if (!ColorProviderRegistry.has(this.editor.getModel())) {
			return;
		}

		this.computePromise = getColors(this.editor.getModel()).then(colorInfos => {
			this.updateDecorations(colorInfos);
			this.computePromise = null;
		});
	}

	private stop(): void {
		if (this.timeoutPromise) {
			this.timeoutPromise.cancel();
			this.timeoutPromise = null;
		}
		if (this.computePromise) {
			this.computePromise.cancel();
			this.computePromise = null;
		}
	}

	private updateDecorations(colorInfos: IColorInfo[]): void {
		this.editor.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
			let newDecorations: IModelDeltaDecoration[] = [];

			for (let c of colorInfos) {
				const range: IRange = {
					startLineNumber: c.range.startLineNumber,
					startColumn: c.range.startColumn,
					endLineNumber: c.range.endLineNumber,
					endColumn: c.range.endColumn
				};

				const decoration = {
					range: range,
					options: {
						colorInfo: {
							color: c.color,
							format: c.format,
							availableFormats: c.availableFormats
						}
					}
				};

				newDecorations.push(decoration);
			}

			this.currentDecorations = changeAccessor.deltaDecorations(this.currentDecorations, newDecorations);
		});
	}
}

// @editorContribution
// export class FakeColorDecorations extends Disposable implements IEditorContribution {

// 	private static ID: string = 'editor.contrib.fakeColorDecorations';

// 	private decorationsDisposable = EmptyDisposable;

// 	private static decorationOptions = ModelDecorationOptions.register({
// 		inlineClassName: 'detected-color',
// 		color: Color.green
// 		// hoverMessage: Color.green.toString()
// 	});

// 	constructor(private editor: ICodeEditor) {
// 		super();

// 		this._register(editor.onDidChangeModel(e => {
// 			this.decorationsDisposable.dispose();

// 			const model = editor.getModel();
// 			const decoration: IModelDeltaDecoration = {
// 				range: {
// 					startLineNumber: 4,
// 					startColumn: 1,
// 					endLineNumber: 4,
// 					endColumn: 10
// 				},
// 				options: FakeColorDecorations.decorationOptions
// 			};

// 			const old = model.deltaDecorations([], [decoration]);

// 			this.decorationsDisposable = {
// 				dispose: () => {
// 					model.deltaDecorations(old, []);
// 				}
// 			};
// 		}));
// 	}

// 	public getId(): string {
// 		return FakeColorDecorations.ID;
// 	}

// 	dispose(): void {
// 		super.dispose();
// 	}
// }

registerThemingParticipant((theme, collector) => {
	const widgetBackground = theme.getColor(editorWidgetBackground);
	collector.addRule(`.monaco-editor .colorpicker-widget { background-color: ${widgetBackground}; }`);

	const widgetBorder = theme.getColor(editorWidgetBorder);
	collector.addRule(`.monaco-editor .colorpicker-widget { border: 1px solid ${widgetBorder}; }`);
	collector.addRule(`.monaco-editor .colorpicker-header { border-bottom: 1px solid ${widgetBorder}; }`);
});

// @editorAction
// class ColorPickerCommand extends EditorAction {
// 	constructor() {
// 		super({
// 			id: 'editor.action.colorPicker',
// 			label: nls.localize('editor.action.colorPicker', "Pick Color"),
// 			alias: 'Pick Color',
// 			precondition: null,
// 			kbOpts: {
// 				kbExpr: EditorContextKeys.textFocus,
// 				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C
// 			}
// 		});
// 	}

// 	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
// 		let controller = ColorPickerController.get(editor);
// 		if (!controller) {
// 			return;
// 		}

// 		controller.pickColor();
// 	}
// }

// CommonEditorRegistry.registerEditorAction(new ColorPickerCommand());