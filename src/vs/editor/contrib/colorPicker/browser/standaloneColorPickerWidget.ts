/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { HoverParticipantRegistry, IEditorHoverRenderContext } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IModelDeltaDecoration, ITextModel, PositionAffinity } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { ColorHover, ColorHoverParticipant } from 'vs/editor/contrib/colorPicker/browser/colorHoverParticipant';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorHoverStatusBar } from 'vs/editor/contrib/hover/browser/contentHover';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ColorPickerBody, ColorPickerHeader, ColorPickerWidget } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';
import { Emitter } from 'vs/base/common/event';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { DocumentColorProvider, IColor, IColorInformation, IColorPresentation, ProviderResult } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Selection } from 'vs/editor/common/core/selection';
import { IRange } from 'vs/editor/common/core/range';
import * as dom from 'vs/base/browser/dom';
import 'vs/css!./colorPicker';
import { Color, RGBA } from 'vs/base/common/color';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CancelablePromise, TimeoutTimer, createCancelablePromise } from 'vs/base/common/async';
import { StopWatch } from 'vs/base/common/stopwatch';
import { IColorData } from 'vs/editor/contrib/colorPicker/browser/color';
import { ColorDecorationInjectedTextMarker, ColorDetector, DecoratorLimitReporter } from 'vs/editor/contrib/colorPicker/browser/colorDetector';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { DynamicCssRules } from 'vs/editor/browser/editorDom';
import { noBreakWhitespace } from 'vs/base/common/strings';

export class StandaloneColorPickerController extends Disposable implements IEditorContribution {

	public static ID = 'editor.contrib.standaloneColorPickerController';
	private _standaloneColorPickerWidget: StandaloneColorPickerWidget | null = null;
	private _colorHoverVisible: IContextKey<boolean>;
	private _colorHoverFocused: IContextKey<boolean>;

	constructor(
		private readonly _editor: ICodeEditor,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageFeaturesService private readonly _languageFeatureService: ILanguageFeaturesService,
		@ILanguageFeatureDebounceService private readonly _languageFeatureDebounceService: ILanguageFeatureDebounceService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();

		console.log('creating new instance of the standalone color picker widget');

		// Setting the context keys for setting whether the standalone color picker is visible or not
		this._colorHoverVisible = EditorContextKeys.standaloneColorPickerVisible.bindTo(this._contextKeyService);
		this._colorHoverFocused = EditorContextKeys.standaloneColorPickerFocused.bindTo(this._contextKeyService);
	}

	public showOrFocus() {

		// Suppose tha the color hover is not visible, then make it visible
		if (!this._colorHoverVisible.get()) {

			console.log('inside of color hover not visible');

			this._colorHoverVisible.set(true);
			this._standaloneColorPickerWidget = new StandaloneColorPickerWidget(this._editor, this._instantiationService, this._keybindingService, this._languageFeatureService, this._contextKeyService, this._languageFeatureDebounceService);
			this._editor.addContentWidget(this._standaloneColorPickerWidget);

		} else if (!this._colorHoverFocused.get()) {

			console.log('inside of color hover not focused');

			this._colorHoverFocused.set(true);
			this._standaloneColorPickerWidget?.focus();
		}
	}

	public hide() {

		console.log('calling hide');

		this._colorHoverFocused.set(false);
		this._colorHoverVisible.set(false);
		this._editor.focus();
		this._standaloneColorPickerWidget?.hide();
	}

	public updateEditor() {
		console.log('inside of udpate editor of the standalone color picker controller');

		this._standaloneColorPickerWidget?.updateEditor();
		this.hide();
	}

	public static get(editor: ICodeEditor) {
		return editor.getContribution<StandaloneColorPickerController>(StandaloneColorPickerController.ID);
	}
}

registerEditorContribution(StandaloneColorPickerController.ID, StandaloneColorPickerController, EditorContributionInstantiation.AfterFirstRender);

