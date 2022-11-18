/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from 'vs/base/browser/dom';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IListEvent, IListMouseEvent, IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable } from 'vs/base/common/lifecycle';
import { OS } from 'vs/base/common/platform';
import 'vs/css!./actionWidget';
import { localize } from 'vs/nls';
import { IActionItem, IActionKeybindingResolver } from 'vs/platform/actionWidget/common/actionWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export const acceptSelectedActionCommand = 'acceptSelectedCodeAction';
export const previewSelectedActionCommand = 'previewSelectedCodeAction';

export interface IRenderDelegate {
	onHide(didCancel?: boolean): void;
	onSelect(action: IActionItem, preview?: boolean): Promise<any>;
}

export interface IListMenuItem<T extends IActionItem> {
	item?: T;
	kind: ActionListItemKind;
	group?: { kind?: any; icon?: { codicon: Codicon; color?: string }; title: string };
	disabled?: boolean;
	label?: string;
}

interface IActionMenuTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly text: HTMLElement;
	readonly keybinding: KeybindingLabel;
}

export const enum ActionListItemKind {
	Action = 'action',
	Header = 'header'
}

interface IHeaderTemplateData {
	readonly container: HTMLElement;
	readonly text: HTMLElement;
}

class HeaderRenderer<T extends IListMenuItem<IActionItem>> implements IListRenderer<T, IHeaderTemplateData> {

	get templateId(): string { return ActionListItemKind.Header; }

	renderTemplate(container: HTMLElement): IHeaderTemplateData {
		container.classList.add('group-header');

		const text = document.createElement('span');
		container.append(text);

		return { container, text };
	}

	renderElement(element: IListMenuItem<IActionItem>, _index: number, templateData: IHeaderTemplateData): void {
		if (!element.group) {
			return;
		}
		templateData.text.textContent = element.group?.title;
	}

	disposeTemplate(_templateData: IHeaderTemplateData): void {
		// noop
	}
}

class ActionItemRenderer<T extends IListMenuItem<IActionItem>> implements IListRenderer<T, IActionMenuTemplateData> {

	get templateId(): string { return 'action'; }

	constructor(
		private readonly _keybindingResolver: IActionKeybindingResolver | undefined,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) { }

	renderTemplate(container: HTMLElement): IActionMenuTemplateData {
		container.classList.add(this.templateId);

		const icon = document.createElement('div');
		icon.className = 'icon';
		container.append(icon);

		const text = document.createElement('span');
		text.className = 'title';
		container.append(text);

		const keybinding = new KeybindingLabel(container, OS);

		return { container, icon, text, keybinding };
	}

	renderElement(element: T, _index: number, data: IActionMenuTemplateData): void {
		if (element.group?.icon) {
			data.icon.className = element.group.icon.codicon.classNames;
			data.icon.style.color = element.group.icon.color ?? '';
		} else {
			data.icon.className = Codicon.lightBulb.classNames;
			data.icon.style.color = 'var(--vscode-editorLightBulb-foreground)';
		}
		if (!element.item || !element.label) {
			return;
		}
		data.text.textContent = stripNewlines(element.label);
		const binding = this._keybindingResolver?.getResolver()(element.item);
		if (binding) {
			data.keybinding.set(binding);
		}

		if (!binding) {
			dom.hide(data.keybinding.element);
		} else {
			dom.show(data.keybinding.element);
		}

		const actionTitle = this._keybindingService.lookupKeybinding(acceptSelectedActionCommand)?.getLabel();
		const previewTitle = this._keybindingService.lookupKeybinding(previewSelectedActionCommand)?.getLabel();
		data.container.classList.toggle('option-disabled', element.disabled);
		if (element.disabled) {
			data.container.title = element.label;
		} else if (actionTitle && previewTitle) {
			data.container.title = localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to apply, Shift+F2 to preview"'] }, "{0} to apply, {1} to preview", actionTitle, previewTitle);
		} else {
			data.container.title = '';
		}
	}

	disposeTemplate(_templateData: IActionMenuTemplateData): void {
		// noop
	}
}

export class ActionList<T extends IActionItem> extends Disposable {

	public readonly domNode: HTMLElement;

	private readonly _list: List<IListMenuItem<IActionItem>>;

	private readonly _actionLineHeight = 24;
	private readonly _headerLineHeight = 26;

	private readonly _allMenuItems: IListMenuItem<IActionItem>[];

