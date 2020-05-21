/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export const ICoreCommandsService = createDecorator<ICoreCommandsService>('ICoreCommandsService');

export interface ICoreCommandsService {
	_serviceBrand: unknown;

	register(command: CoreCommand, implementation: CoreCommandImplementation): IDisposable;

	tryRun(command: CoreCommand, accessor: ServicesAccessor, args: unknown): boolean;
}

export const enum CoreCommand {
	Undo,
	Redo,
}

export interface CoreCommandImplementation {
	tryRunCommand(accessor: ServicesAccessor, args: unknown): boolean;
}


export class CoreCommandsService implements ICoreCommandsService {
	_serviceBrand: unknown;

	private readonly _coreCommands = new Map<CoreCommand, Set<CoreCommandImplementation>>();

	public register(command: CoreCommand, implementation: CoreCommandImplementation): IDisposable {
		let entry = this._coreCommands.get(command);
		if (!entry) {
			entry = new Set();
			this._coreCommands.set(command, entry);
		}
		entry.add(implementation);

		return toDisposable(() => {
			entry?.delete(implementation);
		});
	}

	public tryRun(command: CoreCommand, accessor: ServicesAccessor, args: unknown): boolean {
		for (const impl of this._coreCommands.get(command) || []) {
			if (impl.tryRunCommand(accessor, args)) {
				return true;
			}
		}
		return false;
	}
}