export class StandaloneColorPickerWidget implements IContentWidget {

	static readonly ID = 'editor.contrib.standaloneColorPickerWidget';
	private body: HTMLElement = document.createElement('div');

	private readonly _position: Position | undefined = undefined;
	private readonly _selection: Selection | null = null;

	private readonly _participants: ColorHoverParticipant[] = [];
	private readonly _standaloneColorPickerComputer: StandaloneColorPickerComputer;

	private _disposables: DisposableStore = new DisposableStore();
	private _resultFound: boolean = false;
	private _colorHoverData: ColorHover[] = [];
	private _colorHoverVisible: IContextKey<boolean>;
	private _colorHoverFocused: IContextKey<boolean>;
	private _selectionForColorPicker: boolean = false;

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILanguageFeatureDebounceService private readonly languageFeatureDebounceService: ILanguageFeatureDebounceService
	) {
		this._position = this.editor._getViewModel()?.getPrimaryCursorState().viewState.position;
		this._selection = this.editor.getSelection();

		for (const participant of HoverParticipantRegistry.getAll()) {

			console.log('participant : ', participant);

			if (participant === ColorHoverParticipant) {

				console.log('entered into the case when the participant is pushed');

				const participantInstance: ColorHoverParticipant = this.instantiationService.createInstance(participant, this.editor);

				// TODO: Should we actually be using these kinds of variables
				participantInstance.standaloneColorPickerWidget = true;

				this._participants.push(participantInstance);
			}
		}

		console.log('this._participants : ', this._participants);

		const focusTracker = this._disposables.add(dom.trackFocus(this.body));

		const selection = this._selection ?
			{
				startLineNumber: this._selection.startLineNumber,
				startColumn: this._selection.startColumn,
				endLineNumber: this._selection.endLineNumber,
				endColumn: this._selection.endColumn
			} : { startLineNumber: 0, endLineNumber: 0, endColumn: 0, startColumn: 0 };

		this._standaloneColorPickerComputer = new StandaloneColorPickerComputer(selection, this.editor, this._participants, this.languageFeaturesService, this.languageFeatureDebounceService);

		this._disposables.add(this._standaloneColorPickerComputer.onResult((result) => {

			console.log('inside of on result of the hover operation');
			console.log('result.value : ', result.value);

			// When a result has been found, don't render a second time, only render with the first result
			// render the color picker, when there is a result which is a non null array
			if (!this._resultFound && result.value.length !== 0) {
				this._render(result.value, result.foundInMap);
			}
		}));

		// When the cursor position changes, hide the color picker
		this._disposables.add(this.editor.onDidChangeCursorPosition(() => {
			console.log('ondidchangeCursorPosition');
			console.log('this._selectionForColorPicker : ', this._selectionForColorPicker);
			if (!this._selectionForColorPicker) {
				this.hide();
			} else {
				this._selectionForColorPicker = false;
			}
		}));
		this._disposables.add(focusTracker.onDidBlur(_ => {
			this.hide();
		}));
		this._disposables.add(focusTracker.onDidFocus(_ => {
			this.focus();
		}));

		// Starting the hover operation
		// TODO: The hover operation should always be immediate since started using the keybindings
		// Call the start function only when the first update has been completed, not before
		this._disposables.add(this._standaloneColorPickerComputer.onUpdated(() => {
			this._standaloneColorPickerComputer.start();
		}));

		this._colorHoverVisible = EditorContextKeys.standaloneColorPickerVisible.bindTo(this.contextKeyService);
		this._colorHoverFocused = EditorContextKeys.standaloneColorPickerFocused.bindTo(this.contextKeyService);
	}

	public updateEditor() {

		console.log('inside of update editor of the standalone color picker widget');
		console.log('this._hoverParts.length : ', this._colorHoverData.length);

		for (const participant of this._participants) {
			// TODO: Maybe I don't even need the participant, maybe I can work without the participant?
			// TODO: What happens when the hover parts length is bigger than zero, then that means that the update is called several times
			if (this._colorHoverData.length > 0 && participant instanceof ColorHoverParticipant) {
				participant.updateEditorModel(this._colorHoverData);
			}
		}
	}

	private _render(colorHoverData: ColorHover[], foundInMap: boolean) {

		console.log('Entered into _renderColorPicker');
		console.log('foundInMap : ', foundInMap);

		console.log('colorHoverData : ', colorHoverData);

		// Once the messages have been found once, we do not want to find a second result
		this._resultFound = true;

		const fragment = document.createDocumentFragment();
		const statusBar = this._disposables.add(new EditorHoverStatusBar(this.keybindingService));
		// The color picker is initially null but it is set in the context below
		let colorPickerWidget: ColorPickerWidget | null = null;

		const context: IEditorHoverRenderContext = {
			fragment, // The container into which to add the color hover parts
			statusBar,
			setColorPicker: (widget: ColorPickerWidget) => colorPickerWidget = widget,
			onContentsChanged: () => { },
			hide: () => this.hide()
		};

		for (const participant of this._participants) {
			const hoverParts = colorHoverData.filter(msg => msg.owner === participant);

			// We select only the hover parts which correspond to the color hover participants
			if (hoverParts.length > 0) {

				console.log('hoverParts : ', hoverParts);

				// Setting the hover parts, these are saved only, not directly used
				this._colorHoverData = hoverParts;
				// Calling the hover parts of the participant
				participant.foundInMap = foundInMap;
				this._disposables.add(participant.renderHoverParts(context, hoverParts));
			}
		}

		if (!((colorPickerWidget as any) instanceof ColorPickerWidget)) {
			return;
		}

		colorPickerWidget = (colorPickerWidget as any) as ColorPickerWidget;
		const colorPickerBody: ColorPickerBody = colorPickerWidget.body;
		const enterButton = colorPickerBody.enterButton;
		const colorPickerHeader: ColorPickerHeader = colorPickerWidget.header;
		const closeButton = colorPickerHeader.closeButton;

		const maxHeight = Math.max(this.editor.getLayoutInfo().height / 4, 250);
		const maxWidth = Math.max(this.editor.getLayoutInfo().width * 0.66, 500);

		this.body.classList.add('standalone-color-picker-class');
		this.body.style.maxHeight = maxHeight + 'px';
		this.body.style.maxWidth = maxWidth + 'px';
		this.body.style.display = 'block';
		this.body.tabIndex = 0;

		console.log('fragment : ', fragment);
		console.log('fragment.childNodes : ', fragment.childNodes);

		this.body.appendChild(fragment);
		colorPickerWidget.layout();

		enterButton?.onClicked(() => {
			console.log('on the button click');
			this.updateEditor();
			this.hide();
		});
		closeButton?.onClicked(() => {
			console.log('on the close button click');
			this.hide();
		});

		console.log('this.body : ', this.body);

		this.editor.layoutContentWidget(this);

		console.log('this.body : ', this.body);
		const clientHeight = this.body.clientHeight;
		const clientWidth = this.body.clientWidth;
		console.log('clientHeight : ', clientHeight);
		console.log('clientWidth : ', clientWidth);

		if (foundInMap) {
			// if found in map is true then we want to highlight the selection in the editor
			if (enterButton) {
				enterButton.button.textContent = 'Replace';
			}
			const range = colorHoverData[0].range;
			console.log('range : ', range);
			this._selectionForColorPicker = true;
			console.log('right before setting the range selection in the _render function');
			console.log('this._selectionForColorPicker : ', this._selectionForColorPicker);
			this.editor.setSelection(range);
		}
	}

	public getId(): string {
		return StandaloneColorPickerWidget.ID;
	}

	public getDomNode(): HTMLElement {

		console.log('inside of this.getDomNode(), the body element : ', this.body);

		return this.body;
	}

	public getPosition(): IContentWidgetPosition | null {
		if (!this._position) {
			return null;
		}
		const positionPreference = this.editor.getOption(EditorOption.hover).above;
		return {
			position: this._position,
			secondaryPosition: this._position,
			preference: positionPreference ? [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW] : [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE],
			positionAffinity: PositionAffinity.None
		};
	}

	public hide(): void {
		this.editor.removeContentWidget(this);
		this._resultFound = false;
		this._disposables.dispose();
		this._colorHoverFocused.set(false);
		this._colorHoverVisible.set(false);
		this.editor.focus();
	}

	public focus(): void {
		this.body.focus();
	}
}

