/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMenu, MenuItemAction, IMenuActionOptions } from 'vs/platform/actions/common/actions';
import { IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { IAction } from 'vs/base/common/actions';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { domEvent } from 'vs/base/browser/event';
import { Emitter } from 'vs/base/common/event';


export function fillInActions(menu: IMenu, options: IMenuActionOptions, target: IAction[] | { primary: IAction[]; secondary: IAction[]; }, isPrimaryGroup: (group: string) => boolean = group => group === 'navigation'): void {
	const groups = menu.getActions(options);
	if (groups.length === 0) {
		return;
	}

	for (let tuple of groups) {
		let [group, actions] = tuple;
		if (isPrimaryGroup(group)) {

			const head = Array.isArray<IAction>(target) ? target : target.primary;

			// split contributed actions at the point where order
			// changes form lt zero to gte
			let pivot = 0;
			for (; pivot < actions.length; pivot++) {
				if ((<MenuItemAction>actions[pivot]).order >= 0) {
					break;
				}
			}
			// prepend contributed actions with order lte zero
			head.unshift(...actions.slice(0, pivot));

			// find the first separator which marks the end of the
			// navigation group - might be the whole array length
			let sep = 0;
			while (sep < head.length) {
				if (head[sep] instanceof Separator) {
					break;
				}
				sep++;
			}
			// append contributed actions with order gt zero
			head.splice(sep, 0, ...actions.slice(pivot));

		} else {
			const to = Array.isArray<IAction>(target) ? target : target.secondary;

			if (to.length > 0) {
				to.push(new Separator());
			}

			to.push(...actions);
		}
	}
}


export function createActionItem(action: IAction, keybindingService: IKeybindingService, messageService: IMessageService): ActionItem {
	if (action instanceof MenuItemAction) {
		return new MenuItemActionItem(action, keybindingService, messageService);
	}
	return undefined;
}


const _altKey = new class extends Emitter<boolean> {

	private _subscriptions: IDisposable[] = [];

	constructor() {
		super();

		this._subscriptions.push(domEvent(document.body, 'keydown')(e => this.fire(e.altKey)));
		this._subscriptions.push(domEvent(document.body, 'keyup')(e => this.fire(false)));
		this._subscriptions.push(domEvent(document.body, 'mouseleave')(e => this.fire(false)));
		this._subscriptions.push(domEvent(document.body, 'blur')(e => this.fire(false)));
	}

	dispose() {
		super.dispose();
		this._subscriptions = dispose(this._subscriptions);
	}
};

export class MenuItemActionItem extends ActionItem {

	private _wantsAltCommand: boolean = false;

	constructor(
		action: MenuItemAction,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IMessageService protected _messageService: IMessageService
	) {
		super(undefined, action, { icon: !!action.class, label: !action.class });
	}

	protected get _commandAction(): IAction {
		return this._wantsAltCommand && (<MenuItemAction>this._action).alt || this._action;
	}

	onClick(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();

		this.actionRunner.run(this._commandAction)
			.done(undefined, err => this._messageService.show(Severity.Error, err));
	}

	render(container: HTMLElement): void {
		super.render(container);

		let mouseOver = false;
		let altDown = false;

		const updateAltState = () => {
			const wantsAltCommand = mouseOver && altDown;
			if (wantsAltCommand !== this._wantsAltCommand) {
				this._wantsAltCommand = wantsAltCommand;
				this._updateLabel();
				this._updateTooltip();
				this._updateClass();
			}
		};

		this._callOnDispose.push(_altKey.event(value => {
			altDown = value;
			updateAltState();
		}));

		this._callOnDispose.push(domEvent(container, 'mouseleave')(_ => {
			mouseOver = false;
			updateAltState();
		}));

		this._callOnDispose.push(domEvent(container, 'mouseenter')(e => {
			mouseOver = true;
			updateAltState();
		}));
	}

	_updateLabel(): void {
		if (this.options.label) {
			this.$e.text(this._commandAction.label);
		}
	}

	_updateTooltip(): void {
		const element = this.$e.getHTMLElement();
		const keybinding = this._keybindingService.lookupKeybinding(this._commandAction.id);
		const keybindingLabel = keybinding && keybinding.getLabel();

		element.title = keybindingLabel
			? localize('titleAndKb', "{0} ({1})", this._commandAction.label, keybindingLabel)
			: this._commandAction.label;
	}

	_updateClass(): void {
		if (this.options.icon) {
			const element = this.$e.getHTMLElement();
			if (this._commandAction !== this._action) {
				element.classList.remove(this._action.class);
			} else if ((<MenuItemAction>this._action).alt) {
				element.classList.remove((<MenuItemAction>this._action).alt.class);
			}
			element.classList.add('icon', this._commandAction.class);
		}
	}
}
