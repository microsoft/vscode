/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line code-import-patterns
import { IDisposable } from 'node-pty';
import * as DOM from 'vs/base/browser/dom';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
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

export class TreeItemCheckbox implements IDisposable {
	public toggle: Toggle | undefined;
	//public checkbox: HTMLInputElement | undefined;
	private checkboxContainer: HTMLDivElement;
	private disposables: IDisposable[];

	public static readonly checkboxClass = 'custom-view-tree-node-item-checkbox';

	private readonly _onDidChangeState = new Emitter<boolean>();
	readonly onDidChangeState: Event<boolean> = this._onDidChangeState.event;

	constructor(container: HTMLElement, private checkboxStateHandler: CheckboxStateHandler, private themeService: IThemeService) {
		this.disposables = [];
		this.checkboxContainer = <HTMLDivElement>container;
	}

	public render(node: ITreeItem) {
		if (node.checkboxChecked !== undefined) {
			if (!this.toggle) {
				this.createCheckbox(node);
			}
			else {
				this.toggle.checked = node.checkboxChecked;
				this.toggle.setIcon(this.toggle.checked ? Codicon.check : undefined);
			}
			// The listener might be disposed when out of view,
			// so it will have to be recreated when it's back in view
			if (!this.disposables.length) {
				this.registerListener(node);
			}
		}
	}

	private createCheckbox(node: ITreeItem) {
		/* this.checkbox = <HTMLInputElement>DOM.append(this.checkboxContainer, DOM.$('input.custom-view-tree-node-item-checkbox'));
		this.checkbox.type = 'checkbox';
		this.checkbox.checked = node.checkbox?.isChecked ? node.checkbox.isChecked : false; */
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
			this.disposables.push(DOM.addDisposableListener(this.toggle.domNode, DOM.EventType.MOUSE_DOWN, (e) => {
				if (e.button === /* Right */ 2) {
					return;
				}
				e.stopPropagation();
				e.preventDefault();
			}));
			this.disposables.push(this.toggle.onChange(() => {
				this.setCheckbox(node);
			}));
			this.disposables.push(attachToggleStyler(this.toggle, this.themeService)); // DO I REALLY NEED THIS?
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

	public removeCheckbox() {
		this.dispose();
		const children = this.checkboxContainer.children;
		for (const child of children) {
			this.checkboxContainer.removeChild(child);
		}
		this.toggle = undefined;
	}

	public dispose() {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}