export class StandaloneColorPickerResult {
	constructor(
		public readonly value: ColorHover[],
		public readonly foundInMap: boolean
	) { }
}

export interface IStandaloneColorPickerComputer {
	start(): Promise<void>;
}

export class StandaloneColorPickerComputer extends Disposable implements IStandaloneColorPickerComputer {

	private readonly _onResult = this._register(new Emitter<StandaloneColorPickerResult>());
	public readonly onResult = this._onResult.event;
	private readonly _updated = this._register(new Emitter<void>());
	public readonly onUpdated = this._updated.event;

	private _disposables = new DisposableStore();
	private _defaultProvider: DocumentColorProvider | undefined = undefined;
	private readonly _localToDispose = this._register(new DisposableStore());
	private _computePromise: CancelablePromise<IColorData[]> | null = null;
	private _timeoutTimer: TimeoutTimer | null = null;
	private _debounceInformation: IFeatureDebounceInformation;
	private _decorationsIds: string[] = [];

	// TODO: Input the correct range directly
	constructor(
		private readonly _range: IRange,
		private readonly _editor: ICodeEditor,
		private readonly _participants: readonly ColorHoverParticipant[],
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ILanguageFeatureDebounceService languageFeatureDebounceService: ILanguageFeatureDebounceService,
	) {
		super();

		const textModel = this._editor.getModel();
		if (!textModel) {
			return;
		}
		const registry = this.languageFeaturesService.colorProvider;
		const providers = registry.ordered(textModel).reverse();

		if (providers.length === 0) {
			// Suppose that the above does not give a color hover array, then we still want a color hover array
			this._defaultProvider = new DefaultDocumentColorProviderForStandaloneColorPicker();
			// TODO: Only do this when have to use the default document symbol provider
			// Don't need disposables because computer is unique per document, but may need listner on model content changed
			this.onModelChanged();
		}

		this._debounceInformation = languageFeatureDebounceService.for(languageFeaturesService.colorProvider, 'Document Colors', { min: ColorDetector.RECOMPUTE_TIME });
	}

