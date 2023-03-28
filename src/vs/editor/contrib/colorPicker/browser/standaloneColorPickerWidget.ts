/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { HoverAnchor, HoverParticipantRegistry, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { PositionAffinity } from 'vs/editor/common/model';
import { IPosition } from 'vs/editor/common/core/position';
import { ColorHoverParticipant } from 'vs/editor/contrib/colorPicker/browser/colorHoverParticipant';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorHoverStatusBar } from 'vs/editor/contrib/hover/browser/contentHover';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ColorPickerBody, ColorPickerWidget } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';
import { AsyncIterableObject, CancelableAsyncIterableObject, createCancelableAsyncIterable, RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { coalesce } from 'vs/base/common/arrays';
import { IColorInformation } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import 'vs/css!./colorPicker';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';

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
		this._colorHoverVisible = EditorContextKeys.colorHoverVisible.bindTo(this._contextKeyService);
		this._colorHoverFocused = EditorContextKeys.colorHoverFocused.bindTo(this._contextKeyService);
	}

	public showOrFocus() {

		// Suppose tha the color hover is not visible, then make it visible
		if (!this._colorHoverVisible.get()) {
			const position = this._editor._getViewModel()?.getPrimaryCursorState().viewState.position;
			// const selection = this._editor._getViewModel()?.getPrimaryCursorState().viewState.selection;
			const selection = this._editor.getSelection();
			console.log('position : ', position);
			console.log('selection ; ', selection);
			if (position && selection) {
				this._standaloneColorPickerWidget = new StandaloneColorPickerWidget(position, selection, this._editor, this._instantiationService, this._keybindingService, this._languageFeatureService);
				this._editor.addContentWidget(this._standaloneColorPickerWidget);
			}
			this._colorHoverVisible.set(true);
		} else if (!this._colorHoverFocused.get()) {
			this._standaloneColorPickerWidget?.focus();
			this._colorHoverFocused.set(true);
		}
	}

	public hide() {
		this._standaloneColorPickerWidget?.hide();
		this._colorHoverFocused.set(false);
		this._colorHoverVisible.set(false);
	}

	public static get(editor: ICodeEditor) {
		return editor.getContribution<StandaloneColorPickerController>(StandaloneColorPickerController.ID);
	}
}

registerEditorContribution(StandaloneColorPickerController.ID, StandaloneColorPickerController, EditorContributionInstantiation.AfterFirstRender);

export class StandaloneColorPickerWidget implements IContentWidget {

	static readonly ID = 'editor.contrib.standaloneColorPickerWidget';
	private readonly _participants: IEditorHoverParticipant[];
	private readonly _computer: ColorHoverComputer;
	private readonly _hoverOperation: IColorHoverOperation<IHoverPart>;
	private _disposables: DisposableStore = new DisposableStore();
	private body: HTMLElement = document.createElement('div');
	private _resultFound: boolean = false;

	constructor(
		private position: IPosition,
		private selection: Selection,
		private readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
	) {
		// const node = document.createElement('div');
		// const rgba = new RGBA(0, 0, 0, 0);
		// const color = new Color(rgba);
		// const colorModel = new ColorPickerModel(color, [{ label: 'rgba' }], 0.5);
		// const colorPickerWidget = new ColorPickerWidget(node, colorModel, this.editor.getOption(EditorOption.pixelRatio), this.themeService);
		// colorPickerWidget.layout();
		// this.body = node;
		// this.body.style.position = 'fixed';
		// this.body.style.zIndex = '40';
		// this.body.style.background = 'red';
		// this.body.style.height = 200 + 'px';
		// this.body.style.width = 500 + 'px';
		// console.log('this.body : ', this.body);

		// Keeping only the color hover participants
		this._participants = [];
		for (const participant of HoverParticipantRegistry.getAll()) {
			console.log('participant : ', participant);
			if (participant === ColorHoverParticipant) {
				console.log('entered into the case when the participant is pushed');
				this._participants.push(this.instantiationService.createInstance(participant, this.editor));
			}
		}
		console.log('this._participants : ', this._participants);
		this._computer = new ColorHoverComputer(this.editor, this._participants, this.languageFeaturesService);
		this._hoverOperation = this._disposables.add(new IColorHoverOperation(this.editor, this._computer));

		this._disposables.add(this._hoverOperation.onResult((result) => {
			console.log('inside of on result of the hover operation');
			// if (!this._computer.anchor) {
			// 	// invalid state, ignore result
			// 	return;
			// }
			console.log('result.value : ', result.value);
			if (!this._resultFound && result.value.length !== 0) {
				this._renderColorPicker(result.value);
			}
		}));

		this.editor.onDidChangeCursorPosition((e) => {
			this.position = e.position;
			this.editor.layoutContentWidget(this);
			for (const participant of this._participants) {
				if (participant instanceof ColorHoverParticipant) {
					participant.range = Range.fromPositions(e.position, e.position);
				}
			}
		});
		this.editor.onDidChangeCursorSelection((e) => {
			this._hoverOperation.range = e.selection;
			for (const participant of this._participants) {
				if (participant instanceof ColorHoverParticipant) {
					participant.range = e.selection;
				}
			}
		});

		this._hoverOperation.range = this.selection;
		this._hoverOperation.start(HoverStartMode.Immediate);
	}

