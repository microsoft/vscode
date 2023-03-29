/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { HoverParticipantRegistry, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { PositionAffinity } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { ColorHover, ColorHoverParticipant } from 'vs/editor/contrib/colorPicker/browser/colorHoverParticipant';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorHoverStatusBar } from 'vs/editor/contrib/hover/browser/contentHover';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ColorPickerBody, ColorPickerHeader, ColorPickerWidget } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';
import { Emitter } from 'vs/base/common/event';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IColorInformation } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Selection } from 'vs/editor/common/core/selection';
import { IRange } from 'vs/editor/common/core/range';
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
		@ILanguageFeatureDebounceService _languageFeatureDebounceService: ILanguageFeatureDebounceService,
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
			this._standaloneColorPickerWidget = new StandaloneColorPickerWidget(this._editor, this._instantiationService, this._keybindingService, this._languageFeatureService, this._contextKeyService);
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

	private readonly _participants: IEditorHoverParticipant[] = [];
	private readonly _standaloneColorPickerComputer: StandaloneColorPickerComputer;

	private _disposables: DisposableStore = new DisposableStore();
	private _resultFound: boolean = false;
	private _hoverParts: IHoverPart[] = [];
	private _colorHoverVisible: IContextKey<boolean>;
	private _colorHoverFocused: IContextKey<boolean>;

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
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

		this._standaloneColorPickerComputer = new StandaloneColorPickerComputer(selection, this.editor, this._participants, this.languageFeaturesService);

		this._disposables.add(this._standaloneColorPickerComputer.onResult((result) => {

			console.log('inside of on result of the hover operation');
			console.log('result.value : ', result.value);

			// When a result has been found, don't render a second time, only render with the first result
			// render the color picker, when there is a result which is a non null array
			if (!this._resultFound && result.value.length !== 0) {
				this._render(result.value);
			}
		}));

		// When the cursor position changes, hide the color picker
		this.editor.onDidChangeCursorPosition(() => {
			this.hide();
		});
		this._disposables.add(focusTracker.onDidBlur(_ => {
			this.hide();
		}));
		this._disposables.add(focusTracker.onDidFocus(_ => {
			this.focus();
		}));

		// Starting the hover operation
		// TODO: The hover operation should always be immediate since started using the keybindings
		this._standaloneColorPickerComputer.start();
		this._colorHoverVisible = EditorContextKeys.standaloneColorPickerVisible.bindTo(this.contextKeyService);
		this._colorHoverFocused = EditorContextKeys.standaloneColorPickerFocused.bindTo(this.contextKeyService);
	}

	public updateEditor() {

		console.log('inside of update editor of the standalone color picker widget');
		console.log('this._hoverParts.length : ', this._hoverParts.length);

		for (const participant of this._participants) {
			// TODO: What happens when the hover parts length is bigger than zero, then that means that the update is called several times
			if (this._hoverParts.length > 0 && participant instanceof ColorHoverParticipant) {
				participant.updateEditorModel(this._hoverParts as ColorHover[]);
			}
		}
	}

	private _render(messages: IHoverPart[]) {

		console.log('Entered into _renderColorPicker');

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
			const hoverParts = messages.filter(msg => msg.owner === participant);

			// We select only the hover parts which correspond to the color hover participants
			if (hoverParts.length > 0) {

				console.log('hoverParts : ', hoverParts);

				// Setting the hover parts, these are saved only, not directly used
				this._hoverParts = hoverParts;
				// Calling the hover parts of the participant
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
		public readonly value: ColorHover[]
	) { }
}

export interface IStandaloneColorPickerComputer {
	start(): Promise<void>;
}

export class StandaloneColorPickerComputer extends Disposable implements IStandaloneColorPickerComputer {

	private readonly _onResult = this._register(new Emitter<StandaloneColorPickerResult>());
	public readonly onResult = this._onResult.event;

	constructor(
		private readonly _range: IRange,
		private readonly _editor: ICodeEditor,
		private readonly _participants: readonly IEditorHoverParticipant[],
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService
	) {
		super();
	}

	public async start(): Promise<void> {
		if (this._range !== null) {
			const result = await this.computeAsync(this._range);
			this._onResult.fire(new StandaloneColorPickerResult(result.slice(0)));
		}
	}

	private async computeAsync(range: IRange): Promise<ColorHover[]> {

		console.log('computeSync of ColorHoverComputer');

		if (!this._editor.hasModel()) {
			return [];
		}

		let result: ColorHover[] = [];

		for (const participant of this._participants) {
			const colorInfo: IColorInformation = {
				range: range,
				color: { red: 0, green: 0, blue: 0, alpha: 1 }
			};
			const textModel = this._editor.getModel();
			const registry = this.languageFeaturesService.colorProvider;
			const providers = registry.ordered(textModel).reverse();

			console.log('providers : ', providers);

			// TODO: When there are no providers, we still want to render a color picker
			if (providers.length === 0) {
				return [];
			}

			// Otherwise choose the first provider
			const provider = providers[0];

			console.log('provider : ', provider);

			if (participant instanceof ColorHoverParticipant) {

				console.log('entered into the case when participant is ColorHoverParticipant');

				// TODO: do we need to set the provider for each participant, what does it do?
				// TODO: What is the difference between the participants and the document color providers?

				const colorHover = await participant.createColorHover(colorInfo, provider);
				if (colorHover) {
					result = result.concat(colorHover);
				}
			}
		}

		console.log('result from computeAsync : ', result);
		return result;
	}

	public override dispose(): void {
		super.dispose();
	}
}
