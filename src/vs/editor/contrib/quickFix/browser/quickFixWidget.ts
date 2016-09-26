/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./quickFix';
import Event, { Emitter } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { hide, show } from 'vs/base/browser/dom';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IPosition } from 'vs/editor/common/editorCommon';
import { ICodeEditor, IContentWidget, IContentWidgetPosition, ContentWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { IQuickFix2 } from '../common/quickFix';

const quickFixRenderer = new class implements IRenderer<IQuickFix2, HTMLElement> {

	templateId = 'command';

	renderTemplate(container: HTMLElement): HTMLElement {
		container.classList.add('quickfix-entry');
		return container;
	}

	renderElement(element: IQuickFix2, index: number, templateData: HTMLElement): void {
		templateData.innerText = element.command.title;
	}

	disposeTemplate(templateData: HTMLElement): void {

	}
};

export class QuickFixList {

	domNode: HTMLDivElement;

	private _editor: ICodeEditor;
	private _onDidSelect = new Emitter<IQuickFix2>();
	private _widget: List<IQuickFix2>;
	private _widgetSubscription: IDisposable;

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this.createElements();
	}

	dispose(): void {
		this._widgetSubscription.dispose();
	}

	protected createElements() {

		this.domNode = document.createElement('div');

		const delegate = <IDelegate<IQuickFix2>>{
			getHeight: () => this._editor.getConfiguration().lineHeight,
			getTemplateId: () => 'command'
		};

		this._widget = new List<IQuickFix2>(this.domNode, delegate, [quickFixRenderer], { useShadows: false });
		this._widgetSubscription = this._widget.onSelectionChange(event => {
			const [first] = event.elements;
			if (first) {
				alert(localize('quickFixAccepted', "{0}, accepted", first.command.title));
				this._onDidSelect.fire(first);
			}
		});
	}

	get onDidSelectQuickFix(): Event<IQuickFix2> {
		return this._onDidSelect.event;
	}

	setInput(fixes: IQuickFix2[]): void {
		this._widget.splice(0, this._widget.length, ...fixes);
		this._widget.layout(Math.min(5, fixes.length) * this._editor.getConfiguration().lineHeight);
	}

	focusNext(): void {
		this._widget.focusNext();
	}

	focusPrevious(): void {
		this._widget.focusPrevious();
	}

	focusNextPage(): void {
		this._widget.focusNextPage();
	}

	focusPreviousPage(): void {
		this._widget.focusPreviousPage();
	}

	select(): void {
		const [first] = this._widget.getFocus();
		if (typeof first === 'number') {
			this._widget.setSelection(first);
		}
	}
}

export class Message {

	static Loading = localize('QuickFixSelectionWidget.loading', "Loading...");
	static NoFixes = localize('QuickFixSelectionWidget.noSuggestions', "No fix suggestions.");

	domNode: HTMLDivElement;

	constructor(editor: ICodeEditor) {
		this.domNode = document.createElement('div');
		this.domNode.style.height = editor.getConfiguration().lineHeight + 'px';
	}

	set value(value: string) {
		this.domNode.innerText = value;
	}
}

export class QuickFixContentWidget implements IContentWidget {

	domNode: HTMLDivElement;
	message: Message;
	list: QuickFixList;

	private _editor: ICodeEditor;
	private _position: IPosition;

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._editor.addContentWidget(this);

		this.message = new Message(this._editor);
		this.list = new QuickFixList(this._editor);

		hide(this.message.domNode);
		hide(this.list.domNode);

		this.domNode = document.createElement('div');
		this.domNode.classList.add('quickfix-widget');
		this.domNode.appendChild(this.message.domNode);
		this.domNode.appendChild(this.list.domNode);
	}

	dispose(): void {
		this._editor.removeContentWidget(this);
	}

	getId(): string {
		return 'QuickFixContentWidget';
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	show(fixes: TPromise<IQuickFix2[]>, position: IPosition): void {

		this._position = position;

		hide(this.list.domNode);
		show(this.message.domNode);

		this.message.value = Message.Loading;
		this._layout();

		fixes.then(values => {
			if (values.length > 0) {
				hide(this.message.domNode);
				show(this.list.domNode);
				this._layout(Math.min(5, values.length));
				this.list.setInput(values);
			} else {
				this.message.value = Message.NoFixes;
			}
		}, err => {
			this.hide();
		});
	}

	private _layout(heightInLines: number = 1): void {

		const {lineHeight} = this._editor.getConfiguration();
		const width = 18 * lineHeight + 'px';
		const height = heightInLines * lineHeight + 'px';

		this.domNode.style.width = width;
		this.domNode.style.height = height;

		this._editor.layoutContentWidget(this);
	}

	hide(): void {
		this._position = undefined;
		this._layout();
	}

	isVisible(): boolean {
		return !!this._position;
	}

	isListVisible(): boolean {
		return this.isVisible() && this.list.domNode.style.display !== 'none';
	}

	isMessageVisible(): boolean {
		return this.isVisible() && this.message.domNode.style.display !== 'none';
	}

	getPosition(): IContentWidgetPosition {
		if (this._position) {
			return { position: this._position, preference: [ContentWidgetPositionPreference.BELOW] };
		} else {
			return null;
		}
	}
}
