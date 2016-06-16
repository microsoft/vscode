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
import {IModeService} from 'vs/editor/common/services/modeService';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {isLightTheme} from 'vs/platform/theme/common/themes';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {commands, Command, Context, Where, CommandAction} from '../common/commandsExtensionPoint';
import matches from 'vs/editor/common/modes/languageSelector';
import {getUntitledOrFileResource} from 'vs/workbench/common/editor';

class ContextAction extends CommandAction {

	constructor(
		public context: Context,
		public resource: URI,
		command: Command,
		@IExtensionService extensionService: IExtensionService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(command, extensionService, keybindingService);
	}

	run() {
		return super.run(this.resource);
	}
}

abstract class BaseActionBarContributor extends ActionBarContributor {

	constructor(
		@IModeService private _modeService: IModeService,
		@IExtensionService private _extensionService: IExtensionService,
		@IKeybindingService private _keybindingsService: IKeybindingService,
		@IThemeService private _themeService: IThemeService
	) {
		super();
	}

	protected abstract _wheres(): { primary: Where; secondary: Where };

	public hasActions(context: any): boolean {
		return this._wheres().primary && this.getActions(context).length > 0;
	}

	public getActions(context: any): IAction[] {
		return this._getActions(context, this._wheres().primary);
	}

	public hasSecondaryActions(context: any): boolean {
		return this._wheres().secondary && this.getSecondaryActions(context).length > 0;
	}

	public getSecondaryActions(context: any): IAction[] {
		return this._getActions(context, this._wheres().secondary);
	}

	private _getActions(context: any, where: string): IAction[]{
		const uri = this._getResource(context);
		if (uri) {
			return this._getCommandActions(uri, where);
		}
		return [];
	}

	protected abstract _getResource(context: any): URI;

	private _getCommandActions(resource: URI, where: string): IAction[] {
		const result: IAction[] = [];
		for (let command of commands) {
			const {context} = command;
			if (Array.isArray(context)) {
				for (let ctx of context) {
					if (this._matches(ctx, resource, where)) {
						result.push(new ContextAction(ctx, resource, command, this._extensionService, this._keybindingsService));
						break;
					}
				}
			} else if (context && this._matches(context, resource, where)) {
				result.push(new ContextAction(context, resource, command, this._extensionService, this._keybindingsService));
			}
		}
		return result;
	}

	private _matches(context: Context, resource: URI, where: string): boolean {
		if (context.where !== where) {
			return false;
		}
		const language = this._modeService.getModeIdByFilenameOrFirstLine(resource.fsPath);
		return matches(context.when, resource, language);
	}

	public getActionItem(context: any, action: Action): BaseActionItem {
		if (action instanceof ContextAction) {
			const uri = this._getResource(context);
			return new CommandItem(uri, action, this._themeService);
		}
	}
}

class EditorContributor extends BaseActionBarContributor {

	protected _wheres(): { primary: Where; secondary: Where } {
		return { primary: 'editor/primary', secondary: 'editor/secondary' };
	}
	protected _getResource(context: any): URI {
		if (!context.input || !context.editor) {
			return;
		}
		let candidate: URI;
		candidate = getUntitledOrFileResource(context.input, true);
		if(candidate) {
			return candidate;
		}
		if (typeof context.input.getResource === 'function') {
			candidate = context.input.getResource();
			if (candidate instanceof URI) {
				return candidate;
			}
		}
	}
}

class ContextMenuContributor extends BaseActionBarContributor {

	protected _wheres(): { primary: Where; secondary: Where } {
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

class CommandItem extends ActionItem {

	constructor(
		context: any,
		action: ContextAction,
		@IThemeService private _themeService: IThemeService
	) {
		super(context, action, { icon: Boolean(action.context.icon), label: !Boolean(action.context.icon) });

		if (typeof action.context.icon === 'object') {
			this._themeService.onDidThemeChange(this._updateIcon, this, this.callOnDispose);
		}
	}

	_updateClass(): void {
		super._updateClass();
		this._updateIcon();
	}

	private _updateIcon(): void {
		const element = this.$e.getHTMLElement();

		const {context: {icon}} = <ContextAction>this._action;
		let iconUri: string;

		if (element.classList.contains('icon')) {
			if (!icon) {
				return;
			} else if (typeof icon === 'string') {
				iconUri = icon;
			} else {
				iconUri = isLightTheme(this._themeService.getTheme())
					? icon.light
					: icon.dark;
			}
			element.style.backgroundImage = `url("${iconUri}")`;
		}
	}
}

Registry.as<IActionBarRegistry>(Extensions.Actionbar).registerActionBarContributor(Scope.EDITOR, EditorContributor);
Registry.as<IActionBarRegistry>(Extensions.Actionbar).registerActionBarContributor(Scope.VIEWER, ContextMenuContributor);