	private _renderColorPicker(messages: IHoverPart[]) {
		this._resultFound = true;
		console.log('Entered into _renderColorPicker');
		const fragment = document.createDocumentFragment();
		let colorPicker: ColorPickerWidget | null = null;
		const statusBar = this._disposables.add(new EditorHoverStatusBar(this.keybindingService));

		const context: IEditorHoverRenderContext = {
			fragment,
			statusBar,
			setColorPicker: (widget) => colorPicker = widget,
			onContentsChanged: () => { },
			hide: () => this.hide()
		};

		for (const participant of this._participants) {
			const hoverParts = messages.filter(msg => msg.owner === participant);
			if (hoverParts.length > 0) {
				console.log('hoverParts : ', hoverParts);
				this._disposables.add(participant.renderHoverParts(context, hoverParts));
				// Early break in order not to render twice
			}
		}

		this.editor.layoutContentWidget(this);
		this.editor.render();

		console.log('colorPicker : ', colorPicker);
		if (colorPicker) {
			console.log('after first render');
			const clientHeight = colorPicker.body.domNode.clientHeight;
			const clientWidth = colorPicker.body.domNode.clientWidth;
			console.log('clientHeight : ', clientHeight);
			console.log('clientWidth : ', clientWidth);
		}

		const colorPickerBody = colorPicker?.body as ColorPickerBody;
		colorPickerBody.domNode.style.background = 'red';
		const saturationBox = colorPickerBody.saturationBox;
		const hueStrip = colorPickerBody.hueStrip;
		const opacityStrip = colorPickerBody.opacityStrip;

		saturationBox.domNode.style.width = 500 + 'px';
		saturationBox.domNode.style.height = 200 + 'px';
		saturationBox.canvas.style.width = 500 + 'px';
		saturationBox.canvas.style.height = 200 + 'px';
		hueStrip.domNode.style.height = 200 + 'px';
		opacityStrip.domNode.style.height = 200 + 'px';
		this.body.appendChild(fragment);
		colorPicker?.layout();
		this.editor.layoutContentWidget(this);
		this.editor.render();

		if (colorPicker) {
			console.log('after final render');
			const clientHeight = colorPicker.body.domNode.clientHeight;
			const clientWidth = colorPicker.body.domNode.clientWidth;
			console.log('clientHeight : ', clientHeight);
			console.log('clientWidth : ', clientWidth);
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
		return {
			position: this.position,
			secondaryPosition: this.position,
			preference: ([ContentWidgetPositionPreference.ABOVE]),
			positionAffinity: PositionAffinity.None
		};
	}

	public hide(): void {
		this.editor.removeContentWidget(this);
		this._resultFound = false;
		this._disposables.dispose();
	}

	public focus(): void {
		this.body.focus();
	}
}

export interface IColorHoverComputer<T> {
	/**
	 * This is called after half the hover time
	 */
	computeAsync?: (token: CancellationToken, range: IRange) => AsyncIterableObject<T>;
	/**
	 * This is called after all the hover time
	 */
	computeSync?: (range: IRange) => T[];
}

export class ColorHoverComputer implements IColorHoverComputer<IHoverPart> {

