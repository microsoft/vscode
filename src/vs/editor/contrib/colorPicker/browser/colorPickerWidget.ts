/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PixelRatio } from '../../../../base/browser/pixelRatio.js';
import * as dom from '../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../base/browser/globalPointerMoveMonitor.js';
import { Widget } from '../../../../base/browser/ui/widget.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Color, HSVA, RGBA } from '../../../../base/common/color.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import './colorPicker.css';
import { ColorPickerModel } from './colorPickerModel.js';
import { IEditorHoverColorPickerWidget, IEditorHoverRenderContext } from '../../hover/browser/hoverTypes.js';
import { localize } from '../../../../nls.js';
import { editorHoverBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../browser/editorBrowser.js';
import { ColorHover, IColorHover } from './colorHoverParticipant.js';
import { ISingleEditOperation } from '../../../common/core/editOperation.js';
import { ITextModel, TrackedRangeStickiness } from '../../../common/model.js';
import { getColorPresentations } from './color.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';

const $ = dom.$;

enum ColorPickerType {
	Hover,
	Standalone
}

export class ColorPickerHeader extends Disposable {

	private readonly _domNode: HTMLElement;
	private readonly _pickedColorNode: HTMLElement;
	private readonly _pickedColorPresentation: HTMLElement;
	private readonly _originalColorNode: HTMLElement;
	private backgroundColor: Color;

	constructor(container: HTMLElement, private readonly model: ColorPickerModel, themeService: IThemeService) {
		super();

		this._domNode = $('.colorpicker-header');
		dom.append(container, this._domNode);

		this._pickedColorNode = dom.append(this._domNode, $('.picked-color'));
		dom.append(this._pickedColorNode, $('span.codicon.codicon-color-mode'));
		this._pickedColorPresentation = dom.append(this._pickedColorNode, document.createElement('span'));
		this._pickedColorPresentation.classList.add('picked-color-presentation');

		const tooltip = localize('clickToToggleColorOptions', "Click to toggle color options (rgb/hsl/hex)");
		this._pickedColorNode.setAttribute('title', tooltip);

		this._originalColorNode = dom.append(this._domNode, $('.original-color'));
		this._originalColorNode.style.backgroundColor = Color.Format.CSS.format(this.model.originalColor) || '';

		this.backgroundColor = themeService.getColorTheme().getColor(editorHoverBackground) || Color.white;
		this._register(themeService.onDidColorThemeChange(theme => {
			this.backgroundColor = theme.getColor(editorHoverBackground) || Color.white;
		}));

		this._register(dom.addDisposableListener(this._pickedColorNode, dom.EventType.CLICK, () => this.model.selectNextColorPresentation()));
		this._register(dom.addDisposableListener(this._originalColorNode, dom.EventType.CLICK, () => {
			this.model.color = this.model.originalColor;
			this.model.flushColor();
		}));
		this._register(model.onDidChangeColor(this.onDidChangeColor, this));
		this._register(model.onDidChangePresentation(this.onDidChangePresentation, this));
		this._pickedColorNode.style.backgroundColor = Color.Format.CSS.format(model.color) || '';
		this._pickedColorNode.classList.toggle('light', model.color.rgba.a < 0.5 ? this.backgroundColor.isLighter() : model.color.isLighter());

		this.onDidChangeColor(this.model.color);
	}

	public get domNode(): HTMLElement {
		return this._domNode;
	}

	public get pickedColorNode(): HTMLElement {
		return this._pickedColorNode;
	}

	public get originalColorNode(): HTMLElement {
		return this._originalColorNode;
	}

	private onDidChangeColor(color: Color): void {
		this._pickedColorNode.style.backgroundColor = Color.Format.CSS.format(color) || '';
		this._pickedColorNode.classList.toggle('light', color.rgba.a < 0.5 ? this.backgroundColor.isLighter() : color.isLighter());
		this.onDidChangePresentation();
	}

	private onDidChangePresentation(): void {
		this._pickedColorPresentation.textContent = this.model.presentation ? this.model.presentation.label : '';
	}
}

class StandaloneColorPickerHeader extends ColorPickerHeader {

	private readonly _closeButton: CloseButton;

	constructor(container: HTMLElement, model: ColorPickerModel, themeService: IThemeService) {
		super(container, model, themeService);
		this.domNode.classList.add('standalone-colorpicker');
		this._closeButton = this._register(new CloseButton(this.domNode));
	}

	public get closeButton(): CloseButton {
		return this._closeButton;
	}
}

class CloseButton extends Disposable {

	private _button: HTMLElement;
	private readonly _onClicked = this._register(new Emitter<void>());
	public readonly onClicked = this._onClicked.event;

	constructor(container: HTMLElement) {
		super();
		this._button = document.createElement('div');
		this._button.classList.add('close-button');
		dom.append(container, this._button);

		const innerDiv = document.createElement('div');
		innerDiv.classList.add('close-button-inner-div');
		dom.append(this._button, innerDiv);

		const closeButton = dom.append(innerDiv, $('.button' + ThemeIcon.asCSSSelector(registerIcon('color-picker-close', Codicon.close, localize('closeIcon', 'Icon to close the color picker')))));
		closeButton.classList.add('close-icon');
		this._register(dom.addDisposableListener(this._button, dom.EventType.CLICK, () => {
			this._onClicked.fire();
		}));
	}
}

export abstract class AbstractColorPickerBody extends Disposable {

	protected readonly _domNode: HTMLElement;
	protected abstract readonly _saturationBox: SaturationBox;
	protected abstract readonly _hueStrip: Strip;
	protected abstract readonly _opacityStrip: Strip;

	constructor(container: HTMLElement, protected readonly model: ColorPickerModel) {
		super();

		this._domNode = $('.colorpicker-body');
		dom.append(container, this._domNode);
	}

	protected flushColor(): void {
		this.model.flushColor();
	}

	protected onDidSaturationValueChange({ s, v }: { s: number; v: number }): void {
		const hsva = this.model.color.hsva;
		this.model.color = new Color(new HSVA(hsva.h, s, v, hsva.a));
	}

	protected onDidOpacityChange(a: number): void {
		const hsva = this.model.color.hsva;
		this.model.color = new Color(new HSVA(hsva.h, hsva.s, hsva.v, a));
	}

	protected onDidHueChange(value: number): void {
		const hsva = this.model.color.hsva;
		const h = (1 - value) * 360;

		this.model.color = new Color(new HSVA(h === 360 ? 0 : h, hsva.s, hsva.v, hsva.a));
	}

	get domNode() {
		return this._domNode;
	}

	get saturationBox() {
		return this._saturationBox;
	}

	get opacityStrip() {
		return this._opacityStrip;
	}

	get hueStrip() {
		return this._hueStrip;
	}

	layout(): void {
		this._saturationBox.layout();
		this._opacityStrip.layout();
		this._hueStrip.layout();
	}
}

class HoverColorPickerBody extends AbstractColorPickerBody {

	protected _saturationBox = new SaturationBox(this._domNode, this.model, this.pixelRatio);
	protected _opacityStrip = new OpacityStrip(this._domNode, this.model, ColorPickerType.Hover);
	protected _hueStrip = new HueStrip(this._domNode, this.model, ColorPickerType.Hover);

	constructor(container: HTMLElement, model: ColorPickerModel, private pixelRatio: number) {
		super(container, model);

		this._register(this._saturationBox);
		this._register(this._saturationBox.onDidChange(this.onDidSaturationValueChange, this));
		this._register(this._saturationBox.onColorFlushed(this.flushColor, this));

		this._register(this._opacityStrip);
		this._register(this._opacityStrip.onDidChange(this.onDidOpacityChange, this));
		this._register(this._opacityStrip.onColorFlushed(this.flushColor, this));

		this._register(this._hueStrip);
		this._register(this._hueStrip.onDidChange(this.onDidHueChange, this));
		this._register(this._hueStrip.onColorFlushed(this.flushColor, this));
	}
}

class StandaloneColorPickerBody extends AbstractColorPickerBody {

	protected _saturationBox = new SaturationBox(this._domNode, this.model, this.pixelRatio);
	protected _opacityStrip = new OpacityStrip(this._domNode, this.model, ColorPickerType.Standalone);
	protected _hueStrip = new HueStrip(this._domNode, this.model, ColorPickerType.Standalone);

	private _insertButton = this._register(new InsertButton(this._domNode, this.foundInEditor));

	constructor(container: HTMLElement, model: ColorPickerModel, private foundInEditor: boolean, private pixelRatio: number) {
		super(container, model);

		this._register(this._saturationBox);
		this._register(this._saturationBox.onDidChange(this.onDidSaturationValueChange, this));
		this._register(this._saturationBox.onColorFlushed(this.flushColor, this));

		this._register(this._opacityStrip);
		this._register(this._opacityStrip.onDidChange(this.onDidOpacityChange, this));
		this._register(this._opacityStrip.onColorFlushed(this.flushColor, this));

		this._register(this._hueStrip);
		this._register(this._hueStrip.onDidChange(this.onDidHueChange, this));
		this._register(this._hueStrip.onColorFlushed(this.flushColor, this));

		this._domNode.classList.add('standalone-colorpicker');
	}

	public get insertButton(): InsertButton {
		return this._insertButton;
	}
}

class SaturationBox extends Disposable {

	private readonly _domNode: HTMLElement;
	private readonly selection: HTMLElement;
	private readonly _canvas: HTMLCanvasElement;
	private width!: number;
	private height!: number;

	private monitor: GlobalPointerMoveMonitor | null;
	private readonly _onDidChange = new Emitter<{ s: number; v: number }>();
	readonly onDidChange: Event<{ s: number; v: number }> = this._onDidChange.event;

	private readonly _onColorFlushed = new Emitter<void>();
	readonly onColorFlushed: Event<void> = this._onColorFlushed.event;

	constructor(container: HTMLElement, private readonly model: ColorPickerModel, private pixelRatio: number) {
		super();

		this._domNode = $('.saturation-wrap');
		dom.append(container, this._domNode);

		// Create canvas, draw selected color
		this._canvas = document.createElement('canvas');
		this._canvas.className = 'saturation-box';
		dom.append(this._domNode, this._canvas);

		// Add selection circle
		this.selection = $('.saturation-selection');
		dom.append(this._domNode, this.selection);

		this.layout();

		this._register(dom.addDisposableListener(this._domNode, dom.EventType.POINTER_DOWN, e => this.onPointerDown(e)));
		this._register(this.model.onDidChangeColor(this.onDidChangeColor, this));
		this.monitor = null;
	}

	public get domNode() {
		return this._domNode;
	}

	public get canvas() {
		return this._canvas;
	}

	private onPointerDown(e: PointerEvent): void {
		if (!e.target || !(e.target instanceof Element)) {
			return;
		}
		this.monitor = this._register(new GlobalPointerMoveMonitor());
		const origin = dom.getDomNodePagePosition(this._domNode);

		if (e.target !== this.selection) {
			this.onDidChangePosition(e.offsetX, e.offsetY);
		}

		this.monitor.startMonitoring(e.target, e.pointerId, e.buttons, event => this.onDidChangePosition(event.pageX - origin.left, event.pageY - origin.top), () => null);

		const pointerUpListener = dom.addDisposableListener(e.target.ownerDocument, dom.EventType.POINTER_UP, () => {
			this._onColorFlushed.fire();
			pointerUpListener.dispose();
			if (this.monitor) {
				this.monitor.stopMonitoring(true);
				this.monitor = null;
			}
		}, true);
	}

	private onDidChangePosition(left: number, top: number): void {
		const s = Math.max(0, Math.min(1, left / this.width));
		const v = Math.max(0, Math.min(1, 1 - (top / this.height)));

		this.paintSelection(s, v);
		this._onDidChange.fire({ s, v });
	}

	layout(): void {
		this.width = this._domNode.offsetWidth;
		this.height = this._domNode.offsetHeight;
		this._canvas.width = this.width * this.pixelRatio;
		this._canvas.height = this.height * this.pixelRatio;
		this.paint();

		const hsva = this.model.color.hsva;
		this.paintSelection(hsva.s, hsva.v);
	}

	private paint(): void {
		const hsva = this.model.color.hsva;
		const saturatedColor = new Color(new HSVA(hsva.h, 1, 1, 1));
		const ctx = this._canvas.getContext('2d')!;

		const whiteGradient = ctx.createLinearGradient(0, 0, this._canvas.width, 0);
		whiteGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
		whiteGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
		whiteGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

		const blackGradient = ctx.createLinearGradient(0, 0, 0, this._canvas.height);
		blackGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
		blackGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');

		ctx.rect(0, 0, this._canvas.width, this._canvas.height);
		ctx.fillStyle = Color.Format.CSS.format(saturatedColor)!;
		ctx.fill();
		ctx.fillStyle = whiteGradient;
		ctx.fill();
		ctx.fillStyle = blackGradient;
		ctx.fill();
	}

	private paintSelection(s: number, v: number): void {
		this.selection.style.left = `${s * this.width}px`;
		this.selection.style.top = `${this.height - v * this.height}px`;
	}

	private onDidChangeColor(color: Color): void {
		if (this.monitor && this.monitor.isMonitoring()) {
			return;
		}
		this.paint();
		const hsva = color.hsva;
		this.paintSelection(hsva.s, hsva.v);
	}
}

abstract class Strip extends Disposable {

	protected domNode: HTMLElement;
	protected overlay: HTMLElement;
	protected slider: HTMLElement;
	private height!: number;

	private readonly _onDidChange = new Emitter<number>();
	readonly onDidChange: Event<number> = this._onDidChange.event;

	private readonly _onColorFlushed = new Emitter<void>();
	readonly onColorFlushed: Event<void> = this._onColorFlushed.event;

	constructor(container: HTMLElement, protected model: ColorPickerModel, type: ColorPickerType) {
		super();
		switch (type) {
			case (ColorPickerType.Standalone): {
				this.domNode = dom.append(container, $('.standalone-strip'));
				this.overlay = dom.append(this.domNode, $('.standalone-overlay'));
				break;
			}
			case (ColorPickerType.Hover): {
				this.domNode = dom.append(container, $('.strip'));
				this.overlay = dom.append(this.domNode, $('.overlay'));
				break;
			}
		}
		this.slider = dom.append(this.domNode, $('.slider'));
		this.slider.style.top = `0px`;

		this._register(dom.addDisposableListener(this.domNode, dom.EventType.POINTER_DOWN, e => this.onPointerDown(e)));
		this._register(model.onDidChangeColor(this.onDidChangeColor, this));
		this.layout();
	}

	layout(): void {
		this.height = this.domNode.offsetHeight - this.slider.offsetHeight;

		const value = this.getValue(this.model.color);
		this.updateSliderPosition(value);
	}

	protected onDidChangeColor(color: Color) {
		const value = this.getValue(color);
		this.updateSliderPosition(value);
	}

	private onPointerDown(e: PointerEvent): void {
		if (!e.target || !(e.target instanceof Element)) {
			return;
		}
		const monitor = this._register(new GlobalPointerMoveMonitor());
		const origin = dom.getDomNodePagePosition(this.domNode);
		this.domNode.classList.add('grabbing');

		if (e.target !== this.slider) {
			this.onDidChangeTop(e.offsetY);
		}

		monitor.startMonitoring(e.target, e.pointerId, e.buttons, event => this.onDidChangeTop(event.pageY - origin.top), () => null);

		const pointerUpListener = dom.addDisposableListener(e.target.ownerDocument, dom.EventType.POINTER_UP, () => {
			this._onColorFlushed.fire();
			pointerUpListener.dispose();
			monitor.stopMonitoring(true);
			this.domNode.classList.remove('grabbing');
		}, true);
	}

	private onDidChangeTop(top: number): void {
		const value = Math.max(0, Math.min(1, 1 - (top / this.height)));

		this.updateSliderPosition(value);
		this._onDidChange.fire(value);
	}

	private updateSliderPosition(value: number): void {
		this.slider.style.top = `${(1 - value) * this.height}px`;
	}

	protected abstract getValue(color: Color): number;
}

class OpacityStrip extends Strip {

	constructor(container: HTMLElement, model: ColorPickerModel, type: ColorPickerType) {
		super(container, model, type);
		this.domNode.classList.add('opacity-strip');

		this.onDidChangeColor(this.model.color);
	}

	protected override onDidChangeColor(color: Color): void {
		super.onDidChangeColor(color);
		const { r, g, b } = color.rgba;
		const opaque = new Color(new RGBA(r, g, b, 1));
		const transparent = new Color(new RGBA(r, g, b, 0));

		this.overlay.style.background = `linear-gradient(to bottom, ${opaque} 0%, ${transparent} 100%)`;
	}

	protected getValue(color: Color): number {
		return color.hsva.a;
	}
}

class HueStrip extends Strip {

	constructor(container: HTMLElement, model: ColorPickerModel, type: ColorPickerType) {
		super(container, model, type);
		this.domNode.classList.add('hue-strip');
	}

	protected getValue(color: Color): number {
		return 1 - (color.hsva.h / 360);
	}
}

export class InsertButton extends Disposable {

	private _button: HTMLElement;
	private readonly _onClicked = this._register(new Emitter<void>());
	public readonly onClicked = this._onClicked.event;

	constructor(container: HTMLElement, foundInEditor: boolean) {
		super();
		this._button = dom.append(container, document.createElement('button'));
		this._button.classList.add('insert-button');
		this._button.textContent = foundInEditor ? 'Replace' : 'Insert';
		this._register(dom.addDisposableListener(this._button, dom.EventType.CLICK, () => {
			this._onClicked.fire();
		}));
	}

	public get button(): HTMLElement {
		return this._button;
	}
}

class HoverColorPickerWidget extends Widget implements IEditorHoverColorPickerWidget {

	private static readonly ID = 'editor.contrib.hoverColorPickerWidget';

	public readonly domNode: HTMLElement;

	body: HoverColorPickerBody;

	constructor(container: Node, readonly model: ColorPickerModel, private pixelRatio: number, themeService: IThemeService) {
		super();

		this.domNode = $('.colorpicker-widget');
		container.appendChild(this.domNode);

		this.body = this._register(new HoverColorPickerBody(this.domNode, this.model, this.pixelRatio));
		this._register(PixelRatio.getInstance(dom.getWindow(container)).onDidChange(() => this.layout()));
		this._register(new ColorPickerHeader(this.domNode, this.model, themeService));
	}

	getId(): string {
		return HoverColorPickerWidget.ID;
	}

	layout(): void {
		this.body.layout();
	}
}

export class StandaloneColorPickerWidget extends Widget implements IEditorHoverColorPickerWidget {

	private static readonly ID = 'editor.contrib.standaloneColorPickerWidget';
	private static CLOSE_BUTTON_WIDTH = 22;
	private static PADDING = 8;

	private readonly _onInsert = new Emitter<void>();
	readonly onInsert: Event<void> = this._onInsert.event;

	private readonly _onClose = new Emitter<void>();
	readonly onClose: Event<void> = this._onClose.event;

	private readonly _domNode: HTMLElement;

	body: StandaloneColorPickerBody;

	constructor(container: Node, readonly model: ColorPickerModel, private pixelRatio: number, themeService: IThemeService, foundInEditor: boolean) {
		super();

		this._register(PixelRatio.getInstance(dom.getWindow(container)).onDidChange(() => this.layout()));

		this._domNode = $('.colorpicker-widget');
		container.appendChild(this._domNode);

		const header = this._register(new StandaloneColorPickerHeader(this._domNode, this.model, themeService));
		this.body = this._register(new StandaloneColorPickerBody(this._domNode, this.model, foundInEditor, this.pixelRatio));

		const saturationBoxWidth = this.body.saturationBox.domNode.clientWidth;
		const widthOfOriginalColorBox = this.body.domNode.clientWidth - saturationBoxWidth - StandaloneColorPickerWidget.CLOSE_BUTTON_WIDTH - StandaloneColorPickerWidget.PADDING;
		const pickedColorNode = header.pickedColorNode;
		pickedColorNode.style.width = saturationBoxWidth + StandaloneColorPickerWidget.PADDING + 'px';
		const originalColorNode = header.originalColorNode;
		originalColorNode.style.width = widthOfOriginalColorBox + 'px';

		this._register(this.body.insertButton.onClicked(() => {
			this._onInsert.fire();
		}));
		this._register(header.closeButton.onClicked(() => {
			this._onClose.fire();
		}));
	}

	getId(): string {
		return StandaloneColorPickerWidget.ID;
	}

	layout(): void {
		this.body.layout();
	}

	get domNode(): HTMLElement {
		return this._domNode;
	}
}

export abstract class AbstractColorPicker extends Disposable {

	protected _editor: IActiveCodeEditor;
	private _context: IEditorHoverRenderContext;

	constructor(
		editor: IActiveCodeEditor,
		colorHover: IColorHover,
		context: IEditorHoverRenderContext
	) {
		super();
		this._editor = editor;
		this._context = context;
		this._setMinimumDimensionsOfHover(context, editor);
		this._registerListeners(colorHover);
	}

	protected abstract _registerListeners(colorHover: IColorHover): void;

	protected _updateEditorModel(editor: IActiveCodeEditor, range: Range, model: ColorPickerModel): Range {
		const textEdits: ISingleEditOperation[] = [];
		const edit = model.presentation.textEdit ?? { range, text: model.presentation.label, forceMoveMarkers: false };
		textEdits.push(edit);

		if (model.presentation.additionalTextEdits) {
			textEdits.push(...model.presentation.additionalTextEdits);
		}
		const replaceRange = Range.lift(edit.range);
		const trackedRange = editor.getModel()._setTrackedRange(null, replaceRange, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
		editor.executeEdits('colorpicker', textEdits);
		editor.pushUndoStop();
		return editor.getModel()._getTrackedRange(trackedRange) ?? replaceRange;
	}

	protected async _updateColorPresentations(editorModel: ITextModel, colorPickerModel: ColorPickerModel, color: Color, range: Range, colorHover: IColorHover) {
		const colorPresentations = await getColorPresentations(editorModel, {
			range: range,
			color: {
				red: color.rgba.r / 255,
				green: color.rgba.g / 255,
				blue: color.rgba.b / 255,
				alpha: color.rgba.a
			}
		}, colorHover.provider, CancellationToken.None);
		colorPickerModel.colorPresentations = colorPresentations || [];
	}

	protected _hide(): void {
		this._context.hide();
		this._editor.focus();
	}

	private _setMinimumDimensionsOfHover(context: IEditorHoverRenderContext, editor: ICodeEditor): void {
		if (!context.setMinimumDimensions) {
			return;
		}
		const minimumHeight = editor.getOption(EditorOption.lineHeight) + 8;
		context.setMinimumDimensions(new dom.Dimension(302, minimumHeight));
	}
}

export class StandaloneColorPicker extends AbstractColorPicker {

	private _color: Color | undefined;
	private _colorPicker: StandaloneColorPickerWidget;

	constructor(
		editor: IActiveCodeEditor,
		colorHover: IColorHover,
		foundInEditor: boolean,
		context: IEditorHoverRenderContext,
		themeService: IThemeService,
	) {
		super(editor, colorHover, context);
		const model = colorHover.model;
		const pixelRatio = editor.getOption(EditorOption.pixelRatio);
		this._colorPicker = this._register(new StandaloneColorPickerWidget(context.fragment, model, pixelRatio, themeService, foundInEditor));
	}

	public layout(): void {
		this._colorPicker.layout();
	}

	public async updateEditorModel(colorHover: IColorHover): Promise<void> {
		if (!this._editor.hasModel()) {
			return;
		}
		const colorPickerModel = colorHover.model;
		let range = new Range(colorHover.range.startLineNumber, colorHover.range.startColumn, colorHover.range.endLineNumber, colorHover.range.endColumn);
		if (this._color) {
			await this._updateColorPresentations(this._editor.getModel(), colorPickerModel, this._color, range, colorHover);
			range = this._updateEditorModel(this._editor, range, colorPickerModel);
		}
	}

	protected _registerListeners(colorHover: IColorHover): void {
		const colorModel = colorHover.model;
		const color = colorModel.color;
		this._color = color;
		const range = Range.lift(colorHover.range);
		const editorModel = this._editor.getModel();
		this._updateColorPresentations(editorModel, colorModel, color, range, colorHover);
		this._register(colorModel.onColorFlushed((color: Color) => {
			this._color = color;
		}));
		this._register(this._editor.onDidChangeModelContent(() => {
			this._hide();
		}));
		this._register(colorModel.onDidChangeColor((color: Color) => {
			this._updateColorPresentations(editorModel, colorModel, color, range, colorHover);
		}));
	}
}

export class HoverColorPicker extends AbstractColorPicker {

	public color: ColorHover;

	private _colorPicker: HoverColorPickerWidget;

	constructor(
		editor: IActiveCodeEditor,
		colorHover: ColorHover,
		context: IEditorHoverRenderContext,
		themeService: IThemeService,
	) {
		super(editor, colorHover, context);
		const model = colorHover.model;
		const pixelRatio = editor.getOption(EditorOption.pixelRatio);
		this.color = colorHover;
		this._colorPicker = this._register(new HoverColorPickerWidget(context.fragment, model, pixelRatio, themeService));
	}

	public get domNode(): HTMLElement {
		return this._colorPicker.domNode;
	}

	public layout(): void {
		this._colorPicker.layout();
	}

	protected override _registerListeners(colorHover: IColorHover): void {
		const editorModel = this._editor.getModel();
		const colorModel = colorHover.model;
		let range = Range.lift(colorHover.range);
		let editorUpdatedByColorPicker = false;
		this._register(colorModel.onColorFlushed(async (color: Color) => {
			await this._updateColorPresentations(editorModel, colorModel, color, range, colorHover);
			editorUpdatedByColorPicker = true;
			range = this._updateEditorModel(this._editor, range, colorModel);
		}));
		this._register(this._editor.onDidChangeModelContent(() => {
			if (editorUpdatedByColorPicker) {
				editorUpdatedByColorPicker = false;
			} else {
				this._hide();
			}
		}));
		this._register(colorModel.onDidChangeColor((color: Color) => {
			this._updateColorPresentations(editorModel, colorModel, color, range, colorHover);
		}));
	}
}

