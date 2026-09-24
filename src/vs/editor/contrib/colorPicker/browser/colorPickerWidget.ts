/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './colorPicker.css';
import { PixelRatio } from '../../../../base/browser/pixelRatio.js';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Widget } from '../../../../base/browser/ui/widget.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ColorPickerModel } from './colorPickerModel.js';
import { IEditorHoverColorPickerWidget } from '../../hover/browser/hoverTypes.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ColorPickerBody } from './colorPickerParts/colorPickerBody.js';
import { ColorPickerHeader } from './colorPickerParts/colorPickerHeader.js';
import { ColorPickerWidgetType } from './colorPickerParticipantUtils.js';

const $ = dom.$;

export class ColorPickerWidget extends Widget implements IEditorHoverColorPickerWidget {

	private static readonly ID = 'editor.contrib.colorPickerWidget';
	private readonly _domNode: HTMLElement;

	body: ColorPickerBody;
	header: ColorPickerHeader;

	private readonly _onEscape = this._register(new Emitter<void>());
	readonly onEscape: Event<void> = this._onEscape.event;

	private readonly _onResult = this._register(new Emitter<void>());
	readonly onResult: Event<void> = this._onResult.event;

	constructor(container: Node, readonly model: ColorPickerModel, private pixelRatio: number, themeService: IThemeService, type: ColorPickerWidgetType) {
		super();

		this._register(PixelRatio.getInstance(dom.getWindow(container)).onDidChange(() => this.layout()));

		this._domNode = $('.colorpicker-widget');
		this._domNode.tabIndex = 0;
		container.appendChild(this._domNode);

		this.header = this._register(new ColorPickerHeader(this._domNode, this.model, themeService, type));
		this.body = this._register(new ColorPickerBody(this._domNode, this.model, this.pixelRatio, type));

		// Keyboard navigation: Tab/Shift+Tab cycle and Escape
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.KEY_DOWN, e => this._onKeyDown(new StandardKeyboardEvent(e))));

		// If the hover framework gives focus to our container, redirect it to the first interactive element
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.FOCUS, () => this.focus()));
	}

	private _getFocusableElements(): HTMLElement[] {
		return [
			this.body.saturationBox.domNode,
			this.body.opacityStrip.domNode,
			this.body.hueStrip.domNode,
			this.header.domNode,
		];
	}

	private _onKeyDown(e: StandardKeyboardEvent): void {
		if (e.keyCode === KeyCode.Tab) {
			this._handleTabNavigation(e);
		} else if (e.keyCode === KeyCode.Escape) {
			this._handleEscape(e);
		} else if (e.keyCode === KeyCode.Enter || e.keyCode === KeyCode.Space) {
			const activeElement = dom.getActiveElement();
			if (activeElement && this.body.domNode.contains(activeElement)) {
				this._onResult.fire();
			}
		}
	}

	private _handleTabNavigation(e: StandardKeyboardEvent): void {
		const focusable = this._getFocusableElements();
		const activeElement = dom.getActiveElement();
		const currentIndex = focusable.indexOf(activeElement as HTMLElement);

		if (e.shiftKey) {
			this._focusPreviousElement(focusable, currentIndex);
		} else {
			this._focusNextElement(focusable, currentIndex);
		}
		e.preventDefault();
	}

	private _focusPreviousElement(focusable: HTMLElement[], currentIndex: number): void {
		const prevIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
		focusable[prevIndex].focus();
	}

	private _focusNextElement(focusable: HTMLElement[], currentIndex: number): void {
		const nextIndex = currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1;
		focusable[nextIndex].focus();
	}

	private _handleEscape(e: StandardKeyboardEvent): void {
		this.model.color = this.model.originalColor;
		this.model.revertPresentation();
		this.model.flushColor();
		this._onEscape.fire();
		e.preventDefault();
	}

	getId(): string {
		return ColorPickerWidget.ID;
	}

	focus(): void {
		const focusable = this._getFocusableElements();
		if (focusable.length > 0) {
			focusable[0].focus();
		}
	}

	layout(): void {
		this.body.layout();
	}

	get domNode(): HTMLElement {
		return this._domNode;
	}
}

