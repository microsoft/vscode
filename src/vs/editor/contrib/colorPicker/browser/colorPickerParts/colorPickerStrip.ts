/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import '../colorPicker.css';
import * as dom from '../../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../../base/browser/globalPointerMoveMonitor.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ColorPickerModel } from '../colorPickerModel.js';
import { ColorPickerWidgetType } from '../colorPickerParticipantUtils.js';

const $ = dom.$;

export abstract class Strip extends Disposable {

	public readonly domNode: HTMLElement;
	protected overlay: HTMLElement;
	protected slider: HTMLElement;
	private height!: number;

	private readonly _onDidChange = this._register(new Emitter<number>());
	readonly onDidChange: Event<number> = this._onDidChange.event;

	private readonly _onColorFlushed = this._register(new Emitter<void>());
	readonly onColorFlushed: Event<void> = this._onColorFlushed.event;

	constructor(container: HTMLElement, protected model: ColorPickerModel, type: ColorPickerWidgetType) {
		super();
		if (type === ColorPickerWidgetType.Standalone) {
			this.domNode = dom.append(container, $('.standalone-strip'));
			this.overlay = dom.append(this.domNode, $('.standalone-overlay'));
		} else {
			this.domNode = dom.append(container, $('.strip'));
			this.overlay = dom.append(this.domNode, $('.overlay'));
		}
		this.slider = dom.append(this.domNode, $('.slider'));
		this.slider.style.top = `0px`;

		// Make focusable for keyboard navigation
		this.domNode.tabIndex = 0;

		this._register(dom.addDisposableListener(this.domNode, dom.EventType.POINTER_DOWN, e => this.onPointerDown(e)));
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, e => this.onKeyDown(new StandardKeyboardEvent(e))));
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

	private onKeyDown(e: StandardKeyboardEvent): void {
		const currentValue = this.getValue(this.model.color);
		let newValue = currentValue;
		const step = e.shiftKey ? 0.1 : 0.01;

		switch (e.keyCode) {
			case KeyCode.UpArrow:
			case KeyCode.RightArrow:
				newValue = Math.min(1, currentValue + step);
				break;
			case KeyCode.DownArrow:
			case KeyCode.LeftArrow:
				newValue = Math.max(0, currentValue - step);
				break;
			case KeyCode.Digit0: case KeyCode.Digit1: case KeyCode.Digit2:
			case KeyCode.Digit3: case KeyCode.Digit4: case KeyCode.Digit5:
			case KeyCode.Digit6: case KeyCode.Digit7: case KeyCode.Digit8:
			case KeyCode.Digit9: {
				this._handleDigitInput(e, currentValue);
				return;
			}
			case KeyCode.Enter:
			case KeyCode.Space:
				this._handleEnterOrSpace(e);
				return;
			default:
				return;
		}

		this._applyValueChange(newValue);
		e.preventDefault();
	}

	private _handleDigitInput(e: StandardKeyboardEvent, currentValue: number): void {
		const digit = e.keyCode - KeyCode.Digit0;
		const newValue = digit / 10;
		this._applyValueChange(newValue);
		e.preventDefault();
	}

	private _handleEnterOrSpace(e: StandardKeyboardEvent): void {
		this._onColorFlushed.fire();
		e.preventDefault();
	}

	private _applyValueChange(newValue: number): void {
		this.updateSliderPosition(newValue);
		this._onDidChange.fire(newValue);
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

export class OpacityStrip extends Strip {

	constructor(container: HTMLElement, model: ColorPickerModel, type: ColorPickerWidgetType) {
		super(container, model, type);
		this.domNode.classList.add('opacity-strip');

		// ARIA attributes for opacity slider
		this.domNode.setAttribute('role', 'slider');
		this.domNode.setAttribute('aria-label', 'Opacity');
		this.domNode.setAttribute('aria-valuemin', '0');
		this.domNode.setAttribute('aria-valuemax', '100');

		this.onDidChangeColor(this.model.color);
	}

	protected override onDidChangeColor(color: Color): void {
		super.onDidChangeColor(color);
		const { r, g, b } = color.rgba;
		const opaque = new Color(new RGBA(r, g, b, 1));
		const transparent = new Color(new RGBA(r, g, b, 0));

		this.overlay.style.background = `linear-gradient(to bottom, ${opaque} 0%, ${transparent} 100%)`;
		this.domNode.setAttribute('aria-valuenow', `${Math.round(color.hsva.a * 100)}`);
	}

	protected getValue(color: Color): number {
		return color.hsva.a;
	}
}

export class HueStrip extends Strip {

	constructor(container: HTMLElement, model: ColorPickerModel, type: ColorPickerWidgetType) {
		super(container, model, type);
		this.domNode.classList.add('hue-strip');

		// ARIA attributes for hue slider
		this.domNode.setAttribute('role', 'slider');
		this.domNode.setAttribute('aria-label', 'Hue');
		this.domNode.setAttribute('aria-valuemin', '0');
		this.domNode.setAttribute('aria-valuemax', '360');
		this.domNode.setAttribute('aria-valuenow', `${Math.round(model.color.hsva.h)}`);
	}

	protected override onDidChangeColor(color: Color): void {
		super.onDidChangeColor(color);
		this.domNode.setAttribute('aria-valuenow', `${Math.round(color.hsva.h)}`);
	}

	protected getValue(color: Color): number {
		return 1 - (color.hsva.h / 360);
	}
}
