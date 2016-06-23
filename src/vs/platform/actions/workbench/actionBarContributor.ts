/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import {localize} from 'vs/nls';
import {defaultGenerator} from 'vs/base/common/idGenerator';
import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {MenuLocation, MenuItem, IMenuService} from 'vs/platform/actions/common/actions';
import {ResourceContextKey} from 'vs/platform/actions/common/resourceContextKey';
import {Action, IAction} from 'vs/base/common/actions';
import {BaseActionItem, ActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {isLightTheme} from 'vs/platform/theme/common/themes';
import {domEvent} from 'vs/base/browser/event';

export class ActionBarContributor {

	private _scope: HTMLElement;
	private _onDidUpdate = new Emitter<this>();
	private _disposables: IDisposable[] = [];
	private _menuItems: MenuItem[] = [];

	constructor(
		scope: HTMLElement,
		location: MenuLocation,
		@IMenuService private _menuService: IMenuService,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IExtensionService private _extensionService: IExtensionService,
		@IThemeService private _themeService: IThemeService
	) {
		this._scope = scope;
		this._extensionService.onReady().then(() => {

			let usesWhen = false;
			let menuItems = this._menuService.getMenuItems(location);
			if (menuItems) {
				for (let item of menuItems) {
					if (!item.command) {
						// warn!
						continue;
					}
					if (item.when) {
						//TODO@joh - extract keys for better eventing
						usesWhen = true;
					}
					// we want this
					this._menuItems.push(item);
				}
				if (usesWhen) {
					this._keybindingService.onDidChangeContext(keys => this._onDidUpdate.fire(), undefined, this._disposables);
				}
			}
			this._onDidUpdate.fire();
		});
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}

	get onDidUpdate(): Event<this> {
		return this._onDidUpdate.event;
	}

	getActions(): IAction[] {
		const result: IAction[] = [];
		for (let item of this._menuItems) {
			if (this._keybindingService.contextMatchesRules(this._scope, item.when)) {
				result.push(new MenuItemAction(item,
					this._keybindingService.getContextValue<URI>(this._scope, ResourceContextKey.Resource),
					this._keybindingService));
			}
		}
		console.log('ACTIONS', result.map(r => r.id));
		return result;
	}

	getActionItem(action: IAction): BaseActionItem {
		if (action instanceof MenuItemAction) {
			return new MenuItemActionItem(action, this._themeService, this._keybindingService);
		}
	}
}

class MenuItemAction extends Action {

	constructor(
		private _item: MenuItem,
		private _resource: URI,
		@IKeybindingService private _keybindingService: IKeybindingService
	) {
		super(defaultGenerator.nextId(), _item.command.title);
	}

	get command() {
		return this._item.command;
	}

	get altCommand() {
		return this._item.alt;
	}

	get selectedCommand() {
		return this.command;
	}

	run(alt: boolean) {
		const {id} = alt && this._item.alt || this._item.command;
		return this._keybindingService.executeCommand(id, this._resource);
	}
}

class MenuItemActionItem extends ActionItem {

	private _altKeyDown: boolean = false;

	constructor(
		action: MenuItemAction,
		@IThemeService private _themeService: IThemeService,
		@IKeybindingService private _keybindingService: IKeybindingService
	) {
		super(undefined, action, { icon: true, label: false });

		this._callOnDispose.push(this._themeService.onDidThemeChange(_ => this._updateClass()));
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
			const {darkThemeIcon, lightThemeIcon} = this.command;
			const themeId = this._themeService.getTheme();
			element.classList.add('icon');
			element.style.backgroundImage = `url("${isLightTheme(themeId) ? lightThemeIcon : darkThemeIcon}")`;
		}
	}
}
