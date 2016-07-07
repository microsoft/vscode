/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ICommandService, CommandsRegistry} from 'vs/platform/commands/common/commands';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';

export class CommandService implements ICommandService {

	serviceId = ICommandService;

	constructor(
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IExtensionService private _extensionService: IExtensionService
	) {
		//
	}

	executeCommand<T>(id: string, ...args: any[]): TPromise<T> {

		const command = CommandsRegistry.getCommand(id);
		if (!command) {
			return TPromise.wrapError(new Error(`command '${id}' not found`));
		}

		return this._extensionService.activateByEvent(`onCommand:${id}`).then(_ => {
			try {
				const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command.handler].concat(args));
				return TPromise.as(result);
			} catch (err) {
				return TPromise.wrapError(err);
			}
		});
	}
}
