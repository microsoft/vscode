/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ServicesAccessor, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../../../nls.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { KeybindingWeight, KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { UnifiedQuickAccess, DEFAULT_UNIFIED_QUICK_ACCESS_TABS, InUnifiedQuickAccessContext, SEND_TO_AGENT_COMMAND_ID } from './unifiedQuickAccess.js';

/**
 * Action ID for showing the unified quick access widget.
 */
const UNIFIED_QUICK_ACCESS_ACTION_ID = 'workbench.action.unifiedQuickAccess';

const PRECONDITION = ContextKeyExpr.and(
	ChatContextKeys.enabled,
);

/**
 * Workbench contribution that manages the lifecycle of the {@link UnifiedQuickAccess} instance.
 * Actions retrieve the instance from here instead of using a leaked module-level singleton.
 */
export class UnifiedQuickAccessContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.unifiedQuickAccess';

	private _instance: UnifiedQuickAccess | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	get instance(): UnifiedQuickAccess {
		if (!this._instance) {
			this._instance = this._register(
				this.instantiationService.createInstance(UnifiedQuickAccess, DEFAULT_UNIFIED_QUICK_ACCESS_TABS)
			);
		}
		return this._instance;
	}
}

// Hold a reference set by the contribution registration.
// Actions look this up via accessor.get(IInstantiationService) → contribution.
let _contributionInstance: UnifiedQuickAccessContribution | undefined;

/** @internal Called by the contribution registration to make the instance accessible to actions. */
export function _setUnifiedQuickAccessContribution(c: UnifiedQuickAccessContribution): void {
	_contributionInstance = c;
}

function getUnifiedQuickAccess(instantiationService: IInstantiationService): UnifiedQuickAccess {
	if (_contributionInstance) {
		return _contributionInstance.instance;
	}
	// Fallback: create via instantiation service if contribution hasn't been registered yet
	return instantiationService.createInstance(UnifiedQuickAccess, DEFAULT_UNIFIED_QUICK_ACCESS_TABS);
}

/**
 * Creates and registers an action that opens the unified quick access at a specific tab.
 */
function registerShowTabAction(id: string, title: ReturnType<typeof localize2>, tabId?: string): void {
	registerAction2(class extends Action2 {
		constructor() {
			super({ id, title, f1: true, precondition: PRECONDITION });
		}
		override run(accessor: ServicesAccessor): void {
			const instantiationService = accessor.get(IInstantiationService);
			getUnifiedQuickAccess(instantiationService).show(tabId);
		}
	});
}

// Register actions
registerShowTabAction(
	UNIFIED_QUICK_ACCESS_ACTION_ID,
	localize2('showAgentQuickAccess', "Show Agent Quick Access"),
);
registerShowTabAction(
	'workbench.action.showAgentSessionsQuickAccess',
	localize2('showAgentSessionsQuickAccess', "Show Agent Sessions"),
	'agentSessions',
);
registerShowTabAction(
	'workbench.action.showCommandsQuickAccess',
	localize2('showCommandsQuickAccess', "Show Commands (Unified)"),
	'commands',
);
registerShowTabAction(
	'workbench.action.showFilesQuickAccess',
	localize2('showFilesQuickAccess', "Show Files (Unified)"),
	'files',
);

// Register Shift+Enter keybinding to send message to agent from the unified quick access
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SEND_TO_AGENT_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: InUnifiedQuickAccessContext,
	primary: KeyMod.Shift | KeyCode.Enter,
	handler: (accessor) => {
		const instantiationService = accessor.get(IInstantiationService);
		getUnifiedQuickAccess(instantiationService).sendCurrentMessage();
	},
});
