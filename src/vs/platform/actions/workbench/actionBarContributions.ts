/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {Registry} from 'vs/platform/platform';
import URI from 'vs/base/common/uri';
import {IAction} from 'vs/base/common/actions';
import {Scope, IActionBarRegistry, Extensions, ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import {IActionsService} from 'vs/platform/actions/common/actions';
import {IModeService} from 'vs/editor/common/services/modeService';
import {commands, Context} from '../common/commandsExtensionPoint';
import matches from 'vs/editor/common/modes/languageSelector';
import {getUntitledOrFileResource} from 'vs/workbench/common/editor';

class Contributor extends ActionBarContributor {

	constructor(
		@IModeService private _modeService: IModeService,
		@IActionsService private _actionsService: IActionsService
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
		if (!uri) {
			return [];
		}
		const ids = this._getCommandIds(uri, path);
		const actions: { [id: string]: IAction } = Object.create(null);
		const result: IAction[] = [];
		for (let action of this._actionsService.getActions()) {
			actions[action.id] = action;
		}
		for (let id of ids) {
			if (actions[id]) {
				result.push(actions[id]);
			}
		}
		return result;
	}

	private _getResource(context: any): URI {
		return getUntitledOrFileResource(context.input, true);
	}

	private _getCommandIds(resource: URI, path: string): string[] {
		const result: string[] = [];
		for (let command of commands) {
			const {context} = command;
			if (Array.isArray(context)) {
				if (context.some(context => this._matches(context, resource, path))) {
					result.push(command.command);
				}
			} else if (context && this._matches(context, resource, path)) {
				result.push(command.command);
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
}

Registry.as<IActionBarRegistry>(Extensions.Actionbar).registerActionBarContributor(Scope.EDITOR, Contributor);