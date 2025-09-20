/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import type { IManagedHover } from '../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import type { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ITreeItem, ITreeItemCheckboxState } from '../../../common/views.js';

export class CheckboxStateHandler extends Disposable {
	private readonly _onDidChangeCheckboxState = this._register(new Emitter<ITreeItem[]>());
	readonly onDidChangeCheckboxState: Event<ITreeItem[]> = this._onDidChangeCheckboxState.event;

	public setCheckboxState(node: ITreeItem) {
		this._onDidChangeCheckboxState.fire([node]);
	}
}

export class TreeItemCheckbox extends Disposable {
	private checkbox: Checkbox | undefined;
	private readonly checkboxContainer: HTMLDivElement;
	private hover: IManagedHover | undefined;

	public static readonly checkboxClass = 'custom-view-tree-node-item-checkbox';

	constructor(
		container: HTMLElement,
		private readonly checkboxStateHandler: CheckboxStateHandler,
		private readonly hoverDelegate: IHoverDelegate,
		private readonly hoverService: IHoverService
	) {
		super();
		this.checkboxContainer = <HTMLDivElement>container;
	}

	public render(node: ITreeItem) {
		if (node.checkbox) {
			if (!this.checkbox) {
				this.createCheckbox(node);
			}
			else {
				this.checkbox.checked = node.checkbox.isChecked;
			}
		}
	}

	private createCheckbox(node: ITreeItem) {
		if (node.checkbox) {
			this.checkbox = new Checkbox(
				'',
				node.checkbox.isChecked,
				{
					...defaultCheckboxStyles,
					hoverDelegate: this.hoverDelegate
				}
			);
			this.setHover(node.checkbox);
			this.setAccessibilityInformation(node.checkbox);
			this.checkbox.domNode.classList.add(TreeItemCheckbox.checkboxClass);
			this.checkbox.domNode.tabIndex = 1;
			DOM.append(this.checkboxContainer, this.checkbox.domNode);
			this.registerListener(node);
		}
	}

	private registerListener(node: ITreeItem) {
		if (this.checkbox) {
			this._register({ dispose: () => this.removeCheckbox() });
			this._register(this.checkbox);
			this._register(this.checkbox.onChange(() => {
				this.setCheckbox(node);
			}));
		}
	}

	private setHover(checkbox: ITreeItemCheckboxState) {
		if (this.checkbox) {
			if (!this.hover) {
				this.hover = this._register(this.hoverService.setupManagedHover(this.hoverDelegate, this.checkbox.domNode, this.checkboxHoverContent(checkbox)));
			} else {
				this.hover.update(checkbox.tooltip);
			}
		}
	}

	private setCheckbox(node: ITreeItem) {
		if (this.checkbox && node.checkbox) {
			node.checkbox.isChecked = this.checkbox.checked;
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
		if (this.checkbox && checkbox.accessibilityInformation) {
			this.checkbox.domNode.ariaLabel = checkbox.accessibilityInformation.label;
			if (checkbox.accessibilityInformation.role) {
				this.checkbox.domNode.role = checkbox.accessibilityInformation.role;
			}
		}
	}

	private removeCheckbox() {
		const children = this.checkboxContainer.children;
		for (const child of children) {
			child.remove();
		}
	}
}
