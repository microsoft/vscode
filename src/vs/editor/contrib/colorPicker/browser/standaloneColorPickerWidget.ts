/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IEditorHoverRenderContext } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { ITextModel, PositionAffinity } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { ColorHover, ColorHoverParticipant } from 'vs/editor/contrib/colorPicker/browser/colorHoverParticipant';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorHoverStatusBar } from 'vs/editor/contrib/hover/browser/contentHover';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ColorPickerBody, ColorPickerHeader, ColorPickerWidget, InsertButton } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';
import { Emitter } from 'vs/base/common/event';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { DocumentColorProvider, IColorInformation } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Selection } from 'vs/editor/common/core/selection';
import { IRange } from 'vs/editor/common/core/range';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CancelablePromise, TimeoutTimer, createCancelablePromise } from 'vs/base/common/async';
import { StopWatch } from 'vs/base/common/stopwatch';
import { IColorData } from 'vs/editor/contrib/colorPicker/browser/color';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/browser/colorDetector';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { DefaultDocumentColorProviderForStandaloneColorPicker } from 'vs/editor/contrib/colorPicker/browser/defaultDocumentColorProvider';
import * as dom from 'vs/base/browser/dom';
import 'vs/css!./colorPicker';

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

		this._colorHoverVisible = EditorContextKeys.standaloneColorPickerVisible.bindTo(this._contextKeyService);
		this._colorHoverFocused = EditorContextKeys.standaloneColorPickerFocused.bindTo(this._contextKeyService);

		// TODO: Registering a custom color document provider, solves the errors arising after registering this
		this._register(this._languageFeatureService.colorProvider.register('*', new DefaultDocumentColorProviderForStandaloneColorPicker()));
	}

	public showOrFocus() {

		if (!this._colorHoverVisible.get()) {

			console.log('Inside of the case when the color hover is not visible');

			this._colorHoverVisible.set(true);
			this._standaloneColorPickerWidget = new StandaloneColorPickerWidget(this._editor, this._instantiationService, this._keybindingService, this._languageFeatureService, this._contextKeyService, this._languageFeatureDebounceService);
			this._editor.addContentWidget(this._standaloneColorPickerWidget);

		} else if (!this._colorHoverFocused.get()) {

			console.log('Inside of the ccase when the color hover is visible but not focused');

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

		console.log('Inside of udpate editor of the standalone color picker controller');

		this._standaloneColorPickerWidget?.updateEditor();
		this.hide();
	}

	public static get(editor: ICodeEditor) {
		return editor.getContribution<StandaloneColorPickerController>(StandaloneColorPickerController.ID);
	}
}

registerEditorContribution(StandaloneColorPickerController.ID, StandaloneColorPickerController, EditorContributionInstantiation.AfterFirstRender);

// New Standalone Color Picker Widget is created when the ShowOrFocus function from above is called
export class StandaloneColorPickerWidget implements IContentWidget {

	static readonly ID = 'editor.contrib.standaloneColorPickerWidget';
	private body: HTMLElement = document.createElement('div');

	private readonly _position: Position | undefined = undefined;
	private readonly _selection: Selection | null = null;

	private readonly _participant: ColorHoverParticipant;
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

		// The position of the primary cursor
		this._position = this.editor._getViewModel()?.getPrimaryCursorState().viewState.position;
		// The primary selection
		this._selection = this.editor.getSelection();
		// Creating an instance of the color hover participant, presumably only one color hover participant
		this._participant = this.instantiationService.createInstance(ColorHoverParticipant, this.editor);
		// TODO: Signalling that we are using a standalone color picker widget, maybe no longer need with the registration
		this._participant.standaloneColorPickerWidget = true;

		const focusTracker = this._disposables.add(dom.trackFocus(this.body));

		const selection = this._selection ?
			{
				startLineNumber: this._selection.startLineNumber,
				startColumn: this._selection.startColumn,
				endLineNumber: this._selection.endLineNumber,
				endColumn: this._selection.endColumn
			} : { startLineNumber: 0, endLineNumber: 0, endColumn: 0, startColumn: 0 };

		this._standaloneColorPickerComputer = new StandaloneColorPickerComputer(selection, this.editor, this._participant, this.languageFeaturesService, this.languageFeatureDebounceService);

		// When a result is obtained from the computer, render the color picker
		this._disposables.add(this._standaloneColorPickerComputer.onResult((result) => {

			console.log('Inside of on result of the hover operation');
			console.log('result.value : ', result.value);

			// When a result has been found, don't render a second time, only render with the first result
			// TODO: But what about if there is a second result? Maybe we need it?
			if (!this._resultFound && result.value.length !== 0) {
				// The foundInMap variable is used to determine if the color computed has been found as one of the colors in the document
				this._render(result.value, result.foundInMap);
			}
		}));

