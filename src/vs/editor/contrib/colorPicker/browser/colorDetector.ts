/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, TimeoutTimer } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { RGBA } from 'vs/base/common/color';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { noBreakWhitespace } from 'vs/base/common/strings';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { DynamicCssRules } from 'vs/editor/browser/editorDom';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDecoration, IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { getColors, IColorData } from 'vs/editor/contrib/colorPicker/browser/color';
import { DefaultDocumentColorProviderForStandaloneColorPicker } from 'vs/editor/contrib/colorPicker/browser/defaultDocumentColorProvider';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export const ColorDecorationInjectedTextMarker = Object.create({});

export function getDefaultColors(model: ITextModel, token: CancellationToken): Promise<IColorData[]> {

	console.log('Inside of getDefaultColros');

	const colors: IColorData[] = [];
	const provider = new DefaultDocumentColorProviderForStandaloneColorPicker();
	const result = provider.provideDocumentColors(model, token);
	if (Array.isArray(result)) {
		for (const colorInfo of result) {
			colors.push({ colorInfo, provider });
		}
	}

	console.log('colors inside of getDefaultColors: ', colors);

	return Promise.resolve(colors);
}

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

	private _isEnabled: boolean;

	private readonly _ruleFactory = new DynamicCssRules(this._editor);

	private readonly _decoratorLimitReporter = new DecoratorLimitReporter();

	// TODO: Transform into a setting later
	// TODO: When this is enabled, this means we still want the color boxes to show up with the default color provider that makes boxes show up
	private useDefaultColorProvider: boolean;

	constructor(
		private readonly _editor: ICodeEditor,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageFeatureDebounceService languageFeatureDebounceService: ILanguageFeatureDebounceService,
	) {
		super();
		this._debounceInformation = languageFeatureDebounceService.for(_languageFeaturesService.colorProvider, 'Document Colors', { min: ColorDetector.RECOMPUTE_TIME });
		this.useDefaultColorProvider = true;

		// TODO: this._editor.getOption(EditorOption.defaultColorDecorations);

		this._register(_editor.onDidChangeModel(() => {
			this._isEnabled = this.isEnabled();
			this.onModelChanged();
		}));
		this._register(_editor.onDidChangeModelLanguage(() => this.onModelChanged()));
		this._register(_languageFeaturesService.colorProvider.onDidChange(() => this.onModelChanged()));
		this._register(_editor.onDidChangeConfiguration((e) => {
			const prevIsEnabled = this._isEnabled;
			this._isEnabled = this.isEnabled();
			const updated = prevIsEnabled !== this._isEnabled || e.hasChanged(EditorOption.colorDecoratorsLimit);
			if (updated) {
				if (this._isEnabled) {
					this.onModelChanged();
				} else {
					this.removeAllDecorations();
				}
			}
			// TODO: const defaultColorDecorations = e.hasChanged(EditorOption.defaultColorDecorations);
			// if (defaultColorDecorations) {
			// 	this.useDefaultColorProvider = this._editor.getOption(EditorOption.defaultColorDecorations);
			// }
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

	private onModelChanged(): void {

		console.log('inside of on model changed');

		this.stop();

		if (!this._isEnabled) {

			console.log('early return');

			return;
		}
		const model = this._editor.getModel();

		// Doing the early return when we are using the default color provider in order to display the color boxes
		if (!model || !this._languageFeaturesService.colorProvider.has(model) && !this.useDefaultColorProvider) {

			console.log('second early return');

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

	public beginCompute(): void {
		this._computePromise = createCancelablePromise(async token => {
			const model = this._editor.getModel();
			if (!model) {
				return Promise.resolve([]);
			}
			const sw = new StopWatch(false);

			console.log('Before getColors of beginCompute');

			let colors = await getColors(this._languageFeaturesService.colorProvider, model, token);

			if (this.useDefaultColorProvider && colors.length === 0) {

				console.log('entered into the first if loop of the beginCompute');

				// When there are no colors and the default color provider is used, then compute the color data from this
				colors = await getDefaultColors(model, token);

				console.log('colors after getDefaultColors : ', colors);

			} else if (this.useDefaultColorProvider) {

				console.log('entered into the second if loop of begin compute');

				// In this case, there are colors but there are also default colors, so we should not show duplicated, if duplicates are found
			}
			this._debounceInformation.update(model, sw.elapsed());

			console.log('colors : ', colors);

			return colors;
		});
		this._computePromise.then((colorInfos) => {

			console.log('colorInfos : ', colorInfos);

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

		console.log('Inside of updateDecorations');
		console.log('colorDatas: ', colorDatas);

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

	private _colorDecorationClassRefs = this._register(new DisposableStore());

	private updateColorDecorators(colorData: IColorData[]): void {

		console.log('Inside of update color decorators');
		console.log('colorDatas : ', colorData);

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

	public get colorDatas(): Map<string, IColorData> {
		return this._colorDatas;
	}

	public set colorDatas(ids: Map<string, IColorData>) {
		this._colorDatas = ids;
	}

	getColorData(position: Position): IColorData | null {

		console.log('Inside of getColorData');
		console.log('position : ', position);
		console.log('this._colorDatas : ', this._colorDatas);

		const model = this._editor.getModel();
		if (!model) {
			return null;
		}

		const decorations = model
			.getDecorationsInRange(Range.fromPositions(position, position))
			.filter(d => this._colorDatas.has(d.id));

		console.log('decorations : ', decorations);

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

registerEditorContribution(ColorDetector.ID, ColorDetector, EditorContributionInstantiation.AfterFirstRender);
