/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RGBA } from 'vs/base/common/color';
import { hash } from 'vs/base/common/hash';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICommonCodeEditor, IEditorContribution } from 'vs/editor/common/editorCommon';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { ColorProviderRegistry, IColorRange } from 'vs/editor/common/modes';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { getColors } from 'vs/editor/contrib/colorPicker/common/color';

const MAX_DECORATORS = 500;

@editorContribution
export class ColorDetector implements IEditorContribution {

	private static ID: string = 'editor.contrib.colorDetector';

	static RECOMPUTE_TIME = 1000; // ms

	private globalToDispose: IDisposable[] = [];
	private localToDispose: IDisposable[] = [];
	private computePromise: TPromise<void>;
	private timeoutPromise: TPromise<void>;

	private decorationsIds: string[] = [];
	private colorRanges = new Map<string, IColorRange>();

	private _colorDecorators: string[] = [];
	private _decorationsTypes: { [key: string]: boolean } = {};

	constructor(private editor: ICodeEditor,
		@ICodeEditorService private _codeEditorService: ICodeEditorService,
	) {
		this.globalToDispose.push(editor.onDidChangeModel((e) => this.onModelChanged()));
		this.globalToDispose.push(editor.onDidChangeModelLanguage((e) => this.onModelChanged()));
		this.globalToDispose.push(ColorProviderRegistry.onDidChange((e) => this.onModelChanged()));

		this.timeoutPromise = null;
		this.computePromise = null;
		this.onModelChanged();
	}

	getId(): string {
		return ColorDetector.ID;
	}

	static get(editor: ICommonCodeEditor): ColorDetector {
		return editor.getContribution<ColorDetector>(this.ID);
	}

	dispose(): void {
		this.stop();
		this.globalToDispose = dispose(this.globalToDispose);
	}

	private onModelChanged(): void {
		this.stop();
		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		if (!ColorProviderRegistry.has(model)) {
			return;
		}

		for (const provider of ColorProviderRegistry.all(model)) {
			if (typeof provider.onDidChange === 'function') {
				let registration = provider.onDidChange(() => {
					if (this.timeoutPromise) {
						this.timeoutPromise.cancel();
						this.timeoutPromise = null;
					}
					if (this.computePromise) {
						this.computePromise.cancel();
						this.computePromise = null;
					}
					this.beginCompute();
				});
				this.localToDispose.push(registration);
			}
		}

		this.localToDispose.push(this.editor.onDidChangeModelContent((e) => {
			if (!this.timeoutPromise) {
				this.timeoutPromise = TPromise.timeout(ColorDetector.RECOMPUTE_TIME);
				this.timeoutPromise.then(() => {
					this.timeoutPromise = null;
					this.beginCompute();
				});
			}
		}));
		this.beginCompute();
	}

	private beginCompute(): void {
		this.computePromise = getColors(this.editor.getModel()).then(colorInfos => {
			this.updateDecorations(colorInfos);
			this.updateColorDecorators(colorInfos);
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
		this.localToDispose = dispose(this.localToDispose);
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
			formatters: c.formatters
		}));

		this.decorationsIds = this.editor.deltaDecorations(this.decorationsIds, decorations);

		this.colorRanges = new Map<string, IColorRange>();
		this.decorationsIds.forEach((id, i) => this.colorRanges.set(id, colorRanges[i]));
	}

	private updateColorDecorators(colorInfos: IColorRange[]): void {
		let decorations = [];
		let newDecorationsTypes: { [key: string]: boolean } = {};

		for (let i = 0; i < colorInfos.length && decorations.length < MAX_DECORATORS; i++) {
			const { red, green, blue, alpha } = colorInfos[i].color;
			const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
			let subKey = hash(rgba).toString(16);
			let color = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
			let key = 'colorBox-' + subKey;

			if (!this._decorationsTypes[key] && !newDecorationsTypes[key]) {
				this._codeEditorService.registerDecorationType(key, {
					before: {
						contentText: ' ',
						border: 'solid 0.1em #000',
						margin: '0.1em 0.2em 0 0.2em',
						width: '0.8em',
						height: '0.8em',
						backgroundColor: color
					},
					dark: {
						before: {
							border: 'solid 0.1em #eee'
						}
					}
				});
			}

			newDecorationsTypes[key] = true;
			decorations.push({
				range: {
					startLineNumber: colorInfos[i].range.startLineNumber,
					startColumn: colorInfos[i].range.startColumn,
					endLineNumber: colorInfos[i].range.endLineNumber,
					endColumn: colorInfos[i].range.endColumn
				},
				options: this._codeEditorService.resolveDecorationOptions(key, true)
			});
		}

		for (let subType in this._decorationsTypes) {
			if (!newDecorationsTypes[subType]) {
				this._codeEditorService.removeDecorationType(subType);
			}
		}

		this._colorDecorators = this.editor.deltaDecorations(this._colorDecorators, decorations);
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
