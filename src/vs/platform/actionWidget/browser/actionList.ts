/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../base/browser/dom.js';
import { KeybindingLabel } from '../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { IListEvent, IListMouseEvent, IListRenderer, IListVirtualDelegate } from '../../../base/browser/ui/list/list.js';
import { List } from '../../../base/browser/ui/list/listWidget.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ResolvedKeybinding } from '../../../base/common/keybindings.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { OS } from '../../../base/common/platform.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import './actionWidget.css';
import { localize } from '../../../nls.js';
import { IContextViewService } from '../../contextview/browser/contextView.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { defaultListStyles } from '../../theme/browser/defaultStyles.js';
import { asCssVariable } from '../../theme/common/colorRegistry.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';

export const acceptSelectedActionCommand = 'acceptSelectedCodeAction';
export const previewSelectedActionCommand = 'previewSelectedCodeAction';

export interface IActionListDelegate<T> {
	onHide(didCancel?: boolean): void;
	onSelect(action: T, preview?: boolean): void;
	onHover?(action: T, cancellationToken: CancellationToken): Promise<{ canPreview: boolean } | void>;
	onFocus?(action: T | undefined): void;
}

export interface IActionListItem<T> {
	readonly item?: T;
	readonly kind: ActionListItemKind;
	readonly group?: { kind?: any; icon?: ThemeIcon; title: string };
	readonly disabled?: boolean;
	readonly label?: string;
	readonly description?: string;
	readonly keybinding?: ResolvedKeybinding;
	canPreview?: boolean | undefined;
	readonly hideIcon?: boolean;
	readonly tooltip?: string;
}

interface IActionMenuTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly text: HTMLElement;
	readonly description?: HTMLElement;
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

class HeaderRenderer<T> implements IListRenderer<IActionListItem<T>, IHeaderTemplateData> {

	get templateId(): string { return ActionListItemKind.Header; }

	renderTemplate(container: HTMLElement): IHeaderTemplateData {
		container.classList.add('group-header');

		const text = document.createElement('span');
		container.append(text);

		return { container, text };
	}

	renderElement(element: IActionListItem<T>, _index: number, templateData: IHeaderTemplateData): void {
		templateData.text.textContent = element.group?.title ?? element.label ?? '';
	}

	disposeTemplate(_templateData: IHeaderTemplateData): void {
		// noop
	}
}

class ActionItemRenderer<T> implements IListRenderer<IActionListItem<T>, IActionMenuTemplateData> {

	get templateId(): string { return ActionListItemKind.Action; }

	constructor(
		private readonly _supportsPreview: boolean,
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

		const description = document.createElement('span');
		description.className = 'description';
		container.append(description);

		const keybinding = new KeybindingLabel(container, OS);

		return { container, icon, text, description, keybinding };
	}

	renderElement(element: IActionListItem<T>, _index: number, data: IActionMenuTemplateData): void {
		if (element.group?.icon) {
			data.icon.className = ThemeIcon.asClassName(element.group.icon);
			if (element.group.icon.color) {
				data.icon.style.color = asCssVariable(element.group.icon.color.id);
			}
		} else {
			data.icon.className = ThemeIcon.asClassName(Codicon.lightBulb);
			data.icon.style.color = 'var(--vscode-editorLightBulb-foreground)';
		}

		if (!element.item || !element.label) {
			return;
		}

		dom.setVisibility(!element.hideIcon, data.icon);

		data.text.textContent = stripNewlines(element.label);

		if (element.description) {
			data.description!.textContent = stripNewlines(element.description);
			data.description!.style.display = 'inline';
		} else {
			data.description!.textContent = '';
			data.description!.style.display = 'none';
		}

		data.keybinding.set(element.keybinding);
		dom.setVisibility(!!element.keybinding, data.keybinding.element);

		const actionTitle = this._keybindingService.lookupKeybinding(acceptSelectedActionCommand)?.getLabel();
		const previewTitle = this._keybindingService.lookupKeybinding(previewSelectedActionCommand)?.getLabel();
		data.container.classList.toggle('option-disabled', element.disabled);
		if (element.tooltip) {
			data.container.title = element.tooltip;
		} else if (element.disabled) {
			data.container.title = element.label;
		} else if (actionTitle && previewTitle) {
			if (this._supportsPreview && element.canPreview) {
				data.container.title = localize({ key: 'label-preview', comment: ['placeholders are keybindings, e.g "F2 to Apply, Shift+F2 to Preview"'] }, "{0} to Apply, {1} to Preview", actionTitle, previewTitle);
			} else {
				data.container.title = localize({ key: 'label', comment: ['placeholder is a keybinding, e.g "F2 to Apply"'] }, "{0} to Apply", actionTitle);
			}
		} else {
			data.container.title = '';
		}
	}

	disposeTemplate(templateData: IActionMenuTemplateData): void {
		templateData.keybinding.dispose();
	}
}

class AcceptSelectedEvent extends UIEvent {
	constructor() { super('acceptSelectedAction'); }
}

class PreviewSelectedEvent extends UIEvent {
	constructor() { super('previewSelectedAction'); }
}

function getKeyboardNavigationLabel<T>(item: IActionListItem<T>): string | undefined {
	// Filter out header vs. action
	if (item.kind === 'action') {
		return item.label;
	}
	return undefined;
}

export class ActionList<T> extends Disposable {

	public readonly domNode: HTMLElement;

	private readonly _list: List<IActionListItem<T>>;

	private readonly _actionLineHeight = 24;
	private readonly _headerLineHeight = 26;

