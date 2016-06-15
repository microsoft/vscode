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
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {commands, Context, createAction} from '../common/commandsExtensionPoint';
import matches from 'vs/editor/common/modes/languageSelector';
import {getUntitledOrFileResource} from 'vs/workbench/common/editor';

class Contributor extends ActionBarContributor {

	constructor(
		@IModeService private _modeService: IModeService,
		@IExtensionService private _extensionService: IExtensionService,
		@IKeybindingService private _keybindingsService: IKeybindingService
	) {
		super();
	}

	public hasActions(context: any): boolean {
		return this.getActions(context).length > 0;
	}

	public getActions(context: any): IAction[] {
		return this._getActions(context, 'editor/primary');
	}

	public hasSecondaryActions(context: any): boolean {
		return this.getSecondaryActions(context).length > 0;
	}

	public getSecondaryActions(context: any): IAction[] {
		return this._getActions(context, 'editor/secondary');
	}

	private _getActions(context: any, path: string): IAction[]{
		const uri = this._getResource(context);
		if (uri) {
			return this._getCommandActions(uri, path);
		}
		return [];
	}

	private _getResource(context: any): URI {
		if (context.input  !== void 0 && context.editor  !== void 0 && context.position !== void 0 ) {
			return getUntitledOrFileResource(context.input, true);
		}
	}

	private _getCommandActions(resource: URI, path: string): IAction[] {
		const result: IAction[] = [];
		for (let command of commands) {
			const {context} = command;
			if (Array.isArray(context)) {
				if (context.some(context => this._matches(context, resource, path))) {
					result.push(createAction(command, this._extensionService, this._keybindingsService));
				}
			} else if (context && this._matches(context, resource, path)) {
				result.push(createAction(command, this._extensionService, this._keybindingsService));
			}
		}
		return result;
	}

	private _matches(context: Context, resource: URI, path: string): boolean {
		if (context.path === path) {
			const language = this._modeService.getModeIdByFilenameOrFirstLine(resource.fsPath);
			return matches(context.when, resource, language);
		}
	}

	public getActionItem(context: any, action: Action): BaseActionItem {
		if (this.hasActions(context)) {
			const uri = this._getResource(context);
			return new CommandItem(uri, action);
		}
	}
}

class CommandItem extends ActionItem {

	constructor(context: any, action: IAction) {
		super(context, action, { icon: !!action.class, label: !action.class });
	}
}

Registry.as<IActionBarRegistry>(Extensions.Actionbar).registerActionBarContributor(Scope.EDITOR, Contributor);