	public async start(): Promise<void> {
		if (this._range !== null) {
			const computeAsyncResult = await this.computeAsync(this._range);
			if (!computeAsyncResult) {
				return;
			}
			console.log(' computeAsyncResult.foundInMap : ', computeAsyncResult.foundInMap);
			this._onResult.fire(new StandaloneColorPickerResult(computeAsyncResult.result.slice(0), computeAsyncResult.foundInMap));
		}
	}

	private async computeAsync(range: IRange): Promise<{ result: ColorHover[]; foundInMap: boolean } | null> {

		console.log('computeAsync of ColorHoverComputer');

		if (!this._editor.hasModel()) {
			return null;
		}

		let result: ColorHover[] = [];
		let foundInMap = false;

		for (const participant of this._participants) {
			const colorInfo: IColorInformation = {
				range: range,
				color: { red: 0, green: 0, blue: 0, alpha: 1 }
			};
			const textModel = this._editor.getModel();
			const registry = this.languageFeaturesService.colorProvider;
			const providers = registry.ordered(textModel).reverse();

			console.log('participant : ', participant);
			console.log('providers : ', providers);

			// TODO: When there are no providers, we still want to render a color picker
			if (providers.length === 0 && this._defaultProvider) {
				console.log('early return because no providers');

				const createColorHoverResult = await participant.createColorHover(colorInfo, this._defaultProvider);
				if (!createColorHoverResult) {
					return null;
				}
				const colorHover = createColorHoverResult.colorHover;
				foundInMap = createColorHoverResult.foundInMap;
				if (colorHover) {
					result = result.concat(colorHover);
				}
				continue;
			}

			// Otherwise choose the first provider
			const provider = providers[0];

			console.log('provider : ', provider);

			// TODO: do we need to set the provider for each participant, what does it do?
			// TODO: What is the difference between the participants and the document color providers?

			const createColorHoverResult = await participant.createColorHover(colorInfo, provider);
			if (!createColorHoverResult) {
				return null;
			}
			const colorHover = createColorHoverResult.colorHover;
			foundInMap = createColorHoverResult.foundInMap;
			console.log('foundInMap of computeAsync : ', foundInMap);
			if (colorHover) {
				result = result.concat(colorHover);
			}
		}

		console.log('result from computeAsync : ', result);
		return { result: result, foundInMap: foundInMap };
	}

