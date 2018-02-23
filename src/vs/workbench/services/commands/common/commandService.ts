/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService, ICommandEvent, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import Event, { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';

export class CommandService extends Disposable implements ICommandService {

	_serviceBrand: any;

	private _extensionHostIsReady: boolean = false;

	private _onWillExecuteCommand: Emitter<ICommandEvent> = this._register(new Emitter<ICommandEvent>());
	public readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._extensionService.whenInstalledExtensionsRegistered().then(value => this._extensionHostIsReady = value);
	}

	executeCommand<T>(id: string, ...args: any[]): TPromise<T> {
		this._logService.trace('CommandService#executeCommand', id);

		// we always send an activation event, but
		// we don't wait for it when the extension
		// host didn't yet start and the command is already registered

		const activation = this._extensionService.activateByEvent(`onCommand:${id}`);
		const commandIsRegistered = !!CommandsRegistry.getCommand(id);

		if (!this._extensionHostIsReady && commandIsRegistered) {
			return this._tryExecuteCommand(id, args);
		} else {
			let waitFor: TPromise<any> = activation;
			if (!commandIsRegistered) {
				waitFor = TPromise.join([activation, this._extensionService.activateByEvent(`*`)]);
			}
			return waitFor.then(_ => this._tryExecuteCommand(id, args));
		}
	}

	private _tryExecuteCommand(id: string, args: any[]): TPromise<any> {
		const command = CommandsRegistry.getCommand(id);
		if (!command) {
			return TPromise.wrapError(new Error(`command '${id}' not found`));
		}
		try {
			this._onWillExecuteCommand.fire({ commandId: id });
			const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command.handler].concat(args));
			return TPromise.as(result);
		} catch (err) {
			return TPromise.wrapError(err);
		}
	}
}
