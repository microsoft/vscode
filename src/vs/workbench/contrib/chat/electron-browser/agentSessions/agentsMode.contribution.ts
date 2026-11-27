/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { AGENTS_MODE_ENABLED_SETTING } from '../../../../services/configuration/browser/agents/agentsModeWorkspaceService.js';
import { AgentsModeActive, CanEnterAgentsMode, ToggleAgentsModeAction } from '../../browser/agentSessions/agentsModeActions.js';
import { AgentsModeAuxiliaryBar } from '../../browser/agentSessions/agentsModeAuxiliaryBar.js';
import { AgentsModeEditorArea } from '../../browser/agentSessions/agentsModeEditorArea.js';
import { AgentsModeButtonActionViewItem } from '../../browser/agentSessions/agentsModeButton.js';

export class AgentsModeContribution extends Disposable {
	static readonly ID = 'workbench.contrib.agentsMode';

	/** Cancels the layout switch in progress, when the window switches again before it finished. */
	private readonly layoutSwitch = this._register(new MutableDisposable());

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAgentsModeService agentsModeService: IAgentsModeService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
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
		// Read only where the mode is supported, so builds without the mode never read the setting
		const update = () => contextKeyService.bufferChangeEvents(() => {
			const isActive = agentsModeService.isActive;
			modeActiveContext.set(isActive);
			canEnterContext.set(!isActive && configurationService.getValue(AGENTS_MODE_ENABLED_SETTING) === true);
		});
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AGENTS_MODE_ENABLED_SETTING)) {
				update();
			}
		}));
		this._register(agentsModeService.onDidChange(active => {
			update();
			const cancellation = new CancellationTokenSource();
			this.layoutSwitch.value = toDisposable(() => cancellation.dispose(true));
			this.switchLayout(active, editorArea, auxiliaryBar, cancellation.token).catch(onUnexpectedError);
		}));
		update();
	}

	/**
	 * Lays the window out for the mode once it switched: its settings, such as where the side bars are, applied already.
	 */
	private async switchLayout(entering: boolean, editorArea: AgentsModeEditorArea, auxiliaryBar: AgentsModeAuxiliaryBar, token: CancellationToken): Promise<void> {
		if (entering) {
			await auxiliaryBar.enter(token);
			if (token.isCancellationRequested) {
				return;
			}
			await editorArea.enter();
			if (token.isCancellationRequested) {
				return;
			}
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
