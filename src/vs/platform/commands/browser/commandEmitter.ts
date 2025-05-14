/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommandService } from '../common/commands.js';
import { IWorkbenchContribution } from '../../../workbench/common/contributions.js';
import { LifecyclePhase } from '../../../workbench/services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../workbench/common/contributions.js';

interface ICommandEventDetail {
	commandId: string;
	args: any[];
}

// Custom event name
const COMMAND_EVENT = 'vscode:executeCommand';

class CommandEmitterContribution implements IWorkbenchContribution {
	private static initialized = false;

	constructor(
		@ICommandService private readonly commandService: ICommandService
	) {
		if (!CommandEmitterContribution.initialized) {
			// Listen for custom command events
			window.addEventListener(COMMAND_EVENT, ((event: CustomEvent<ICommandEventDetail>) => {
				const { commandId, args } = event.detail;
				this.commandService.executeCommand(commandId, ...(args || []));
			}) as EventListener);

			CommandEmitterContribution.initialized = true;
		}
	}
}

// Register as a workbench contribution
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(CommandEmitterContribution, LifecyclePhase.Restored);

/**
 * Utility to emit command execution events
 */
export class CommandEmitter {
	/**
	 * Emit a command execution event
	 * @param commandId The command identifier
	 * @param args Command arguments
	 */
	public static emit(commandId: string, ...args: any[]): void {
		const event = new CustomEvent<ICommandEventDetail>(COMMAND_EVENT, {
			detail: {
				commandId,
				args
			}
		});

		window.dispatchEvent(event);
	}
}