	private readonly _allMenuItems: readonly IActionListItem<T>[];

	private readonly cts = this._register(new CancellationTokenSource());

	constructor(
		user: string,
		preview: boolean,
		items: readonly IActionListItem<T>[],
		private readonly _delegate: IActionListDelegate<T>,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ILayoutService private readonly _layoutService: ILayoutService,
	) {
		super();
		this.domNode = document.createElement('div');
		this.domNode.classList.add('actionList');
		const virtualDelegate: IListVirtualDelegate<IActionListItem<T>> = {
			getHeight: element => element.kind === ActionListItemKind.Header ? this._headerLineHeight : this._actionLineHeight,
			getTemplateId: element => element.kind
		};

		this._list = this._register(new List(user, this.domNode, virtualDelegate, [
			new ActionItemRenderer<IActionListItem<T>>(preview, this._keybindingService),
			new HeaderRenderer(),
		], {
			keyboardSupport: false,
			typeNavigationEnabled: true,
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel },
			accessibilityProvider: {
				getAriaLabel: element => {
					if (element.kind === ActionListItemKind.Action) {
						let label = element.label ? stripNewlines(element?.label) : '';
						if (element.disabled) {
							label = localize({ key: 'customQuickFixWidget.labels', comment: [`Action widget labels for accessibility.`] }, "{0}, Disabled Reason: {1}", label, element.disabled);
						}
						return label;
					}
					return null;
				},
				getWidgetAriaLabel: () => localize({ key: 'customQuickFixWidget', comment: [`An action widget option`] }, "Action Widget"),
				getRole: (e) => e.kind === ActionListItemKind.Action ? 'option' : 'separator',
				getWidgetRole: () => 'listbox',
			},
		}));

		this._list.style(defaultListStyles);

		this._register(this._list.onMouseClick(e => this.onListClick(e)));
		this._register(this._list.onMouseOver(e => this.onListHover(e)));
		this._register(this._list.onDidChangeFocus(() => this.onFocus()));
		this._register(this._list.onDidChangeSelection(e => this.onListSelection(e)));

		this._allMenuItems = items;
		this._list.splice(0, this._list.length, this._allMenuItems);

		if (this._list.length) {
			this.focusNext();
		}
	}

	private focusCondition(element: IActionListItem<unknown>): boolean {
		return !element.disabled && element.kind === ActionListItemKind.Action;
	}

	hide(didCancel?: boolean): void {
		this._delegate.onHide(didCancel);
		this.cts.cancel();
		this._contextViewService.hideContextView();
	}

	layout(minWidth: number): number {
		// Updating list height, depending on how many separators and headers there are.
		const numHeaders = this._allMenuItems.filter(item => item.kind === 'header').length;
		const itemsHeight = this._allMenuItems.length * this._actionLineHeight;
		const heightWithHeaders = itemsHeight + numHeaders * this._headerLineHeight - numHeaders * this._actionLineHeight;
		this._list.layout(heightWithHeaders);
		let maxWidth = minWidth;

		if (this._allMenuItems.length >= 50) {
			maxWidth = 380;
		} else {
			// For finding width dynamically (not using resize observer)
			const itemWidths: number[] = this._allMenuItems.map((_, index): number => {
				const element = this.domNode.ownerDocument.getElementById(this._list.getElementID(index));
				if (element) {
					element.style.width = 'auto';
					const width = element.getBoundingClientRect().width;
					element.style.width = '';
					return width;
				}
				return 0;
			});

			// resize observer - can be used in the future since list widget supports dynamic height but not width
			maxWidth = Math.max(...itemWidths, minWidth);
		}

		const maxVhPrecentage = 0.7;
		const height = Math.min(heightWithHeaders, this._layoutService.getContainer(dom.getWindow(this.domNode)).clientHeight * maxVhPrecentage);
		this._list.layout(height, maxWidth);

		this.domNode.style.height = `${height}px`;

		this._list.domFocus();
		return maxWidth;
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

		const event = preview ? new PreviewSelectedEvent() : new AcceptSelectedEvent();
		this._list.setSelection([focusIndex], event);
	}

	private onListSelection(e: IListEvent<IActionListItem<T>>): void {
		if (!e.elements.length) {
			return;
		}

		const element = e.elements[0];
		if (element.item && this.focusCondition(element)) {
			this._delegate.onSelect(element.item, e.browserEvent instanceof PreviewSelectedEvent);
		} else {
			this._list.setSelection([]);
		}
	}

	private onFocus() {
		const focused = this._list.getFocus();
		if (focused.length === 0) {
			return;
		}
		const focusIndex = focused[0];
		const element = this._list.element(focusIndex);
		this._delegate.onFocus?.(element.item);
	}

	private async onListHover(e: IListMouseEvent<IActionListItem<T>>) {
		const element = e.element;
		if (element && element.item && this.focusCondition(element)) {
			if (this._delegate.onHover && !element.disabled && element.kind === ActionListItemKind.Action) {
				const result = await this._delegate.onHover(element.item, this.cts.token);
				element.canPreview = result ? result.canPreview : undefined;
			}
			if (e.index) {
				this._list.splice(e.index, 1, [element]);
			}
		}

		this._list.setFocus(typeof e.index === 'number' ? [e.index] : []);
	}

	private onListClick(e: IListMouseEvent<IActionListItem<T>>): void {
		if (e.element && this.focusCondition(e.element)) {
			this._list.setFocus([]);
		}
	}
}

function stripNewlines(str: string): string {
	return str.replace(/\r\n|\r|\n/g, ' ');
}