		// When the cursor position changes, hide the color picker
		this._disposables.add(this.editor.onDidChangeCursorPosition(() => {

			console.log('Inside of ondidchangeCursorPosition');
			console.log('this._selectionForColorPicker : ', this._selectionForColorPicker);

			// Selection for color picker variable is used to determine if the color picker was opened using the keybindins
			// If not opened using the keybindings, then hide the color picker
			if (!this._selectionForColorPicker) {
				this.hide();
			} else {
				// Otherwise the variable is set to true
				this._selectionForColorPicker = false;
			}
		}));
		this._disposables.add(focusTracker.onDidBlur(_ => {
			this.hide();
		}));
		this._disposables.add(focusTracker.onDidFocus(_ => {
			this.focus();
		}));

		// Get all the providers associated with the textModel
		const providers = this.languageFeaturesService.colorProvider.ordered(this.editor.getModel()!).reverse();
		console.log('providers inside of standalone color picker widget : ', providers);
		// if (providers.length === 0) {
		// 	// Call the start function only when the first update has been completed, not before
		// 	this._disposables.add(this._standaloneColorPickerComputer.onUpdated(() => {
		// 		this._standaloneColorPickerComputer.start();
		// 	}));
		// } else {
		this._standaloneColorPickerComputer.start();
		// }
		this._colorHoverVisible = EditorContextKeys.standaloneColorPickerVisible.bindTo(this.contextKeyService);
		this._colorHoverFocused = EditorContextKeys.standaloneColorPickerFocused.bindTo(this.contextKeyService);
	}

	// This function changes the editor model
	public updateEditor() {

		console.log('Inside of update editor of the standalone color picker widget');
		console.log('this._colorHoverData.length : ', this._colorHoverData.length);

		// TODO: Maybe I don't even need the participant, maybe I can work without the participant?
		if (this._colorHoverData.length > 0) {
			this._participant.updateEditorModel(this._colorHoverData);
		}

	}

	private _render(colorHoverData: ColorHover[], foundInMap: boolean) {

		console.log('Entered into _render method');
		console.log('foundInMap : ', foundInMap);
		console.log('colorHoverData : ', colorHoverData);

		// TODO: Once the messages have been found once, we do not want to render a second result
		this._resultFound = true;
		const fragment = document.createDocumentFragment();
		const statusBar = this._disposables.add(new EditorHoverStatusBar(this.keybindingService));
		let colorPickerWidget: ColorPickerWidget | null = null;

		const context: IEditorHoverRenderContext = {
			fragment,
			statusBar,
			setColorPicker: (widget: ColorPickerWidget) => colorPickerWidget = widget,
			onContentsChanged: () => { },
			hide: () => this.hide()
		};

		const hoverParts = colorHoverData.filter(msg => msg.owner === this._participant);

		console.log('hoverParts : ', hoverParts);

		if (hoverParts.length > 0) {
			// Setting the hover parts, these are saved only, not directly used
			this._colorHoverData = hoverParts;
			// Setting the boolean variable
			// this._participant.foundInMap = foundInMap;
			// Rendering the hoverParts using the renderHoverParts method
			this._disposables.add(this._participant.renderHoverParts(context, hoverParts));
		}

		// Casting the color picker widget as a ColorPickerWidget
		if (!((colorPickerWidget as any) instanceof ColorPickerWidget)) {
			return;
		}

		colorPickerWidget = (colorPickerWidget as any) as ColorPickerWidget;
		const colorPickerBody: ColorPickerBody = colorPickerWidget.body;
		const enterButton: InsertButton | null = colorPickerBody.enterButton;
		const colorPickerHeader: ColorPickerHeader = colorPickerWidget.header;
		const closeButton = colorPickerHeader.closeButton;

		const maxHeight = Math.max(this.editor.getLayoutInfo().height / 4, 250);
		const maxWidth = Math.max(this.editor.getLayoutInfo().width * 0.66, 500);

		this.body.classList.add('standalone-color-picker-class');
		// Setting a maximum height and width
		this.body.style.maxHeight = maxHeight + 'px';
		this.body.style.maxWidth = maxWidth + 'px';
		this.body.style.display = 'block';
		this.body.tabIndex = 0;
		this.body.appendChild(fragment);
		colorPickerWidget.layout();

		enterButton?.onClicked(() => {

			console.log('on the button click');

			// When the button is clicked, we want to update the editor at that moment
			this.updateEditor();
			// Hiding the color picker when the enter button is picked
			this.hide();
		});
		closeButton?.onClicked(() => {

			console.log('on the close button click');

			// Directly hiding the close button when the close button is clicked
			this.hide();
		});

		// Laying out the content widget
		this.editor.layoutContentWidget(this);

		// Suppose that the variable foundInMap is true, meaning we found the color in the editor
		// If found in map is true then we want to highlight the selection in the editor
		if (foundInMap) {

			// The text of the enter button should be Replace not Insert
			if (enterButton) {
				enterButton.button.textContent = 'Replace';
			}
			// The range will contain the range of the color data, set the selection
			const range = colorHoverData[0].range;
			// We set the selection in the editor model before replacing
			this._selectionForColorPicker = true;
			// Setting the selection directly in the editor
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
		// Depending on the position preference of the hover, place it there
		const positionPreference = this.editor.getOption(EditorOption.hover).above;
		return {
			position: this._position,
			secondaryPosition: this._position,
			preference: positionPreference ? [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW] : [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE],
			positionAffinity: PositionAffinity.None
		};
	}

	public hide(): void {
		// Removing the content widget
		this.editor.removeContentWidget(this);
		this._resultFound = false;
		this._disposables.dispose();
		// Set all the contet keys to the false value
		this._colorHoverFocused.set(false);
		this._colorHoverVisible.set(false);
		// Setting the focus back to the editor
		this.editor.focus();
	}

	public focus(): void {
		this.body.focus();
	}
}

