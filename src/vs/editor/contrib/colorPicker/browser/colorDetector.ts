/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, TimeoutTimer } from '../../../../base/common/async.js';
import { RGBA } from '../../../../base/common/color.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { noBreakWhitespace } from '../../../../base/common/strings.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { DynamicCssRules } from '../../../browser/editorDom.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { IModelDecoration, IModelDeltaDecoration } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { getColors, IColorData } from './color.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

export const ColorDecorationInjectedTextMarker = Object.create({});


export class ColorDetector extends Disposable implements IEditorContribution {

	public static readonly ID: string = 'editor.contrib.colorDetector';

	static readonly RECOMPUTE_TIME = 1000; // ms

	private readonly _localToDispose = this._register(new DisposableStore());
	private _computePromise: CancelablePromise<IColorData[]> | null;
	private _timeoutTimer: TimeoutTimer | null;
	private _debounceInformation: IFeatureDebounceInformation;

	private _decorationsIds: string[] = [];
	private _colorDatas = new Map<string, IColorData>();

	private readonly _colorDecoratorIds = this._editor.createDecorationsCollection();

	private _isColorDecoratorsEnabled: boolean;
	private _defaultColorDecoratorsEnablement: 'auto' | 'always' | 'never';

	private readonly _ruleFactory = new DynamicCssRules(this._editor);

	private readonly _decoratorLimitReporter = new DecoratorLimitReporter();

	constructor(
		private readonly _editor: ICodeEditor,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageFeatureDebounceService languageFeatureDebounceService: ILanguageFeatureDebounceService,
	) {
		super();
		this._debounceInformation = languageFeatureDebounceService.for(_languageFeaturesService.colorProvider, 'Document Colors', { min: ColorDetector.RECOMPUTE_TIME });
		this._register(_editor.onDidChangeModel(() => {
			this._isColorDecoratorsEnabled = this.isEnabled();
			this.updateColors();
		}));
		this._register(_editor.onDidChangeModelLanguage(() => this.updateColors()));
		this._register(_languageFeaturesService.colorProvider.onDidChange(() => this.updateColors()));
		this._register(_editor.onDidChangeConfiguration((e) => {
			const prevIsEnabled = this._isColorDecoratorsEnabled;
			this._isColorDecoratorsEnabled = this.isEnabled();
			this._defaultColorDecoratorsEnablement = this._editor.getOption(EditorOption.defaultColorDecorators);
			const updatedColorDecoratorsSetting = prevIsEnabled !== this._isColorDecoratorsEnabled || e.hasChanged(EditorOption.colorDecoratorsLimit);
			const updatedDefaultColorDecoratorsSetting = e.hasChanged(EditorOption.defaultColorDecorators);
			if (updatedColorDecoratorsSetting || updatedDefaultColorDecoratorsSetting) {
				if (this._isColorDecoratorsEnabled) {
					this.updateColors();
				}
				else {
					this.removeAllDecorations();
				}
			}
		}));

		this._timeoutTimer = null;
		this._computePromise = null;
		this._isColorDecoratorsEnabled = this.isEnabled();
		this._defaultColorDecoratorsEnablement = this._editor.getOption(EditorOption.defaultColorDecorators);
		this.updateColors();
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

	public get limitReporter() {
		return this._decoratorLimitReporter;
	}

	static get(editor: ICodeEditor): ColorDetector | null {
		return editor.getContribution<ColorDetector>(this.ID);
	}

	override dispose(): void {
		this.stop();
		this.removeAllDecorations();
		super.dispose();
	}

	private updateColors(): void {
		this.stop();

		if (!this._isColorDecoratorsEnabled) {
			return;
		}
		const model = this._editor.getModel();

		if (!model || !this._languageFeaturesService.colorProvider.has(model)) {
			return;
		}

		this._localToDispose.add(this._editor.onDidChangeModelContent(() => {
			if (!this._timeoutTimer) {
				this._timeoutTimer = new TimeoutTimer();
				this._timeoutTimer.cancelAndSet(() => {
					this._timeoutTimer = null;
					this.beginCompute();
				}, this._debounceInformation.get(model));
			}
		}));
		this.beginCompute();
	}

	private async beginCompute(): Promise<void> {
		this._computePromise = createCancelablePromise(async token => {
			const model = this._editor.getModel();
			if (!model) {
				return [];
			}
			const sw = new StopWatch(false);
			const colors = await getColors(this._languageFeaturesService.colorProvider, model, token, this._defaultColorDecoratorsEnablement);
			this._debounceInformation.update(model, sw.elapsed());
			return colors;
		});
		try {
			const colors = await this._computePromise;
			this.updateDecorations(colors);
			this.updateColorDecorators(colors);
			this._computePromise = null;
		} catch (e) {
			onUnexpectedError(e);
		}
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

		this._editor.changeDecorations((changeAccessor) => {
			this._decorationsIds = changeAccessor.deltaDecorations(this._decorationsIds, decorations);

			this._colorDatas = new Map<string, IColorData>();
			this._decorationsIds.forEach((id, i) => this._colorDatas.set(id, colorDatas[i]));
		});
	}

	private readonly _colorDecorationClassRefs = this._register(new DisposableStore());

	private updateColorDecorators(colorData: IColorData[]): void {
		this._colorDecorationClassRefs.clear();

		const decorations: IModelDeltaDecoration[] = [];

		const limit = this._editor.getOption(EditorOption.colorDecoratorsLimit);

		for (let i = 0; i < colorData.length && decorations.length < limit; i++) {
			const { red, green, blue, alpha } = colorData[i].colorInfo.color;
			const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
			const color = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;

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
						attachedData: ColorDecorationInjectedTextMarker
					}
				}
			});
		}
		const limited = limit < colorData.length ? limit : false;
		this._decoratorLimitReporter.update(colorData.length, limited);

		this._colorDecoratorIds.set(decorations);
	}

	private removeAllDecorations(): void {
		this._editor.removeDecorations(this._decorationsIds);
		this._decorationsIds = [];
		this._colorDecoratorIds.clear();
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

	isColorDecoration(decoration: IModelDecoration): boolean {
		return this._colorDecoratorIds.has(decoration);
	}
}

export class DecoratorLimitReporter {
	private _onDidChange = new Emitter<void>();
	public readonly onDidChange: Event<void> = this._onDidChange.event;

	private _computed: number = 0;
	private _limited: number | false = false;
	public get computed(): number {
		return this._computed;
	}
	public get limited(): number | false {
		return this._limited;
	}
	public update(computed: number, limited: number | false) {
		if (computed !== this._computed || limited !== this._limited) {
			this._computed = computed;
			this._limited = limited;
			this._onDidChange.fire();
		}
	}
}