	private _anchor: HoverAnchor | null = null;
	public get anchor(): HoverAnchor | null { return this._anchor; }
	public set anchor(value: HoverAnchor | null) { this._anchor = value; }

	private _shouldFocus: boolean = false;
	public get shouldFocus(): boolean { return this._shouldFocus; }
	public set shouldFocus(value: boolean) { this._shouldFocus = value; }

	private _source: HoverStartSource = HoverStartSource.Mouse;
	public get source(): HoverStartSource { return this._source; }
	public set source(value: HoverStartSource) { this._source = value; }

	private _insistOnKeepingHoverVisible: boolean = false;
	public get insistOnKeepingHoverVisible(): boolean { return this._insistOnKeepingHoverVisible; }
	public set insistOnKeepingHoverVisible(value: boolean) { this._insistOnKeepingHoverVisible = value; }

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _participants: readonly IEditorHoverParticipant[],
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService
	) {
	}

	public computeAsync(token: CancellationToken, range: IRange): AsyncIterableObject<IHoverPart> {
		console.log('computeAsync of ColorHoverComputer');
		const anchor = this._anchor;
		console.log('anchor : ', anchor);

		if (!this._editor.hasModel()) {
			return AsyncIterableObject.EMPTY;
		}
		const iterable: AsyncIterable<IHoverPart>[] = [];
		console.log('this._participants : ', this._participants);
		this._participants.map((participant) => {
			const colorInfo: IColorInformation = {
				range: range,
				color: { red: 0, green: 0, blue: 0, alpha: 0 }
			};
			const textModel = this._editor.getModel()!;
			const registry = this.languageFeaturesService.colorProvider;
			const providers = registry.ordered(textModel).reverse();
			const provider = providers[0];
			if (participant instanceof ColorHoverParticipant) {
				const colorHover = participant.createColorHover(colorInfo, provider);
				console.log('colorHover ; ', colorHover);
				const colorHoverIterable = AsyncIterableObject.fromPromise(colorHover);
				iterable.push(colorHoverIterable);
			}
		});
		return AsyncIterableObject.merge(iterable);
	}

	public computeSync(range: IRange): IHoverPart[] {
		console.log('computeSync of ColorHoverComputer');
		if (!this._editor.hasModel() || !this._anchor) {
			return [];
		}

		let result: IHoverPart[] = [];
		for (const participant of this._participants) {
			const colorInfo: IColorInformation = {
				range: range,
				color: { red: 0, green: 0, blue: 0, alpha: 0 }
			};
			const textModel = this._editor.getModel();
			const registry = this.languageFeaturesService.colorProvider;
			const providers = registry.ordered(textModel).reverse();
			const provider = providers[0];
			if (participant instanceof ColorHoverParticipant) {
				participant.createColorHover(colorInfo, provider).then((colorHover) => {
					result = result.concat(colorHover);
				});
			}
		}

		return coalesce(result);
	}
}

const enum HoverOperationState {
	Idle,
	FirstWait,
	SecondWait,
	WaitingForAsync = 3,
	WaitingForAsyncShowingLoading = 4,
}

export const enum HoverStartMode {
	Delayed = 0,
	Immediate = 1
}

export const enum HoverStartSource {
	Mouse = 0,
	Keyboard = 1
}

export class HoverResult<T> {
	constructor(
		public readonly value: T[],
		public readonly isComplete: boolean,
		public readonly hasLoadingMessage: boolean,
	) { }
}

export class IColorHoverOperation<T> extends Disposable {

	private readonly _onResult = this._register(new Emitter<HoverResult<T>>());
	public readonly onResult = this._onResult.event;

	private readonly _firstWaitScheduler = this._register(new RunOnceScheduler(() => this._triggerAsyncComputation(), 0));
	private readonly _secondWaitScheduler = this._register(new RunOnceScheduler(() => this._triggerSyncComputation(), 0));
	private readonly _loadingMessageScheduler = this._register(new RunOnceScheduler(() => this._triggerLoadingMessage(), 0));