export class StandaloneColorPickerResult {
	// The color picker result consists of a boolean indicating if the color was found in the editor
	// And an array of color results
	constructor(
		public readonly value: ColorHover[],
		public readonly foundInMap: boolean
	) { }
}

export interface IStandaloneColorPickerComputer {
	start(): Promise<void>;
}

export class StandaloneColorPickerComputer extends Disposable implements IStandaloneColorPickerComputer {

	// Event emitters on the computer
	private readonly _onResult = this._register(new Emitter<StandaloneColorPickerResult>());
	public readonly onResult = this._onResult.event;
	// private readonly _updated = this._register(new Emitter<void>());
	// public readonly onUpdated = this._updated.event;

	private readonly _disposables = this._register(new DisposableStore());
	private readonly _localToDispose = this._register(new DisposableStore());
	// The default provider is used when there are no document color providers
	private _defaultProvider: DocumentColorProvider | undefined = undefined;
	// The promise for the color data can be cancelled
	private _computePromise: CancelablePromise<IColorData[]> | null = null;
	private _timeoutTimer: TimeoutTimer | null = null;
	private _debounceInformation: IFeatureDebounceInformation;
	private _decorationsIds: string[] = [];

	constructor(
		private readonly _range: IRange,
		private readonly _editor: ICodeEditor,
		private readonly _participant: ColorHoverParticipant,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ILanguageFeatureDebounceService languageFeatureDebounceService: ILanguageFeatureDebounceService,
	) {
		super();

		const textModel = this._editor.getModel();
		if (!textModel) {
			return;
		}
		// Get all the providers associated with the textModel
		const providers = this.languageFeaturesService.colorProvider.ordered(textModel).reverse();
		console.log('providers : ', providers);

		// Suppose that we do not have any document color providers
		// TODO: When we register our own document color provider, we will have to change this
		// TODO: Because then there will always be a document color provider (a default one always)

		// if (providers.length === 0) {
		// 	console.log('Entered into the case when there are no document color providers');
		// 	// Instantiate a default document color provider
		// 	this._defaultProvider = new DefaultDocumentColorProviderForStandaloneColorPicker();
		// 	this.onModelChanged();
		// }

		this._debounceInformation = languageFeatureDebounceService.for(languageFeaturesService.colorProvider, 'Document Colors', { min: ColorDetector.RECOMPUTE_TIME });
	}

	public async start(): Promise<void> {
		// Suppose that the range is not null then compute the result of the colors at that specific range
		if (this._range !== null) {
			const computeAsyncResult = await this.computeAsync(this._range);
			if (!computeAsyncResult) {
				return;
			}
			// When the result has been found, then fire the result along with the foundInMap boolean
			this._onResult.fire(new StandaloneColorPickerResult(computeAsyncResult.result.slice(0), computeAsyncResult.foundInMap));
		}
	}

