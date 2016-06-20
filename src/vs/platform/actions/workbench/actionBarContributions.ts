/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {Registry} from 'vs/platform/platform';
import URI from 'vs/base/common/uri';
import {IAction, Action} from 'vs/base/common/actions';
import {BaseActionItem, ActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {Scope, IActionBarRegistry, Extensions, ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {isLightTheme} from 'vs/platform/theme/common/themes';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {commands, CommandAction, Locations} from '../common/commandsExtensionPoint';
import {EditorInput} from 'vs/workbench/common/editor';


abstract class BaseActionBarContributor extends ActionBarContributor {

	private _isReady: boolean = false;

	constructor(
		@IExtensionService private _extensionService: IExtensionService,
		@IInstantiationService private _instantationService: IInstantiationService,
		@IKeybindingService private _keybindingService: IKeybindingService
	) {
		super();
		this._extensionService.onReady().then(() => this._isReady = true);
	}

	protected abstract _wheres(): { primary: Locations; secondary: Locations };

	protected abstract _getResource(context: any): URI;

	public hasActions(context: any): boolean {
		return this._isReady && this._wheres().primary && this.getActions(context).length > 0;
	}

	public hasSecondaryActions(context: any): boolean {
		return this._isReady && this._wheres().secondary && this.getSecondaryActions(context).length > 0;
	}

	public getActions(context: any): IAction[] {
		return this._getActions(context, this._wheres().primary);
	}

	public getSecondaryActions(context: any): IAction[] {
		return this._getActions(context, this._wheres().secondary);
	}

	private _getActions(context: any, where: Locations): IAction[] {
		const result: IAction[] = [];

		for (let command of commands) {
			console.log(command.id, command.when,
				this._keybindingService.contextMatchesRules(command.when),
				this._keybindingService.getContextValue('resourceLangId'),
				this._keybindingService.getContextValue('resourceScheme')
			);
			if (command.where === where && this._keybindingService.contextMatchesRules(command.when)) {
				let resource = this._keybindingService.getContextValue<URI>('resource');

				result.push(this._instantationService.createInstance(class extends CommandAction {
					run() {
						return super.run(resource);
					}
				}, command));
			}
		}

		return result;
	}

	public getActionItem(context: any, action: Action): BaseActionItem {
		if (action instanceof CommandAction) {
			return this._instantationService.createInstance(CommandActionItem, action);
		}
	}
}

class EditorContributor extends BaseActionBarContributor {

	protected _wheres(): { primary: Locations; secondary: Locations } {
		return { primary: 'editor/primary', secondary: 'editor/secondary' };
	}
	protected _getResource(context: any): URI {
		const {input} = context;
		if (input instanceof EditorInput) {
			if (typeof input.getResource === 'function') {
				const candidate = input.getResource();
				if (candidate instanceof URI) {
					return candidate;
				}
			}
		}
	}
}

class CommandActionItem extends ActionItem {

	constructor(
		action: CommandAction,
		@IThemeService private _themeService: IThemeService
	) {
		super(undefined, action, {
			icon: !!(action.command.lightThemeIcon || action.command.darkThemeIcon),
			label: !(action.command.lightThemeIcon || action.command.darkThemeIcon)
		});

		this._themeService.onDidThemeChange(this._updateClass, this, this.callOnDispose);
	}

	_updateClass(): void {
		super._updateClass();
		const element = this.$e.getHTMLElement();
		const {lightThemeIcon, darkThemeIcon} = (<CommandAction>this._action).command;
		if (element.classList.contains('icon')) {
			if (isLightTheme(this._themeService.getTheme())) {
				element.style.backgroundImage = `url("${lightThemeIcon}")`;
			} else {
				element.style.backgroundImage = `url("${darkThemeIcon}")`;
			}
		}
	}

	onClick(event: Event): void {
		super.onClick(event);
	}
}

Registry.as<IActionBarRegistry>(Extensions.Actionbar).registerActionBarContributor(Scope.EDITOR, EditorContributor);