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
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const MAX_DECORATORS = 500;

@editorContribution
export class ColorDetector implements IEditorContribution {

	private static ID: string = 'editor.contrib.colorDetector';

	static RECOMPUTE_TIME = 1000; // ms

	private _globalToDispose: IDisposable[] = [];
	private _localToDispose: IDisposable[] = [];
	private _computePromise: TPromise<void>;
	private _timeoutPromise: TPromise<void>;

	private _decorationsIds: string[] = [];
	private _colorRanges = new Map<string, IColorRange>();

	private _colorDecoratorIds: string[] = [];
	private _decorationsTypes: { [key: string]: boolean } = {};

	private _isEnabled: boolean;

	constructor(private _editor: ICodeEditor,
		@ICodeEditorService private _codeEditorService: ICodeEditorService,
		@IConfigurationService private _configurationService: IConfigurationService
	) {
		this._globalToDispose.push(_editor.onDidChangeModel((e) => {
			this._isEnabled = this.isEnabled();
			this.onModelChanged();
		}));
		this._globalToDispose.push(_editor.onDidChangeModelLanguage((e) => this.onModelChanged()));
		this._globalToDispose.push(ColorProviderRegistry.onDidChange((e) => this.onModelChanged()));
		this._globalToDispose.push(_editor.onDidChangeConfiguration((e) => {
			let prevIsEnabled = this._isEnabled;
			this._isEnabled = this.isEnabled();
			if (prevIsEnabled !== this._isEnabled) {
				if (this._isEnabled) {
					this.onModelChanged();
				} else {
					this.removeAllDecorations();
				}
			}
		}));

		this._timeoutPromise = null;
		this._computePromise = null;
		this._isEnabled = this.isEnabled();
		this.onModelChanged();
	}

	isEnabled(): boolean {
		const model = this._editor.getModel();
		if (!model) {
			return false;
		}
		const languageId = model.getLanguageIdentifier();
		// handle deprecated settings. [languageId].colorDecorators.enable
		let deprecatedConfig = this._configurationService.getConfiguration(languageId.language);
		if (deprecatedConfig) {
			let colorDecorators = deprecatedConfig['colorDecorators']; // deprecatedConfig.valueOf('.colorDecorators.enable');
			if (colorDecorators && colorDecorators['enable'] !== undefined && !colorDecorators['enable']) {
				return colorDecorators['enable'];
			}
		}

		return this._editor.getConfiguration().contribInfo.colorDecorators;
	}

	getId(): string {
		return ColorDetector.ID;
	}

	static get(editor: ICommonCodeEditor): ColorDetector {
		return editor.getContribution<ColorDetector>(this.ID);
	}

	dispose(): void {
		this.stop();
		this.removeAllDecorations();
		this._globalToDispose = dispose(this._globalToDispose);
	}

	private onModelChanged(): void {
		this.stop();

		if (!this._isEnabled) {
			return;
		}
		const model = this._editor.getModel();
		// if (!model) {
		// 	return;
		// }

		if (!ColorProviderRegistry.has(model)) {
			return;
		}

		this._localToDispose.push(this._editor.onDidChangeModelContent((e) => {
			if (!this._timeoutPromise) {
				this._timeoutPromise = TPromise.timeout(ColorDetector.RECOMPUTE_TIME);
				this._timeoutPromise.then(() => {
					this._timeoutPromise = null;
					this.beginCompute();
				});
			}
		}));
		this.beginCompute();
	}

	private beginCompute(): void {
		this._computePromise = getColors(this._editor.getModel()).then(colorInfos => {
			this.updateDecorations(colorInfos);
			this.updateColorDecorators(colorInfos);
			this._computePromise = null;
		});
	}

	private stop(): void {
		if (this._timeoutPromise) {
			this._timeoutPromise.cancel();
			this._timeoutPromise = null;
		}
		if (this._computePromise) {
			this._computePromise.cancel();
			this._computePromise = null;
		}
		this._localToDispose = dispose(this._localToDispose);
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

		this._decorationsIds = this._editor.deltaDecorations(this._decorationsIds, decorations);

		this._colorRanges = new Map<string, IColorRange>();
		this._decorationsIds.forEach((id, i) => this._colorRanges.set(id, colorRanges[i]));
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

		this._colorDecoratorIds = this._editor.deltaDecorations(this._colorDecoratorIds, decorations);
	}

	private removeAllDecorations(): void {
		this._decorationsIds = this._editor.deltaDecorations(this._decorationsIds, []);
		this._colorDecoratorIds = this._editor.deltaDecorations(this._colorDecoratorIds, []);

		for (let subType in this._decorationsTypes) {
			this._codeEditorService.removeDecorationType(subType);
		}
	}

	getColorRange(position: Position): IColorRange | null {
		const decorations = this._editor.getModel()
			.getDecorationsInRange(Range.fromPositions(position, position))
			.filter(d => this._colorRanges.has(d.id));

		if (decorations.length === 0) {
			return null;
		}

		return this._colorRanges.get(decorations[0].id);
	}
}
