/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, TimeoutTimer, createCancelablePromise } from 'vs/base/common/async';
import { RGBA } from 'vs/base/common/color';
import { onUnexpectedError } from 'vs/base/common/errors';
import { hash } from 'vs/base/common/hash';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { ColorProviderRegistry } from 'vs/editor/common/modes';
import { IColorData, getColors } from 'vs/editor/contrib/colorPicker/color';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const MAX_DECORATORS = 500;

export class ColorDetector implements IEditorContribution {

	private static readonly ID: string = 'editor.contrib.colorDetector';

	static RECOMPUTE_TIME = 1000; // ms

	private _globalToDispose: IDisposable[] = [];
	private _localToDispose: IDisposable[] = [];
	private _computePromise: CancelablePromise<IColorData[]> | null;
	private _timeoutTimer: TimeoutTimer | null;

	private _decorationsIds: string[] = [];
	private _colorDatas = new Map<string, IColorData>();

	private _colorDecoratorIds: string[] = [];
	private _decorationsTypes: { [key: string]: boolean } = {};

	private _isEnabled: boolean;

	constructor(private _editor: ICodeEditor,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
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

		this._timeoutTimer = null;
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
		let deprecatedConfig = this._configurationService.getValue(languageId.language);
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

	static get(editor: ICodeEditor): ColorDetector {
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

		if (!model || !ColorProviderRegistry.has(model)) {
			return;
		}

		this._localToDispose.push(this._editor.onDidChangeModelContent((e) => {
			if (!this._timeoutTimer) {
				this._timeoutTimer = new TimeoutTimer();
				this._timeoutTimer.cancelAndSet(() => {
					this._timeoutTimer = null;
					this.beginCompute();
				}, ColorDetector.RECOMPUTE_TIME);
			}
		}));
		this.beginCompute();
	}

	private beginCompute(): void {
		this._computePromise = createCancelablePromise(token => {
			const model = this._editor.getModel();
			if (!model) {
				return Promise.resolve([]);
			}
			return getColors(model, token);
		});
		this._computePromise.then((colorInfos) => {
			this.updateDecorations(colorInfos);
			this.updateColorDecorators(colorInfos);
			this._computePromise = null;
		}, onUnexpectedError);
	}

	private stop(): void {
		if (this._timeoutTimer) {
			this._timeoutTimer.cancel();
			this._timeoutTimer = null;
		}
		if (this._computePromise) {
			this._computePromise.cancel();
			this._computePromise = null;
		}
		this._localToDispose = dispose(this._localToDispose);
	}

	private updateDecorations(colorDatas: IColorData[]): void {
		const decorations = colorDatas.map(c => ({
			range: {
				startLineNumber: c.colorInfo.range.startLineNumber,
				startColumn: c.colorInfo.range.startColumn,
				endLineNumber: c.colorInfo.range.endLineNumber,
				endColumn: c.colorInfo.range.endColumn
			},
			options: ModelDecorationOptions.EMPTY
		}));

		this._decorationsIds = this._editor.deltaDecorations(this._decorationsIds, decorations);

		this._colorDatas = new Map<string, IColorData>();
		this._decorationsIds.forEach((id, i) => this._colorDatas.set(id, colorDatas[i]));
	}

	private updateColorDecorators(colorData: IColorData[]): void {
		let decorations: IModelDeltaDecoration[] = [];
		let newDecorationsTypes: { [key: string]: boolean } = {};

		for (let i = 0; i < colorData.length && decorations.length < MAX_DECORATORS; i++) {
			const { red, green, blue, alpha } = colorData[i].colorInfo.color;
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
					startLineNumber: colorData[i].colorInfo.range.startLineNumber,
					startColumn: colorData[i].colorInfo.range.startColumn,
					endLineNumber: colorData[i].colorInfo.range.endLineNumber,
					endColumn: colorData[i].colorInfo.range.endColumn
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

	getColorData(position: Position): IColorData | null {
		const model = this._editor.getModel();
		if (!model) {
			return null;
		}

		const decorations = model
			.getDecorationsInRange(Range.fromPositions(position, position))
			.filter(d => this._colorDatas.has(d.id));

		if (decorations.length === 0) {
			return null;
		}

		return this._colorDatas.get(decorations[0].id)!;
	}
}

registerEditorContribution(ColorDetector);
