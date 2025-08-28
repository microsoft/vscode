/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import './erdosCommands.js'; // Import to register actions

/**
 * Erdos Commands Contribution.
 * Registers data science commands with keyboard shortcuts.
 * Uses Action2 pattern instead of direct keybinding registration for better maintainability.
 */
class ErdosCommandsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.erdosCommands';

	constructor() {
		super();
		// Commands are registered via the import above
		// This contribution ensures they're loaded at the right time
	}
}

// Register the Erdos Commands contribution
registerWorkbenchContribution2(ErdosCommandsContribution.ID, ErdosCommandsContribution, WorkbenchPhase.BlockRestore);
