/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {Registry} from 'vs/platform/platform';
import URI from 'vs/base/common/uri';
import {IAction, Action} from 'vs/base/common/actions';
import {IDisposable} from 'vs/base/common/lifecycle';
import {BaseActionItem, ActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {Scope, IActionBarRegistry, Extensions, ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {isLightTheme} from 'vs/platform/theme/common/themes';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {commands, CommandAction, Command, Locations} from '../common/commandsExtensionPoint';
import matches from 'vs/editor/common/modes/languageSelector';
import {EditorInput} from 'vs/workbench/common/editor';

class ResolvedCommand {

	constructor(
		private _command: Command,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IThemeService private _themeService: IThemeService,
		@IModeService private _modeService: IModeService
	) {

	}

	matches(location: Locations, resource: URI): boolean {
		const {where, when} = this._command;
		if (!where || !when) {
			return false;
		}
		// (1) check for location
		if (Array.isArray<Locations>(where)) {
			if (where.every(where => where !== location)) {
				return false;
			}
		} else if (where !== location) {
			return false;
		}
		// (2) check for resource
		if (!matches(when, resource, this._modeService.getModeIdByFilenameOrFirstLine(resource.fsPath))) {
			return false;
		}

		return true;
	}

	createAction(resource: URI): ScopedCommandAction {
		return this._instantiationService.createInstance(ScopedCommandAction, this._command, resource);
	}
}

class ScopedCommandAction extends CommandAction {

	private _themeListener: IDisposable;

	constructor(
		command: Command,
		private _resource: URI,
		@IThemeService private _themeService: IThemeService,
		@IExtensionService extensionService: IExtensionService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(command, extensionService, keybindingService);
	}

	dispose() {
		this._themeListener.dispose();
		super.dispose();
	}

	get icon(): string {
		const {icon} = this.command;
		if (!icon) {
			return;
		}
		if (typeof icon === 'string') {
			return icon;
		} else {
			return isLightTheme(this._themeService.getTheme())
				? icon.light
				: icon.dark;
		}
	}

	run() {
		return super.run(this._resource);
	}
}

abstract class BaseActionBarContributor extends ActionBarContributor {

	private _isReady: boolean = false;
	private _contributedActions: ResolvedCommand[];

	constructor(
		@IExtensionService private _extensionService: IExtensionService,
		@IInstantiationService private _instantationService: IInstantiationService
	) {
		super();
		this._extensionService.onReady().then(() => {
			this._contributedActions = commands.map(command => _instantationService.createInstance(ResolvedCommand, command));
			this._isReady = true;
		});
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
		const uri = this._getResource(context);
		const result: IAction[] = [];
		if (uri) {
			for (let command of this._contributedActions) {
				if (command.matches(where, uri)) {
					result.push(command.createAction(uri));
				}
			}
		}
		return result;
	}

	public getActionItem(context: any, action: Action): BaseActionItem {
		if (action instanceof ScopedCommandAction) {
			return this._instantationService.createInstance(CommandActionItem, action);
		}
	}
}

class EditorContributor extends BaseActionBarContributor {

	protected _wheres(): { primary: Locations; secondary: Locations } {
		return { primary: 'editor/primary', secondary: 'editor/secondary' };
	}
	protected _getResource(context: any): URI {
		const {input, position, editor} = context;
		if (typeof position !== 'number' || !editor) {
			//todo@ben I get called two times with different
			//but very similar looking context-objects in case
			//an editor is created the first time
			return;
		}
		if (input instanceof EditorInput) {
			if (typeof input.getResource === 'function') {
				const candidate = context.input.getResource();
				if (candidate instanceof URI) {
					return candidate;
				}
			}
		}
	}
}

class ContextMenuContributor extends BaseActionBarContributor {

	protected _wheres(): { primary: Locations; secondary: Locations } {
		return { secondary: 'explorer/context', primary: undefined };
	}

	protected _getResource(context: any): URI {
		if (context.element) {
			if (context.element.resource instanceof URI) {
				return <URI> context.element.resource;
			}
		}
	}
}

class CommandActionItem extends ActionItem {

	constructor(
		action: ScopedCommandAction,
		@IThemeService private _themeService: IThemeService
	) {
		super(undefined, action, { icon: Boolean(action.icon), label: !Boolean(action.icon) });

		this._themeService.onDidThemeChange(this._updateClass, this, this.callOnDispose);
	}

	_updateClass(): void {
		super._updateClass();

		const element = this.$e.getHTMLElement();
		const {icon} = <ScopedCommandAction>this._action;
		if (icon && element.classList.contains('icon')) {
			element.style.backgroundImage = `url("${icon}")`;
		}
	}

	onClick(event: Event): void {
		super.onClick(event);
	}
}

Registry.as<IActionBarRegistry>(Extensions.Actionbar).registerActionBarContributor(Scope.EDITOR, EditorContributor);
Registry.as<IActionBarRegistry>(Extensions.Actionbar).registerActionBarContributor(Scope.VIEWER, ContextMenuContributor);