/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Widget } from 'vs/base/browser/ui/widget';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import Event, { Emitter } from 'vs/base/common/event';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class CopyPreferenceWidget<T> extends Widget implements IOverlayWidget {

	private static counter: number = 1;

	private _domNode: HTMLElement;
	private _visible: boolean;
	private _line: number;
	private _id: string;
	private _preference: T;

	private _onClick: Emitter<T> = new Emitter<T>();
	public get onClick(): Event<T> { return this._onClick.event; }

	constructor(private editor: ICodeEditor) {
		super();
		this._id = 'preferences.copyPreferenceWidget' + CopyPreferenceWidget.counter++;
		this.editor.addOverlayWidget(this);
		this._register(this.editor.onDidScrollChange(() => {
			if (this._visible) {
				this._layout();
			}
		}));
	}

	public dispose(): void {
		this.editor.removeOverlayWidget(this);
		super.dispose();
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		if (!this._domNode) {
			this._domNode = document.createElement('div');
			this._domNode.style.width = '20px';
			this._domNode.style.height = '20px';
			this._domNode.className = 'copy-preferences-light-bulb hidden';
			this.onclick(this._domNode, e => this._onClick.fire(this._preference));
		}
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition {
		return null;
	}

	getLine(): number {
		return this._line;
	}

	show(line: number, preference: T): void {
		this._preference = preference;
		if (!this._visible || this._line !== line) {
			this._line = line;
			this._visible = true;
			this._layout();
		}
	}

	private _layout(): void {
		const topForLineNumber = this.editor.getTopForLineNumber(this._line);
		const editorScrollTop = this.editor.getScrollTop();
		const maxColumn = this.editor.getModel().getLineMaxColumn(this._line);
		const columnOffset = this.editor.getOffsetForColumn(this._line, maxColumn);
		const contentLeft = this.editor.getLayoutInfo().contentLeft;
		const editorScrollLeft = this.editor.getScrollLeft();

		this._domNode.style.top = `${topForLineNumber - editorScrollTop - 2}px`;
		this._domNode.style.left = `${contentLeft + columnOffset - editorScrollLeft}px`;
		this._domNode.classList.remove('hidden');
	}

	hide(): void {
		if (this._visible) {
			this._visible = false;
			this._domNode.classList.add('hidden');
		}
	}
}

export class FloatingClickWidget extends Widget implements IOverlayWidget {

	private _domNode: HTMLElement;

	private _onClick: Emitter<void> = this._register(new Emitter<void>());
	public onClick: Event<void> = this._onClick.event;

	constructor(private editor: ICodeEditor, private label: string, private keyBindingAction: string,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super();
		if (keyBindingAction) {
			let keybinding = keybindingService.lookupKeybindings(keyBindingAction);
			if (keybinding.length > 0) {
				this.label += ' (' + keybindingService.getLabelFor(keybinding[0]) + ')';
			}
		}
	}

	public render() {
		this._domNode = DOM.$('.floating-click-widget');
		DOM.append(this._domNode, DOM.$('')).textContent = this.label;
		this.onclick(this._domNode, e => this._onClick.fire());
		this.editor.addOverlayWidget(this);
	}

	public dispose(): void {
		this.editor.removeOverlayWidget(this);
		super.dispose();
	}

	public getId(): string {
		return 'editor.overlayWidget.floatingClickWidget';
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return {
			preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
		};
	}
}