	constructor(
		user: string,
		items: IListMenuItem<T>[],
		private readonly _delegate: IRenderDelegate,
		resolver: IActionKeybindingResolver | undefined,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();

		this.domNode = document.createElement('div');
		this.domNode.classList.add('actionList');
		const virtualDelegate: IListVirtualDelegate<IListMenuItem<IActionItem>> = {
			getHeight: element => element.kind === 'header' ? this._headerLineHeight : this._actionLineHeight,
			getTemplateId: element => element.kind
		};
		this._list = new List(user, this.domNode, virtualDelegate, [new ActionItemRenderer<IListMenuItem<IActionItem>>(resolver, this._keybindingService), new HeaderRenderer()], {
			keyboardSupport: true,
			accessibilityProvider: {
				getAriaLabel: element => {
					if (element.kind === 'action') {
						let label = element.label ? stripNewlines(element?.label) : '';
						if (element.disabled) {
							label = localize({ key: 'customQuickFixWidget.labels', comment: [`Action widget labels for accessibility.`] }, "{0}, Disabled Reason: {1}", label, element.disabled);
						}
						return label;
					}
					return null;
				},
				getWidgetAriaLabel: () => localize({ key: 'customQuickFixWidget', comment: [`An action widget option`] }, "Action Widget"),
				getRole: () => 'option',
				getWidgetRole: () => user
			},
		});

		this._register(this._list.onMouseClick(e => this.onListClick(e)));
		this._register(this._list.onMouseOver(e => this.onListHover(e)));
		this._register(this._list.onDidChangeFocus(() => this._list.domFocus()));
		this._register(this._list.onDidChangeSelection(e => this.onListSelection(e)));

		this._allMenuItems = items;
		this._list.splice(0, this._list.length, this._allMenuItems);
		this.focusNext();
	}

	private focusCondition(element: IListMenuItem<IActionItem>): boolean {
		return !element.disabled && element.kind === ActionListItemKind.Action;
	}

	hide(didCancel?: boolean): void {
		this._delegate.onHide(didCancel);
		this._contextViewService.hideContextView();
	}

	layout(minWidth: number): number {
		// Updating list height, depending on how many separators and headers there are.
		const numHeaders = this._allMenuItems.filter(item => item.kind === 'header').length;
		const height = this._allMenuItems.length * this._actionLineHeight;
		const heightWithHeaders = height + numHeaders * this._headerLineHeight - numHeaders * this._actionLineHeight;
		this._list.layout(heightWithHeaders);

		// For finding width dynamically (not using resize observer)
		const itemWidths: number[] = this._allMenuItems.map((_, index): number => {
			const element = document.getElementById(this._list.getElementID(index));
			if (element) {
				element.style.width = 'auto';
				const width = element.getBoundingClientRect().width;
				element.style.width = '';
				return width;
			}
			return 0;
		});

		// resize observer - can be used in the future since list widget supports dynamic height but not width
		const width = Math.max(...itemWidths, minWidth);
		this._list.layout(heightWithHeaders, width);

		this.domNode.style.height = `${heightWithHeaders}px`;

		this._list.domFocus();
		return width;
	}

	focusPrevious() {
		this._list.focusPrevious(1, true, undefined, this.focusCondition);
	}

	focusNext() {
		this._list.focusNext(1, true, undefined, this.focusCondition);
	}

	acceptSelected(preview?: boolean) {
		const focused = this._list.getFocus();
		if (focused.length === 0) {
			return;
		}

		const focusIndex = focused[0];
		const element = this._list.element(focusIndex);
		if (!this.focusCondition(element)) {
			return;
		}

		const event = new UIEvent(preview ? 'previewSelectedCodeAction' : 'acceptSelectedCodeAction');
		this._list.setSelection([focusIndex], event);
	}

	private onListSelection(e: IListEvent<IListMenuItem<IActionItem>>): void {
		if (!e.elements.length) {
			return;
		}

		const element = e.elements[0];
		if (element.item && this.focusCondition(element)) {
			this._delegate.onSelect(element.item, e.browserEvent?.type === 'previewSelectedEventType');
		} else {
			this._list.setSelection([]);
		}
	}

	private onListHover(e: IListMouseEvent<IListMenuItem<IActionItem>>): void {
		this._list.setFocus(typeof e.index === 'number' ? [e.index] : []);
	}

	private onListClick(e: IListMouseEvent<IListMenuItem<IActionItem>>): void {
		if (e.element && this.focusCondition(e.element)) {
			this._list.setFocus([]);
		}
	}
}

function stripNewlines(str: string): string {
	return str.replace(/\r\n|\r|\n/g, ' ');
}
