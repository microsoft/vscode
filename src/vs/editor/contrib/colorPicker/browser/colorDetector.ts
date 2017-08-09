/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommonCodeEditor, IEditorContribution } from 'vs/editor/common/editorCommon';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ColorProviderRegistry, IColorRange } from 'vs/editor/common/modes';
import { TPromise } from 'vs/base/common/winjs.base';
import { getColors } from 'vs/editor/contrib/colorPicker/common/color';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';

@editorContribution
export class ColorDetector implements IEditorContribution {

	private static ID: string = 'editor.contrib.colorDetector';

	static RECOMPUTE_TIME = 1000; // ms

	private listenersToRemove: IDisposable[] = [];
	private computePromise: TPromise<void>;
	private timeoutPromise: TPromise<void>;

	private decorationsIds: string[] = [];
	private colorRanges = new Map<string, IColorRange>();

	constructor(private editor: ICodeEditor) {
		this.listenersToRemove.push(editor.onDidChangeModelContent((e) => this.onChange()));
		this.listenersToRemove.push(editor.onDidChangeModel((e) => this.onModelChanged()));
		this.listenersToRemove.push(editor.onDidChangeModelLanguage((e) => this.onModelModeChanged()));
		this.listenersToRemove.push(ColorProviderRegistry.onDidChange((e) => this.onModelModeChanged()));

		this.timeoutPromise = null;
		this.computePromise = null;
		this.beginCompute();
	}

	getId(): string {
		return ColorDetector.ID;
	}

	static get(editor: ICommonCodeEditor): ColorDetector {
		return editor.getContribution<ColorDetector>(this.ID);
	}

	dispose(): void {
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
			this.timeoutPromise = TPromise.timeout(ColorDetector.RECOMPUTE_TIME);
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
		const decorations = colorInfos.map(c => ({
			range: {
				startLineNumber: c.range.startLineNumber,
				startColumn: c.range.startColumn,
				endLineNumber: c.range.endLineNumber,
				endColumn: c.range.endColumn
			},
			options: {}
		}));

		const colorRanges = colorInfos.map(c => ({
			range: c.range,
			color: c.color,
			format: c.format,
			availableFormats: c.availableFormats
		}));

		this.decorationsIds = this.editor.deltaDecorations(this.decorationsIds, decorations);

		this.colorRanges = new Map<string, IColorRange>();
		this.decorationsIds.forEach((id, i) => this.colorRanges.set(id, colorRanges[i]));
	}

	getColorRange(position: Position): IColorRange | null {
		const decorations = this.editor.getModel()
			.getDecorationsInRange(Range.fromPositions(position, position))
			.filter(d => this.colorRanges.has(d.id));

		if (decorations.length === 0) {
			return null;
		}

		return this.colorRanges.get(decorations[0].id);
	}
}
