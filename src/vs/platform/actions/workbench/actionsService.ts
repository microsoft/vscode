/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {localize} from 'vs/nls';
import {IAction} from 'vs/base/common/actions';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IActionsService} from '../common/actions';
import {commands, CommandAction} from '../common/commandsExtensionPoint';
import 'vs/platform/actions/workbench/actionBarContributions';

export default class ActionsService implements IActionsService {

	serviceId: any;

	private _extensionsActions: IAction[];

	constructor(
		@IExtensionService private _extensionService: IExtensionService,
		@IKeybindingService private _keybindingsService: IKeybindingService
	) {
		this._extensionService.onReady().then(() => this._extensionsActions = null);
	}

	getActions(): IAction[] {

		if (!this._extensionsActions) {
			this._extensionsActions = [];
			for (let command of commands) {

				const action = new CommandAction(command, this._extensionService, this._keybindingsService);
				action.order = Number.MAX_VALUE;
				action.label = command.category
					? localize('category.label', "{0}: {1}", command.category, command.title)
					: command.title;

				this._extensionsActions.push(action);
			}
		}

		return this._extensionsActions.slice(0);
	}
}
