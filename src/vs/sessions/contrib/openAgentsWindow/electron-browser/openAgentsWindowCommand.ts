/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { INativeHostService, IOpenAgentsWindowOptions } from '../../../../platform/native/common/native.js';
import { AgentsWindowOpenSource } from '../../../../platform/window/common/window.js';
import { OPEN_AGENTS_WINDOW_COMMAND_ID } from '../../../../workbench/contrib/chat/common/constants.js';

export function registerOpenAgentsWindowCommand(): IDisposable {
	return CommandsRegistry.registerCommand(OPEN_AGENTS_WINDOW_COMMAND_ID, async (accessor, options?: IOpenAgentsWindowOptions) => {
		await accessor.get(INativeHostService).openAgentsWindow({
			...options,
			source: options?.source ?? AgentsWindowOpenSource.CommandPalette,
		});
	});
}
