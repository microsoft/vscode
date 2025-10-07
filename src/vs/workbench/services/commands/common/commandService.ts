/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, notCancellablePromise, raceCancellablePromises, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CommandsRegistry, ICommandEvent, ICommandService } from '../../../../platform/commands/common/commands.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IExtensionService } from '../../extensions/common/extensions.js';

export class CommandService extends Disposable implements ICommandService {

	declare readonly _serviceBrand: undefined;

	private _extensionHostIsReady: boolean = false;
	private _starActivation: CancelablePromise<void> | null;

	private readonly _onWillExecuteCommand: Emitter<ICommandEvent> = this._register(new Emitter<ICommandEvent>());
	public readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

	private readonly _onDidExecuteCommand: Emitter<ICommandEvent> = new Emitter<ICommandEvent>();
	public readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._extensionService.whenInstalledExtensionsRegistered().then(value => this._extensionHostIsReady = value);
		this._starActivation = null;
	}

	private _activateStar(): Promise<void> {
		if (!this._starActivation) {
			// wait for * activation, limited to at most 30s.
			this._starActivation = raceCancellablePromises([
				this._extensionService.activateByEvent(`*`),
				timeout(30000)
			]);
		}

		// This is wrapped with notCancellablePromise so it doesn't get cancelled
		// early because it is shared between consumers.
		return notCancellablePromise(this._starActivation);
	}

	async executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
		this._logService.trace('CommandService#executeCommand', id);

		const activationEvent = `onCommand:${id}`;
		const commandIsRegistered = !!CommandsRegistry.getCommand(id);

		if (commandIsRegistered) {

			// if the activation event has already resolved (i.e. subsequent call),
			// we will execute the registered command immediately
			if (this._extensionService.activationEventIsDone(activationEvent)) {
				return this._tryExecuteCommand(id, args);
			}

			// if the extension host didn't start yet, we will execute the registered
			// command immediately and send an activation event, but not wait for it
			if (!this._extensionHostIsReady) {
				this._extensionService.activateByEvent(activationEvent); // intentionally not awaited
				return this._tryExecuteCommand(id, args);
			}

			// we will wait for a simple activation event (e.g. in case an extension wants to overwrite it)
			await this._extensionService.activateByEvent(activationEvent);
			return this._tryExecuteCommand(id, args);
		}

		// finally, if the command is not registered we will send a simple activation event
		// as well as a * activation event raced against registration and against 30s
		await Promise.all([
			this._extensionService.activateByEvent(activationEvent),
			raceCancellablePromises<unknown>([
				// race * activation against command registration
				this._activateStar(),
				Event.toPromise(Event.filter(CommandsRegistry.onDidRegisterCommand, e => e === id))
			]),
		]);

		return this._tryExecuteCommand(id, args);
	}

	private _tryExecuteCommand(id: string, args: unknown[]): Promise<any> {
		const command = CommandsRegistry.getCommand(id);
		if (!command) {
			return Promise.reject(new Error(`command '${id}' not found`));
		}
		try {
			this._onWillExecuteCommand.fire({ commandId: id, args });
			const result = this._instantiationService.invokeFunction(command.handler, ...args);
			this._onDidExecuteCommand.fire({ commandId: id, args });
			return Promise.resolve(result);
		} catch (err) {
			return Promise.reject(err);
		}
	}

	public override dispose(): void {
		super.dispose();
		this._starActivation?.cancel();
	}
}

registerSingleton(ICommandService, CommandService, InstantiationType.Delayed);
