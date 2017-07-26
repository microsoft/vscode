/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommonCodeEditor, IEditorContribution, IModelDecorationsChangeAccessor, IModelDeltaDecoration } from 'vs/editor/common/editorCommon';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorWidgetBackground, editorWidgetBorder } from 'vs/platform/theme/common/colorRegistry';
import { ColorProviderRegistry, IColorRange } from 'vs/editor/common/modes';
import { TPromise } from 'vs/base/common/winjs.base';
import { getColors } from 'vs/editor/contrib/colorPicker/common/colorPicker';
import { IRange } from 'vs/editor/common/core/range';
import { IColorDecorationExtraOptions } from '../common/color';

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

	private updateDecorations(colorInfos: IColorRange[]): void {
		this.editor.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
			let newDecorations: IModelDeltaDecoration[] = [];

			for (let c of colorInfos) {
				const range: IRange = {
					startLineNumber: c.range.startLineNumber,
					startColumn: c.range.startColumn,
					endLineNumber: c.range.endLineNumber,
					endColumn: c.range.endColumn
				};

				const extraOptions: IColorDecorationExtraOptions = {
					color: c.color,
					format: c.format,
					availableFormats: c.availableFormats
				};

				// TODO@Joao
				const options = { __extraOptions: extraOptions } as any;

				newDecorations.push({ range, options });
			}

			this.currentDecorations = changeAccessor.deltaDecorations(this.currentDecorations, newDecorations);
		});
	}
}


registerThemingParticipant((theme, collector) => {
	const widgetBackground = theme.getColor(editorWidgetBackground);
	collector.addRule(`.monaco-editor .colorpicker-widget { background-color: ${widgetBackground}; }`);

	const widgetBorder = theme.getColor(editorWidgetBorder);
	collector.addRule(`.monaco-editor .colorpicker-widget { border: 1px solid ${widgetBorder}; }`);
	collector.addRule(`.monaco-editor .colorpicker-header { border-bottom: 1px solid ${widgetBorder}; }`);
});