	private _state = HoverOperationState.Idle;
	private _asyncIterable: CancelableAsyncIterableObject<T> | null = null;
	private _asyncIterableDone: boolean = false;
	private _result: T[] = [];
	private _range: IRange | null = null;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _computer: IColorHoverComputer<T>
	) {
		super();
	}

	public set range(range: IRange) {
		this._range = range;
	}

	public override dispose(): void {
		if (this._asyncIterable) {
			this._asyncIterable.cancel();
			this._asyncIterable = null;
		}
		super.dispose();
	}

	private get _hoverTime(): number {
		return this._editor.getOption(EditorOption.hover).delay;
	}

	private get _firstWaitTime(): number {
		return this._hoverTime / 2;
	}

	private get _secondWaitTime(): number {
		return this._hoverTime - this._firstWaitTime;
	}

	private get _loadingMessageTime(): number {
		return 3 * this._hoverTime;
	}

	private _setState(state: HoverOperationState, fireResult: boolean = true): void {
		console.log('inside of _setState');
		this._state = state;
		if (fireResult) {
			this._fireResult();
		}
	}

	private _triggerAsyncComputation(): void {
		console.log('inside of _triggerAsyncComputation');
		this._setState(HoverOperationState.SecondWait);
		this._secondWaitScheduler.schedule(this._secondWaitTime);
		console.log('this._range : ', this._range);
		if (this._computer.computeAsync && this._range !== null) {
			this._asyncIterableDone = false;
			this._asyncIterable = createCancelableAsyncIterable(token => this._computer.computeAsync!(token, this._range!));
			console.log('this._asyncIterable : ', this._asyncIterable);
			(async () => {
				try {
					for await (const item of this._asyncIterable!) {
						if (item) {
							this._result.push(item);
							this._fireResult();
						}
					}
					this._asyncIterableDone = true;

					if (this._state === HoverOperationState.WaitingForAsync || this._state === HoverOperationState.WaitingForAsyncShowingLoading) {
						this._setState(HoverOperationState.Idle);
					}

				} catch (e) {
					onUnexpectedError(e);
				}
			})();

		} else {
			this._asyncIterableDone = true;
		}
	}

	private _triggerSyncComputation(): void {
		console.log('inside of _triggerSyncComputation');
		console.log('this._range : ', this._range);
		if (this._computer.computeSync && this._range) {
			this._result = this._result.concat(this._computer.computeSync(this._range));
		}
		this._setState(this._asyncIterableDone ? HoverOperationState.Idle : HoverOperationState.WaitingForAsync);
	}

	private _triggerLoadingMessage(): void {
		if (this._state === HoverOperationState.WaitingForAsync) {
			this._setState(HoverOperationState.WaitingForAsyncShowingLoading);
		}
	}

	private _fireResult(): void {
		console.log('inside of _fireResult');
		if (this._state === HoverOperationState.FirstWait || this._state === HoverOperationState.SecondWait) {
			// Do not send out results before the hover time
			return;
		}
		const isComplete = (this._state === HoverOperationState.Idle);
		const hasLoadingMessage = (this._state === HoverOperationState.WaitingForAsyncShowingLoading);
		this._onResult.fire(new HoverResult(this._result.slice(0), isComplete, hasLoadingMessage));
	}

	public start(mode: HoverStartMode): void {
		if (mode === HoverStartMode.Delayed) {
			if (this._state === HoverOperationState.Idle) {
				this._setState(HoverOperationState.FirstWait);
				this._firstWaitScheduler.schedule(this._firstWaitTime);
				this._loadingMessageScheduler.schedule(this._loadingMessageTime);
			}
		} else {
			switch (this._state) {
				case HoverOperationState.Idle:
					this._triggerAsyncComputation();
					this._secondWaitScheduler.cancel();
					this._triggerSyncComputation();
					break;
				case HoverOperationState.SecondWait:
					this._secondWaitScheduler.cancel();
					this._triggerSyncComputation();
					break;
			}
		}
	}

	public cancel(): void {
		this._firstWaitScheduler.cancel();
		this._secondWaitScheduler.cancel();
		this._loadingMessageScheduler.cancel();
		if (this._asyncIterable) {
			this._asyncIterable.cancel();
			this._asyncIterable = null;
		}
		this._result = [];
		this._setState(HoverOperationState.Idle, false);
	}

}
