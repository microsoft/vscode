/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/keybindings';
import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { Widget } from 'vs/base/browser/ui/widget';
import { ResolvedKeybinding, KeyCode } from 'vs/base/common/keyCodes';
import * as dom from 'vs/base/browser/dom';
import { InputBox, IInputOptions } from 'vs/base/browser/ui/inputbox/inputBox';
import { renderHtml } from 'vs/base/browser/htmlContentRenderer';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Dimension } from 'vs/base/browser/builder';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';

class KeybindingInputWidget extends Widget {

	public readonly inputBox: InputBox;

	private _onKeybinding = this._register(new Emitter<ResolvedKeybinding>());
	public readonly onKeybinding: Event<ResolvedKeybinding> = this._onKeybinding.event;

	private _onEnter = this._register(new Emitter<void>());
	public readonly onEnter: Event<void> = this._onEnter.event;

	private _onEscape = this._register(new Emitter<void>());
	public readonly onEscape: Event<void> = this._onEscape.event;

	constructor(parent: HTMLElement, private options: IInputOptions,
		@IContextViewService private contextViewService: IContextViewService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super();
		this.inputBox = this._register(new InputBox(parent, this.contextViewService, this.options));
		this.onkeydown(this.inputBox.inputElement, e => this.onKeyDown(e));
	}

	private onKeyDown(keyboardEvent: IKeyboardEvent): void {
		keyboardEvent.preventDefault();
		keyboardEvent.stopPropagation();
		switch (keyboardEvent.toKeybinding().value) {
			case KeyCode.Enter:
				this._onEnter.fire();
				return;
			case KeyCode.Escape:
				this._onEscape.fire();
				return;
		}
		this.printKeybinding(keyboardEvent);
	}

	private printKeybinding(keyboardEvent: IKeyboardEvent): void {
		const keybinding = this.keybindingService.resolveKeybinding(keyboardEvent.toKeybinding());
		this.inputBox.value = keybinding.getUserSettingsLabel().toLowerCase();
		this.inputBox.inputElement.title = 'keyCode: ' + keyboardEvent.browserEvent.keyCode;
		this._onKeybinding.fire(keybinding);
	}
}

export class DefineKeybindingWidget extends Widget {

	private static WIDTH = 400;
	private static HEIGHT = 90;

	private _domNode: FastDomNode<HTMLElement>;
	private _keybindingInputWidget: KeybindingInputWidget;
	private _outputNode: HTMLElement;

	private _resolvedKeybinding: ResolvedKeybinding = null;
	private _isVisible: boolean = false;

	private _onHide = this._register(new Emitter<void>());

	constructor(parent: HTMLElement, @IKeybindingService private keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
		this.create();
		if (parent) {
			dom.append(parent, this._domNode.domNode);
		}
	}

	get domNode(): HTMLElement {
		return this._domNode.domNode;
	}

	define(): TPromise<string> {
		return new TPromise((c, e) => {
			if (!this._isVisible) {
				this._isVisible = true;
				this._domNode.setDisplay('block');

				this._resolvedKeybinding = null;
				this._keybindingInputWidget.inputBox.value = '';
				dom.clearNode(this._outputNode);
				this._keybindingInputWidget.inputBox.focus();
			}
			const disposable = this._onHide.event(() => {
				if (this._resolvedKeybinding) {
					c(this._resolvedKeybinding.getUserSettingsLabel());
				} else {
					c(null);
				}
				disposable.dispose();
			});
		});
	}

	layout(layout: Dimension): void {
		let top = Math.round((layout.height - DefineKeybindingWidget.HEIGHT) / 2);
		this._domNode.setTop(top);

		let left = Math.round((layout.width - DefineKeybindingWidget.WIDTH) / 2);
		this._domNode.setLeft(left);
	}

	private create(): void {
		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setDisplay('none');
		this._domNode.setClassName('defineKeybindingWidget');
		this._domNode.setWidth(DefineKeybindingWidget.WIDTH);
		this._domNode.setHeight(DefineKeybindingWidget.HEIGHT);
		dom.append(this._domNode.domNode, dom.$('.message', null, nls.localize('defineKeybinding.initial', "Press desired key combination and ENTER. ESCAPE to cancel.")));

		this._keybindingInputWidget = this.instantiationService.createInstance(KeybindingInputWidget, this._domNode.domNode, {});
		this._register(this._keybindingInputWidget.onKeybinding(keybinding => this.printKeybinding(keybinding)));
		this._register(this._keybindingInputWidget.onEnter(() => this.hide()));
		this._register(this._keybindingInputWidget.onEscape(() => this.onCancel()));
		this._register(dom.addDisposableListener(this._keybindingInputWidget.inputBox.inputElement, 'blur', e => this.onCancel()));

		this._outputNode = dom.append(this._domNode.domNode, dom.$('.output'));;
	}

	private printKeybinding(keybinding: ResolvedKeybinding): void {
		this._resolvedKeybinding = keybinding;
		dom.clearNode(this._outputNode);
		let htmlkb = this._resolvedKeybinding.getHTMLLabel();
		htmlkb.forEach((item) => this._outputNode.appendChild(renderHtml(item)));
	}

	private onCancel(): void {
		this._resolvedKeybinding = null;
		this.hide();
	}

	private hide(): void {
		this._domNode.setDisplay('none');
		this._isVisible = false;
		this._onHide.fire();
	}
}

export class DefineKeybindingOverlayWidget extends Disposable implements IOverlayWidget {

	private static ID = 'editor.contrib.defineKeybindingWidget';

	private readonly _widget: DefineKeybindingWidget;

	constructor(private _editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this._widget = instantiationService.createInstance(DefineKeybindingWidget, null);
		this._editor.addOverlayWidget(this);
	}

	public getId(): string {
		return DefineKeybindingOverlayWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._widget.domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return {
			preference: null
		};
	}

	public dispose(): void {
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	public start(): TPromise<string> {
		this._editor.revealPositionInCenterIfOutsideViewport(this._editor.getPosition());
		const layoutInfo = this._editor.getLayoutInfo();
		this._widget.layout(new Dimension(layoutInfo.width, layoutInfo.height));
		return this._widget.define();
	}
}