	private onModelChanged(): void {
		console.log('inside of on model changed of standalone color picker computer');

		const model = this._editor.getModel();
		if (!model) {
			console.log('second early return');
			return;
		}

		this._localToDispose.add(this._editor.onDidChangeModelContent(() => {
			if (!this._timeoutTimer) {
				this._timeoutTimer = new TimeoutTimer();
				this._timeoutTimer.cancelAndSet(() => {
					this._timeoutTimer = null;
					this.beginComputeColorDatas();
				}, this._debounceInformation.get(model));
			}
		}));
		this.beginComputeColorDatas();
	}

	private beginComputeColorDatas(): void {
		console.log('inside of begin compute color datas');
		this._computePromise = createCancelablePromise(async token => {
			const model = this._editor.getModel();
			if (!model) {
				return Promise.resolve([]);
			}
			const sw = new StopWatch(false);
			const colors = await this.getColors(this._defaultProvider!, model, token);
			console.log('after getColors');
			this._debounceInformation.update(model, sw.elapsed());
			return colors;
		});
		this._computePromise.then((colorInfos) => {
			this.updateDecorations(colorInfos);
			// this.updateColorDecorators(colorInfos);
			this._computePromise = null;
			// fire the even to sginal that now start can be called
			this._updated.fire();
		}, onUnexpectedError);
	}

	// Using thed default provider here
	private async getColors(provider: DocumentColorProvider, model: ITextModel, token: CancellationToken): Promise<IColorData[]> {
		const colors: IColorData[] = [];
		console.log('inside of getColors');
		const documentColors = await provider.provideDocumentColors(model, token)!;
		if (Array.isArray(documentColors)) {
			for (const colorInfo of documentColors) {
				colors.push({ colorInfo, provider });
			}
		}
		return colors;
	}

	private updateDecorations(colorDatas: IColorData[]): void {
		console.log('inside of update decorations');
		console.log('colorDatas : ', colorDatas);
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

			const colorDetector = ColorDetector.get(this._editor);
			if (!colorDetector) {
				return;
			}
			colorDetector.colorDatas = new Map<string, IColorData>();
			this._decorationsIds.forEach((id, i) => colorDetector.colorDatas.set(id, colorDatas[i]));
		});

		const colorDetector = ColorDetector.get(this._editor);
		console.log('colorDetector?.colorDatas : ', colorDetector?.colorDatas);
	}

	public override dispose(): void {
		super.dispose();
		this._disposables.dispose();
	}
}

// Add possibility to register a new color format by referring to the specific type
// Then provide the appropropriate document symbols and the appropriate color representations

class DefaultDocumentColorProviderForStandaloneColorPicker implements DocumentColorProvider {

	constructor() { }

