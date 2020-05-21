/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export const ICoreCommandsService = createDecorator<ICoreCommandsService>('ICoreCommandsService');

export interface ICoreCommandsService {
	_serviceBrand: undefined;

	/**
	 * Registers an override for a core command.
	 *
	 * When a command is run with `tryRun`, the overrides are checked sequentially to find the first one that
	 * can successfully run the command.
	 */
	registerOverride(command: CoreCommand, override: CoreCommandOverride): IDisposable;

	/**
	 * Try to run the command.
	 *
	 * @return `true` if the command was successfully run. This stops other overrides from being executed.
	 */
	tryRun(command: CoreCommand, accessor: ServicesAccessor, args: unknown): boolean;
}

export const enum CoreCommand {
	Undo,
	Redo,
}

/**
 * Potential implementation of a core command.
 *
 * @return `true` if the command was successfully run. This stops other overrides from being executed.
 */
export type CoreCommandOverride = (accessor: ServicesAccessor, args: unknown) => boolean;

export class CoreCommandsService implements ICoreCommandsService {
	_serviceBrand: undefined;

	private readonly _overrides = new Map<CoreCommand, Set<CoreCommandOverride>>();

	public registerOverride(command: CoreCommand, implementation: CoreCommandOverride): IDisposable {
		let entry = this._overrides.get(command);
		if (!entry) {
			entry = new Set();
			this._overrides.set(command, entry);
		}
		entry.add(implementation);

		return toDisposable(() => {
			entry?.delete(implementation);
		});
	}

	public tryRun(command: CoreCommand, accessor: ServicesAccessor, args: unknown): boolean {
		for (const override of this._overrides.get(command) || []) {
			if (override(accessor, args)) {
				return true;
			}
		}
		return false;
	}
}
