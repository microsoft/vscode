/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IHoverDelegate } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { ICustomHover, setupCustomHover } from 'vs/base/browser/ui/iconLabel/iconLabelHover';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { defaultToggleStyles } from 'vs/platform/theme/browser/defaultStyles';
import { ITreeItem, ITreeItemCheckboxState } from 'vs/workbench/common/views';

export class CheckboxStateHandler extends Disposable {
	private readonly _onDidChangeCheckboxState = this._register(new Emitter<ITreeItem[]>());
	readonly onDidChangeCheckboxState: Event<ITreeItem[]> = this._onDidChangeCheckboxState.event;

	public setCheckboxState(node: ITreeItem) {
		this._onDidChangeCheckboxState.fire([node]);
	}
}

export class TreeItemCheckbox extends Disposable {
	public toggle: Toggle | undefined;
	private checkboxContainer: HTMLDivElement;
	public isDisposed = false;
	private hover: ICustomHover | undefined;

	public static readonly checkboxClass = 'custom-view-tree-node-item-checkbox';

	private readonly _onDidChangeState = new Emitter<boolean>();
	readonly onDidChangeState: Event<boolean> = this._onDidChangeState.event;

	constructor(container: HTMLElement, private checkboxStateHandler: CheckboxStateHandler, private readonly hoverDelegate: IHoverDelegate) {
		super();
		this.checkboxContainer = <HTMLDivElement>container;
	}

	public render(node: ITreeItem) {
		if (node.checkbox) {
			if (!this.toggle) {
				this.createCheckbox(node);
			}
			else {
				this.toggle.checked = node.checkbox.isChecked;
				this.toggle.setIcon(this.toggle.checked ? Codicon.check : undefined);
			}
		}
	}

	private createCheckbox(node: ITreeItem) {
		if (node.checkbox) {
			this.toggle = new Toggle({
				isChecked: node.checkbox.isChecked,
				title: '',
				icon: node.checkbox.isChecked ? Codicon.check : undefined,
				...defaultToggleStyles
			});
			this.setHover(node.checkbox);
			this.setAccessibilityInformation(node.checkbox);
			this.toggle.domNode.classList.add(TreeItemCheckbox.checkboxClass);
			this.toggle.domNode.tabIndex = 1;
			DOM.append(this.checkboxContainer, this.toggle.domNode);
			this.registerListener(node);
		}
	}

	private registerListener(node: ITreeItem) {
		if (this.toggle) {
			this._register({ dispose: () => this.removeCheckbox() });
			this._register(this.toggle);
			this._register(this.toggle.onChange(() => {
				this.setCheckbox(node);
			}));
		}
	}

	private setHover(checkbox: ITreeItemCheckboxState) {
		if (this.toggle) {
			if (!this.hover) {
				this.hover = setupCustomHover(this.hoverDelegate, this.toggle.domNode, this.checkboxHoverContent(checkbox));
				this._register(this.hover);
			} else {
				this.hover.update(checkbox.tooltip);
			}
		}
	}

	private setCheckbox(node: ITreeItem) {
		if (this.toggle && node.checkbox) {
			node.checkbox.isChecked = this.toggle.checked;
			this.toggle.setIcon(this.toggle.checked ? Codicon.check : undefined);
			this.setHover(node.checkbox);

			this.setAccessibilityInformation(node.checkbox);
			this.checkboxStateHandler.setCheckboxState(node);
		}
	}

	private checkboxHoverContent(checkbox: ITreeItemCheckboxState): string {
		return checkbox.tooltip ? checkbox.tooltip :
			checkbox.isChecked ? localize('checked', 'Checked') : localize('unchecked', 'Unchecked');
	}

	private setAccessibilityInformation(checkbox: ITreeItemCheckboxState) {
		if (this.toggle && checkbox.accessibilityInformation) {
			this.toggle.domNode.ariaLabel = checkbox.accessibilityInformation.label;
			if (checkbox.accessibilityInformation.role) {
				this.toggle.domNode.role = checkbox.accessibilityInformation.role;
			}
		}
	}

	private removeCheckbox() {
		const children = this.checkboxContainer.children;
		for (const child of children) {
			this.checkboxContainer.removeChild(child);
		}
	}
}