	private _findRange(model: ITextModel, match: RegExpMatchArray): IRange | undefined {

		const index = match.index;
		const length = match[0].length;
		if (!index) {
			return;
		}
		const startPosition = model.getPositionAt(index);
		const endPosition = model.getPositionAt(index + length);
		const range: IRange = {
			startLineNumber: startPosition.lineNumber,
			startColumn: startPosition.column,
			endLineNumber: endPosition.lineNumber,
			endColumn: endPosition.column
		};
		return range;
	}

	// TODO: Have a pop up which translates somewhow the RGBA to another format, on save, it adds another pannel
	// Then these are searched everywhere in the file and to provide the correct color presentations
	// Then you can also add a new color using the custom formatting, need a custom button for this however
	// TODO: Change the colors_data which is what I want to change in a difffernet way, directly in the code above
	provideDocumentColors(model: ITextModel, token: CancellationToken): ProviderResult<IColorInformation[]> {

		const result: IColorInformation[] = [];

		console.log('inside of provideDocumentColors of the DefaultDocumentColorProviderForStandaloneColorPicker');
		// Default are the custom CSS color formats
		// TODO: need to create an extension where this could be used otherwise it will not work
		const rgbaRegex = 'rgba[(](\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]),(\s*)(([0-1]|)[.][0-9]*)[)]';
		const matches = model.findMatches(rgbaRegex, false, true, false, null, true);
		console.log('matches : ', matches);

		// TODO: Not able to use the find Matches above with the regex below which works?

		/// RGBA done
		const allText = model.getLinesContent().join('\n');
		const rgbaRegexOther = /rgba[(](\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([01][.]|[01]|[.][0-9]+|[0][.][0-9]*)(\s*)[)]/gm;
		const rgbaMatches = [...allText.matchAll(rgbaRegexOther)];
		console.log('matchesOther : ', rgbaMatches);

		for (const match of rgbaMatches) {

			console.log('match : ', match);

			const range = this._findRange(model, match);
			if (!range) {
				return;
			}

			console.log('range : ', range);

			const finalNumbers = [];
			for (const element of match) {
				const parsedNumber = Number(element);
				if (parsedNumber) {
					finalNumbers.push(parsedNumber);
				}
			}
			console.log('finalNumbers : ', finalNumbers);

			const red = finalNumbers[0] / 255;
			const green = finalNumbers[1] / 255;
			const blue = finalNumbers[2] / 255;
			const alpha = finalNumbers[3];

			console.log('red : ', red);
			console.log('green : ', green);
			console.log('blue : ', blue);
			console.log('alpha : ', alpha);

			if (!(red && blue && green && alpha)) {
				return;
			}
			const color: IColor = {
				red: red,
				blue: blue,
				green: green,
				alpha: alpha
			};
			const colorInformation = {
				range: range,
				color: color
			};
			result.push(colorInformation);
		}

		// HEXA
		console.log('Inside of Hexa');

		const hexaRegex = /#([A-Fa-f0-9]{8})/gm;
		const hexaMatches = [...allText.matchAll(hexaRegex)];
		console.log('hexaMatches : ', hexaMatches);

		for (const match of hexaMatches) {

			console.log('match : ', match);

			const range = this._findRange(model, match);
			if (!range) {
				return;
			}

			console.log('range : ', range);

			const hexValue = match.at(0);

			console.log('hexValue : ', hexValue);

			if (!hexValue) {
				console.log('early return');
				return;
			}

			const parsedHexColor = Color.Format.CSS.parseHex(hexValue);
			console.log('parsedHexColor : ', parsedHexColor);

			if (!parsedHexColor) {
				console.log('early return');
				return;
			}

			const parsedHexIColor = {
				red: parsedHexColor.rgba.r / 255,
				green: parsedHexColor.rgba.g / 255,
				blue: parsedHexColor.rgba.b / 255,
				alpha: parsedHexColor.rgba.a
			};
			const colorInformation = {
				range: range,
				color: parsedHexIColor
			};
			result.push(colorInformation);
		}

		// ------------
		const hslaRegex = /hsla[(](\s*)(36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*),(\s*)([01][.]|[01]|[.][0-9]+|[0][.][0-9]*)(\s*)[)]/gm;
		const hslaMatches = [...allText.matchAll(hslaRegex)];
		console.log('hslaMatches : ', hslaMatches);

		for (const match of hslaMatches) {

			console.log('match : ', match);

			const range = this._findRange(model, match);
			if (!range) {
				return;
			}

			console.log('range : ', range);

			const hslaValue = match.at(0);

			console.log('hslaValue : ', hslaValue);

			const finalNumbers = [];
			for (const element of match) {
				const parsedNumber = Number(element);
				if (parsedNumber) {
					finalNumbers.push(parsedNumber);
				}
			}

			const h = finalNumbers[0];
			const s = finalNumbers[1];
			const l = finalNumbers[2];
			const alpha = finalNumbers[3];

			const normalizedS = s / 100;
			const normalizedL = l / 100;
			const normalizedH = h / 60;

			const c = (1 - Math.abs(2 * normalizedL - 1)) * normalizedS;
			const x = c * (1 - Math.abs(normalizedH % 2 - 1));

			let intermediaryResult;
			if (normalizedH >= 0 && normalizedH < 1) {
				intermediaryResult = [c, x, 0];
			} else if (normalizedH >= 1 && normalizedH < 2) {
				intermediaryResult = [x, c, 0];
			} else if (normalizedH >= 2 && normalizedH < 3) {
				intermediaryResult = [0, c, x];
			} else if (normalizedH >= 3 && normalizedH < 4) {
				intermediaryResult = [0, x, c];
			} else if (normalizedH >= 4 && normalizedH < 5) {
				intermediaryResult = [x, 0, c];
			} else if (normalizedH >= 5 && normalizedH <= 6) {
				intermediaryResult = [c, 0, x];
			} else {
				throw new Error('Invalid HSLA value');
			}

			const m = normalizedL - c / 2;

			const parsedHslaValue = {
				red: intermediaryResult[0] + m,
				green: intermediaryResult[1] + m,
				blue: intermediaryResult[2] + m,
				alpha: alpha
			};

			const colorInformation = {
				range: range,
				color: parsedHslaValue
			};
			result.push(colorInformation);
		}

		console.log('result : ', result);
		return result;
	}

	provideColorPresentations(model: ITextModel, colorInfo: IColorInformation, token: CancellationToken): ProviderResult<IColorPresentation[]> {
		console.log('inside of provideColorPresentations of the DefaultDocumentColorProvider');
		console.log('colorInfo : ', colorInfo);

		const languageId = model.getLanguageId();
		console.log('languageId : ', languageId);
		// Using the CSS color format as the default
		// Allow the user to be able to define other custom color formats
		const range = colorInfo.range;
		const colorFromInfo: IColor = colorInfo.color;

		const alpha = colorFromInfo.alpha;
		const color = new Color(new RGBA(Math.round(255 * colorFromInfo.red), Math.round(255 * colorFromInfo.green), Math.round(255 * colorFromInfo.blue), alpha));

		let rgb;
		let hsl;
		let hex;

		// if alpha is 1, don't need to use the alpha channel
		if (alpha === 1) {
			rgb = Color.Format.CSS.formatRGB(color);
			hsl = Color.Format.CSS.formatHSL(color);
			hex = Color.Format.CSS.formatHex(color);
		}
		// otherwise need to use the alpha channel
		else {
			rgb = Color.Format.CSS.formatRGBA(color);
			hsl = Color.Format.CSS.formatHSLA(color);
			hex = Color.Format.CSS.formatHexA(color);
		}

		const colorPresentations: IColorPresentation[] = [];
		colorPresentations.push({ label: rgb, textEdit: { range: range, text: rgb } });
		colorPresentations.push({ label: hsl, textEdit: { range: range, text: hsl } });
		colorPresentations.push({ label: hex, textEdit: { range: range, text: hex } });
		return colorPresentations;
	}
}
