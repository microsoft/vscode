/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { attachToggleStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITreeItem } from 'vs/workbench/common/views';

export class CheckboxStateHandler {
	private readonly _onDidChangeCheckboxState = new Emitter<ITreeItem[]>();
	readonly onDidChangeCheckboxState: Event<ITreeItem[]> = this._onDidChangeCheckboxState.event;

	constructor() { }

	public setCheckboxState(node: ITreeItem) {
		this._onDidChangeCheckboxState.fire([node]);
	}
}

export class TreeItemCheckbox extends Disposable {
	public toggle: Toggle | undefined;
	private checkboxContainer: HTMLDivElement;
	public isDisposed = false;

	public static readonly checkboxClass = 'custom-view-tree-node-item-checkbox';

	private readonly _onDidChangeState = new Emitter<boolean>();
	readonly onDidChangeState: Event<boolean> = this._onDidChangeState.event;

	constructor(container: HTMLElement, private checkboxStateHandler: CheckboxStateHandler, private themeService: IThemeService) {
		super();
		this.checkboxContainer = <HTMLDivElement>container;
	}

	public render(node: ITreeItem) {
		if (node.checkboxChecked !== undefined) {
			if (!this.toggle) {
				this.createCheckbox(node);
				this.registerListener(node);
			}
			else {
				this.toggle.checked = node.checkboxChecked;
				this.toggle.setIcon(this.toggle.checked ? Codicon.check : undefined);
			}
		}
	}

	private createCheckbox(node: ITreeItem) {
		if (node.checkboxChecked !== undefined) {
			this.toggle = new Toggle({
				isChecked: node.checkboxChecked,
				title: localize('check', "Check"),
				icon: node.checkboxChecked ? Codicon.check : undefined
			});

			this.toggle.domNode.classList.add(TreeItemCheckbox.checkboxClass);
			DOM.append(this.checkboxContainer, this.toggle.domNode);
			this.registerListener(node);
		}
	}

	private registerListener(node: ITreeItem) {
		if (this.toggle) {
			this._register(this.toggle);
			this._register(this.toggle.onChange(() => {
				this.setCheckbox(node);
			}));
			this._register(attachToggleStyler(this.toggle, this.themeService));
		}
	}

	private setCheckbox(node: ITreeItem) {
		if (this.toggle && node.checkboxChecked !== undefined) {
			node.checkboxChecked = this.toggle.checked;
			this.toggle.setIcon(this.toggle.checked ? Codicon.check : undefined);
			this.toggle.checked = this.toggle.checked;
			this.checkboxStateHandler.setCheckboxState(node);
		}
	}

	private removeCheckbox() {
		const children = this.checkboxContainer.children;
		for (const child of children) {
			this.checkboxContainer.removeChild(child);
		}
		this.toggle = undefined;
	}

	public override dispose() {
		super.dispose();
		this.removeCheckbox();
		this.isDisposed = true;
	}
}
