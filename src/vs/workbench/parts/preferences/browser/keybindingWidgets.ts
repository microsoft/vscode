/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/keybindings';
import * as nls from 'vs/nls';
import { OS } from 'vs/base/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { Widget } from 'vs/base/browser/ui/widget';
import { ResolvedKeybinding, KeyCode } from 'vs/base/common/keyCodes';
import * as dom from 'vs/base/browser/dom';
import { InputBox, IInputOptions } from 'vs/base/browser/ui/inputbox/inputBox';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Dimension } from 'vs/base/browser/builder';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { attachInputBoxStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { editorWidgetBackground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { ScrollType } from 'vs/editor/common/editorCommon';

class KeybindingInputWidget extends Widget {

	private readonly inputBox: InputBox;

	private _acceptChords: boolean;
	private _firstPart: ResolvedKeybinding;
	private _chordPart: ResolvedKeybinding;
	private _inputValue: string;

	private _onKeybinding = this._register(new Emitter<[ResolvedKeybinding, ResolvedKeybinding]>());
	public readonly onKeybinding: Event<[ResolvedKeybinding, ResolvedKeybinding]> = this._onKeybinding.event;

	private _onEnter = this._register(new Emitter<void>());
	public readonly onEnter: Event<void> = this._onEnter.event;

	private _onEscape = this._register(new Emitter<void>());
	public readonly onEscape: Event<void> = this._onEscape.event;

	private _onBlur = this._register(new Emitter<void>());
	public readonly onBlur: Event<void> = this._onBlur.event;

	constructor(parent: HTMLElement, private options: IInputOptions,
		@IContextViewService private contextViewService: IContextViewService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IThemeService themeService: IThemeService
	) {
		super();
		this.inputBox = this._register(new InputBox(parent, this.contextViewService, this.options));
		this._register(attachInputBoxStyler(this.inputBox, themeService));
		this.onkeydown(this.inputBox.inputElement, e => this._onKeyDown(e));
		this.onblur(this.inputBox.inputElement, (e) => this._onBlur.fire());

		this.oninput(this.inputBox.inputElement, (e) => {
			// Prevent other characters from showing up
			this.setInputValue(this._inputValue);
		});

		this._acceptChords = true;
		this._firstPart = null;
		this._chordPart = null;
	}

	public setInputValue(value: string): void {
		this._inputValue = value;
		this.inputBox.value = this._inputValue;
	}

	public focus(): void {
		this.inputBox.focus();
	}

	public reset() {
		this._firstPart = null;
		this._chordPart = null;
	}

	public setAcceptChords(acceptChords: boolean) {
		this._acceptChords = acceptChords;
		this._chordPart = null;
	}

	private _onKeyDown(keyboardEvent: IKeyboardEvent): void {
		keyboardEvent.preventDefault();
		keyboardEvent.stopPropagation();
		if (keyboardEvent.equals(KeyCode.Enter)) {
			this._onEnter.fire();
			return;
		}
		if (keyboardEvent.equals(KeyCode.Escape)) {
			this._onEscape.fire();
			return;
		}
		this.printKeybinding(keyboardEvent);
	}

	private printKeybinding(keyboardEvent: IKeyboardEvent): void {
		const keybinding = this.keybindingService.resolveKeyboardEvent(keyboardEvent);
		const info = `code: ${keyboardEvent.browserEvent.code}, keyCode: ${keyboardEvent.browserEvent.keyCode}, key: ${keyboardEvent.browserEvent.key} => UI: ${keybinding.getAriaLabel()}, user settings: ${keybinding.getUserSettingsLabel()}, dispatch: ${keybinding.getDispatchParts()[0]}`;

		if (this._acceptChords) {
			const hasFirstPart = (this._firstPart && this._firstPart.getDispatchParts()[0] !== null);
			const hasChordPart = (this._chordPart && this._chordPart.getDispatchParts()[0] !== null);
			if (hasFirstPart && hasChordPart) {
				// Reset
				this._firstPart = keybinding;
				this._chordPart = null;
			} else if (!hasFirstPart) {
				this._firstPart = keybinding;
			} else {
				this._chordPart = keybinding;
			}
		} else {
			this._firstPart = keybinding;
		}

		let value = '';
		if (this._firstPart) {
			value = this._firstPart.getUserSettingsLabel();
		}
		if (this._chordPart) {
			value = value + ' ' + this._chordPart.getUserSettingsLabel();
		}
		this.setInputValue(value);

		this.inputBox.inputElement.title = info;
		this._onKeybinding.fire([this._firstPart, this._chordPart]);
	}
}

export class DefineKeybindingWidget extends Widget {

	private static WIDTH = 400;
	private static HEIGHT = 90;

	private _domNode: FastDomNode<HTMLElement>;
	private _keybindingInputWidget: KeybindingInputWidget;
	private _outputNode: HTMLElement;

	private _firstPart: ResolvedKeybinding = null;
	private _chordPart: ResolvedKeybinding = null;
	private _isVisible: boolean = false;

	private _onHide = this._register(new Emitter<void>());

	constructor(
		parent: HTMLElement,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService
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
		this._keybindingInputWidget.reset();
		return new TPromise<string>((c, e) => {
			if (!this._isVisible) {
				this._isVisible = true;
				this._domNode.setDisplay('block');

				this._firstPart = null;
				this._chordPart = null;
				this._keybindingInputWidget.setInputValue('');
				dom.clearNode(this._outputNode);
				this._keybindingInputWidget.focus();
			}
			const disposable = this._onHide.event(() => {
				if (this._firstPart) {
					let r = this._firstPart.getUserSettingsLabel();
					if (this._chordPart) {
						r = r + ' ' + this._chordPart.getUserSettingsLabel();
					}
					c(r);
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

		this._register(attachStylerCallback(this.themeService, { editorWidgetBackground, widgetShadow }, colors => {
			this._domNode.domNode.style.backgroundColor = colors.editorWidgetBackground;

			if (colors.widgetShadow) {
				this._domNode.domNode.style.boxShadow = `0 2px 8px ${colors.widgetShadow}`;
			} else {
				this._domNode.domNode.style.boxShadow = null;
			}
		}));

		this._keybindingInputWidget = this._register(this.instantiationService.createInstance(KeybindingInputWidget, this._domNode.domNode, {}));
		this._register(this._keybindingInputWidget.onKeybinding(keybinding => this.printKeybinding(keybinding)));
		this._register(this._keybindingInputWidget.onEnter(() => this.hide()));
		this._register(this._keybindingInputWidget.onEscape(() => this.onCancel()));
		this._register(this._keybindingInputWidget.onBlur(() => this.onCancel()));

		this._outputNode = dom.append(this._domNode.domNode, dom.$('.output'));
	}

	private printKeybinding(keybinding: [ResolvedKeybinding, ResolvedKeybinding]): void {
		const [firstPart, chordPart] = keybinding;
		this._firstPart = firstPart;
		this._chordPart = chordPart;
		dom.clearNode(this._outputNode);
		new KeybindingLabel(this._outputNode, OS).set(this._firstPart, null);
		if (this._chordPart) {
			this._outputNode.appendChild(document.createTextNode(nls.localize('defineKeybinding.chordsTo', "chord to")));
			new KeybindingLabel(this._outputNode, OS).set(this._chordPart, null);
		}
	}

	private onCancel(): void {
		this._firstPart = null;
		this._chordPart = null;
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
		this._editor.revealPositionInCenterIfOutsideViewport(this._editor.getPosition(), ScrollType.Smooth);
		const layoutInfo = this._editor.getLayoutInfo();
		this._widget.layout(new Dimension(layoutInfo.width, layoutInfo.height));
		return this._widget.define();
	}
}