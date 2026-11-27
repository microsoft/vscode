/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { AGENTS_MODE_ENABLED_SETTING } from '../../../../services/configuration/browser/agents/agentsModeWorkspaceService.js';
import { AgentsModeActive, CanEnterAgentsMode, ToggleAgentsModeAction } from '../../browser/agentSessions/agentsModeActions.js';
import { AgentsModeAuxiliaryBar } from '../../browser/agentSessions/agentsModeAuxiliaryBar.js';
import { AgentsModeEditorArea } from '../../browser/agentSessions/agentsModeEditorArea.js';
import { AgentsModeButtonActionViewItem } from '../../browser/agentSessions/agentsModeButton.js';

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'chat',
	title: localize('chat.configurationTitle', "Chat"),
	properties: {
		[AGENTS_MODE_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			description: localize('agentsMode.enabled', "Enable toggling Agents mode in a local editor window. A window with a folder or workspace gets its folders back when it leaves the mode. Takes effect in a window after it is reloaded."),
		}
	}
});

class AgentsModeContribution extends Disposable {
	static readonly ID = 'workbench.contrib.agentsMode';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAgentsModeService agentsModeService: IAgentsModeService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		// Created also where the mode is not supported, to undo the layout of a window that restarts with it turned off
		const editorArea = this._register(instantiationService.createInstance(AgentsModeEditorArea));
		const auxiliaryBar = this._register(instantiationService.createInstance(AgentsModeAuxiliaryBar));
		if (!agentsModeService.isSupported) {
			return;
		}

		this._register(actionViewItemService.register(MenuId.TitleBarAdjacentCenter, ToggleAgentsModeAction.ID, (action, options) => {
			return instantiationService.createInstance(AgentsModeButtonActionViewItem, action, options);
		}));

		const canEnterContext = CanEnterAgentsMode.bindTo(contextKeyService);
		const modeActiveContext = AgentsModeActive.bindTo(contextKeyService);
		const update = () => contextKeyService.bufferChangeEvents(() => {
			const isActive = agentsModeService.isActive;
			modeActiveContext.set(isActive);
			canEnterContext.set(!isActive);
		});
		this._register(agentsModeService.onDidChange(active => {
			update();
			this.switchLayout(active, editorArea, auxiliaryBar).catch(onUnexpectedError);
		}));
		update();
	}

	/**
	 * Lays the window out for the mode once it switched: its settings, such as where the side bars are, applied already.
	 */
	private async switchLayout(entering: boolean, editorArea: AgentsModeEditorArea, auxiliaryBar: AgentsModeAuxiliaryBar): Promise<void> {
		if (entering) {
			await auxiliaryBar.enter();
			await editorArea.enter();
		} else {
			editorArea.leave();
			auxiliaryBar.leave();
		}
		// Last, as showing or hiding the editor area can squeeze the secondary side bar
		auxiliaryBar.applyWidth();
	}
}

registerWorkbenchContribution2(AgentsModeContribution.ID, AgentsModeContribution, WorkbenchPhase.BlockRestore);

registerAction2(ToggleAgentsModeAction);