	// The result is computed asynchronously at the range
	private async computeAsync(range: IRange): Promise<{ result: ColorHover[]; foundInMap: boolean } | null> {

		console.log('Inside of computeAsync of ColorHoverComputer');

		if (!this._editor.hasModel()) {
			return null;
		}

		// Instantiation of the results to be returned
		let result: ColorHover[] = [];
		let foundInMap = false;

		// The colorInfo contains the initial range and a default color
		const colorInfo: IColorInformation = {
			range: range,
			color: { red: 0, green: 0, blue: 0, alpha: 1 }
		};
		const textModel = this._editor.getModel();
		const providers = this.languageFeaturesService.colorProvider.ordered(textModel).reverse();

		console.log('providers : ', providers);

		// TODO: When there are no providers, we still want to render a color picker
		// TODO: For that we use a default provider

		// let createColorHoverResult: { colorHover: ColorHover; foundInMap: boolean } | null;
		// if (providers.length === 0) {
		// 	if (!this._defaultProvider) {
		// 		return null;
		// 	}
		// 	// New function added to the color hover participant which takes the default provider to do that
		// 	createColorHoverResult = await this._participant.createColorHover(colorInfo, this._defaultProvider);

		// } else {
		const provider = providers[0];

		// TODO: do we need to set the provider for each participant, what does it do?
		// TODO: What is the difference between the participants and the document color providers?
		const createColorHoverResult: { colorHover: ColorHover; foundInMap: boolean } | null = await this._participant.createColorHover(colorInfo, provider);
		// }

		if (!createColorHoverResult) {
			return null;
		}
		const colorHover = createColorHoverResult.colorHover;
		if (colorHover) {
			result = result.concat(colorHover);
		}
		foundInMap = createColorHoverResult.foundInMap;
		return { result: result, foundInMap: foundInMap };
	}

	// private onModelChanged(): void {
	// 	console.log('Inside of on model changed of standalone color picker computer');
	// 	const model = this._editor.getModel();
	// 	if (!model) {
	// 		return;
	// 	}
	// 	// When the model content has changed, we start recalculating the color data
	// 	this._localToDispose.add(this._editor.onDidChangeModelContent(() => {
	// 		if (!this._timeoutTimer) {
	// 			this._timeoutTimer = new TimeoutTimer();
	// 			this._timeoutTimer.cancelAndSet(() => {
	// 				this._timeoutTimer = null;
	// 				this.beginComputeColorDatas();
	// 			}, this._debounceInformation.get(model));
	// 		}
	// 	}));
	// 	// Initial compute the color datas, as well as doing it on the model content change
	// 	this.beginComputeColorDatas();
	// }

	// This function is called only using the default provider, hence why it does not take a provider as an argument
	// private beginComputeColorDatas(): void {
	// 	console.log('Inside of begin compute color datas');
	// 	this._computePromise = createCancelablePromise(async token => {
	// 		const model = this._editor.getModel();
	// 		if (!model) {
	// 			return Promise.resolve([]);
	// 		}
	// 		const sw = new StopWatch(false);
	// 		// Getting the colors for the whole document, not a specific range
	// 		const colors = await this.getColors(this._defaultProvider!, model, token);
	// 		console.log('after getColors');
	// 		this._debounceInformation.update(model, sw.elapsed());
	// 		return colors;
	// 	});
	// 	this._computePromise.then((colorInfos) => {
	// 		// Update the editor when the color infos are obtained
	// 		this.updateDecorations(colorInfos);
	// 		// this.updateColorDecorators(colorInfos);
	// 		this._computePromise = null;
	// 		this._updated.fire();
	// 	}, onUnexpectedError);
	// }

	// Using the default document color provider here
	// private async getColors(provider: DocumentColorProvider, model: ITextModel, token: CancellationToken): Promise<IColorData[]> {
	// 	const colors: IColorData[] = [];
	// 	console.log('Inside of getColors');
	// 	// Calling the provide document colors of the default provider
	// 	const documentColors = await provider.provideDocumentColors(model, token)!;
	// 	if (Array.isArray(documentColors)) {
	// 		for (const colorInfo of documentColors) {
	// 			colors.push({ colorInfo, provider });
	// 		}
	// 	}
	// 	return colors;
	// }

	// The update decorations function will update the editor text model
	// private updateDecorations(colorDatas: IColorData[]): void {
	// 	console.log('Inside of update decorations');
	// 	console.log('colorDatas : ', colorDatas);
	// 	const decorations = colorDatas.map(c => ({
	// 		range: {
	// 			startLineNumber: c.colorInfo.range.startLineNumber,
	// 			startColumn: c.colorInfo.range.startColumn,
	// 			endLineNumber: c.colorInfo.range.endLineNumber,
	// 			endColumn: c.colorInfo.range.endColumn
	// 		},
	// 		options: ModelDecorationOptions.EMPTY
	// 	}));
	// 	this._editor.changeDecorations((changeAccessor) => {
	// 		this._decorationsIds = changeAccessor.deltaDecorations(this._decorationsIds, decorations);
	// 		const colorDetector = ColorDetector.get(this._editor);
	// 		if (!colorDetector) {
	// 			return;
	// 		}
	// 		// Updating the colorDatas map of the color detector
	// 		colorDetector.colorDatas = new Map<string, IColorData>();
	// 		this._decorationsIds.forEach((id, i) => colorDetector.colorDatas.set(id, colorDatas[i]));
	// 	});
	// }

	public override dispose(): void {
		super.dispose();
		this._disposables.dispose();
	}
}
