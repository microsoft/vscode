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
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { memoize } from 'vs/base/common/decorators';

class AltKeyEmitter extends Emitter<boolean> {

	private _subscriptions: IDisposable[] = [];
	private _isPressed: boolean;

	private constructor(contextMenuService: IContextMenuService) {
		super();

		this._subscriptions.push(domEvent(document.body, 'keydown')(e => this.isPressed = e.altKey));
		this._subscriptions.push(domEvent(document.body, 'keyup')(e => this.isPressed = false));
		this._subscriptions.push(domEvent(document.body, 'mouseleave')(e => this.isPressed = false));
		this._subscriptions.push(domEvent(document.body, 'blur')(e => this.isPressed = false));
		// Workaround since we do not get any events while a context menu is shown
		this._subscriptions.push(contextMenuService.onDidContextMenu(() => this.isPressed = false));
	}

	get isPressed(): boolean {
		return this._isPressed;
	}

	set isPressed(value: boolean) {
		this._isPressed = value;
		this.fire(this._isPressed);
	}

	@memoize
	static getInstance(contextMenuService: IContextMenuService) {
		return new AltKeyEmitter(contextMenuService);
	}

	dispose() {
		super.dispose();
		this._subscriptions = dispose(this._subscriptions);
	}
}

export function fillInActions(menu: IMenu, options: IMenuActionOptions, target: IAction[] | { primary: IAction[]; secondary: IAction[]; }, contextMenuService: IContextMenuService, isPrimaryGroup: (group: string) => boolean = group => group === 'navigation'): void {
	const groups = menu.getActions(options);
	if (groups.length === 0) {
		return;
	}
	const altKey = AltKeyEmitter.getInstance(contextMenuService);

	for (let tuple of groups) {
		let [group, actions] = tuple;
		if (altKey.isPressed) {
			actions = actions.map(a => !!a.alt ? a.alt : a);
		}

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


export function createActionItem(action: IAction, keybindingService: IKeybindingService, messageService: IMessageService, contextMenuService: IContextMenuService): ActionItem {
	if (action instanceof MenuItemAction) {
		return new MenuItemActionItem(action, keybindingService, messageService, contextMenuService);
	}
	return undefined;
}

export class MenuItemActionItem extends ActionItem {

	private _wantsAltCommand: boolean = false;

	constructor(
		action: MenuItemAction,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IMessageService protected _messageService: IMessageService,
		@IContextMenuService private _contextMenuService: IContextMenuService
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

		this._callOnDispose.push(AltKeyEmitter.getInstance(this._contextMenuService).event(value => {
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
