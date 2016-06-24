/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {localize} from 'vs/nls';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {MenuItemAction} from 'vs/platform/actions/common/actions';
import {IAction} from 'vs/base/common/actions';
import {ActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {domEvent} from 'vs/base/browser/event';

export function createActionItem(action: IAction, keybindingService: IKeybindingService): ActionItem {
	if (action instanceof MenuItemAction) {
		return new MenuItemActionItem(action, keybindingService);
	}
}

class MenuItemActionItem extends ActionItem {

	private _altKeyDown: boolean = false;

	constructor(
		action: MenuItemAction,
		@IKeybindingService private _keybindingService: IKeybindingService
	) {
		super(undefined, action, { icon: !!action.command.iconClass, label: !action.command.iconClass });
	}

	private get command() {
		const {command, altCommand} = <MenuItemAction>this._action;
		return this._altKeyDown && altCommand || command;
	}

	onClick(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();

		(<MenuItemAction>this._action).run(this._altKeyDown).done(undefined, console.error);
	}

	render(container: HTMLElement): void {
		super.render(container);

		this._callOnDispose.push(domEvent(container, 'mousemove')(e => {
			if (this._altKeyDown !== e.altKey) {
				this._altKeyDown = e.altKey;

				this._updateLabel();
				this._updateTooltip();
				this._updateClass();
			}
		}));
	}

	_updateLabel(): void {
		if (this.options.label) {
			this.$e.text(this.command.title);
		}
	}

	_updateTooltip(): void {
		const element = this.$e.getHTMLElement();
		const keybinding = this._keybindingService.lookupKeybindings(this.command.id)[0];
		const keybindingLabel = keybinding && this._keybindingService.getLabelFor(keybinding);

		element.title = keybindingLabel
			? localize('titleAndKb', "{0} ({1})", this.command.title, keybindingLabel)
			: this.command.title;
	}

	_updateClass(): void {
		if (this.options.icon) {
			const element = this.$e.getHTMLElement();
			const {iconClass} = this.command;
			element.classList.add('icon', iconClass);
		}
	}
}
