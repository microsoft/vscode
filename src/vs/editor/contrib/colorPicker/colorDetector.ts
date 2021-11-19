/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, TimeoutTimer } from 'vs/base/common/async';
import { RGBA } from 'vs/base/common/color';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { noBreakWhitespace } from 'vs/base/common/strings';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { DynamicCssRules } from 'vs/editor/browser/editorDom';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { ColorProviderRegistry } from 'vs/editor/common/modes';
import { getColors, IColorData } from 'vs/editor/contrib/colorPicker/color';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const MAX_DECORATORS = 500;

export class ColorDetector extends Disposable implements IEditorContribution {

	public static readonly ID: string = 'editor.contrib.colorDetector';

	static readonly RECOMPUTE_TIME = 1000; // ms

	private readonly _localToDispose = this._register(new DisposableStore());
	private _computePromise: CancelablePromise<IColorData[]> | null;
	private _timeoutTimer: TimeoutTimer | null;

	private _decorationsIds: string[] = [];
	private _colorDatas = new Map<string, IColorData>();

	private _colorDecoratorIds: ReadonlySet<string> = new Set<string>();

	private _isEnabled: boolean;

	private readonly _ruleFactory = new DynamicCssRules(this._editor);

	constructor(
		private readonly _editor: ICodeEditor,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this._register(_editor.onDidChangeModel(() => {
			this._isEnabled = this.isEnabled();
			this.onModelChanged();
		}));
		this._register(_editor.onDidChangeModelLanguage(() => this.onModelChanged()));
		this._register(ColorProviderRegistry.onDidChange(() => this.onModelChanged()));
		this._register(_editor.onDidChangeConfiguration(() => {
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
		const languageId = model.getLanguageId();
		// handle deprecated settings. [languageId].colorDecorators.enable
		const deprecatedConfig = this._configurationService.getValue(languageId);
		if (deprecatedConfig && typeof deprecatedConfig === 'object') {
			const colorDecorators = (deprecatedConfig as any)['colorDecorators']; // deprecatedConfig.valueOf('.colorDecorators.enable');
			if (colorDecorators && colorDecorators['enable'] !== undefined && !colorDecorators['enable']) {
				return colorDecorators['enable'];
			}
		}

		return this._editor.getOption(EditorOption.colorDecorators);
	}

	static get(editor: ICodeEditor): ColorDetector {
		return editor.getContribution<ColorDetector>(this.ID);
	}

	override dispose(): void {
		this.stop();
		this.removeAllDecorations();
		super.dispose();
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

		this._localToDispose.add(this._editor.onDidChangeModelContent(() => {
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
		this._localToDispose.clear();
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

	private _colorDecorationClassRefs = this._register(new DisposableStore());

	private updateColorDecorators(colorData: IColorData[]): void {
		this._colorDecorationClassRefs.clear();

		let decorations: IModelDeltaDecoration[] = [];

		for (let i = 0; i < colorData.length && decorations.length < MAX_DECORATORS; i++) {
			const { red, green, blue, alpha } = colorData[i].colorInfo.color;
			const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
			let color = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;

			const ref = this._colorDecorationClassRefs.add(
				this._ruleFactory.createClassNameRef({
					backgroundColor: color
				})
			);

			decorations.push({
				range: {
					startLineNumber: colorData[i].colorInfo.range.startLineNumber,
					startColumn: colorData[i].colorInfo.range.startColumn,
					endLineNumber: colorData[i].colorInfo.range.endLineNumber,
					endColumn: colorData[i].colorInfo.range.endColumn
				},
				options: {
					description: 'colorDetector',
					before: {
						content: noBreakWhitespace,
						inlineClassName: `${ref.className} colorpicker-color-decoration`,
						inlineClassNameAffectsLetterSpacing: true,
					}
				}
			});
		}

		this._colorDecoratorIds = new Set(this._editor.deltaDecorations([...this._colorDecoratorIds], decorations));
	}

	private removeAllDecorations(): void {
		this._decorationsIds = this._editor.deltaDecorations(this._decorationsIds, []);
		this._colorDecoratorIds = new Set(this._editor.deltaDecorations([...this._colorDecoratorIds], []));
		this._colorDecorationClassRefs.clear();
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

	isColorDecorationId(decorationId: string): boolean {
		return this._colorDecoratorIds.has(decorationId);
	}
}

registerEditorContribution(ColorDetector.ID, ColorDetector);
