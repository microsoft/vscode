/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ModelPickerToolbarsContribution, registerModelPickerAction } from '../../../browser/chat/modelPicker.js';
import { registerSharedChatInputComposerToolbar, SharedChatInputComposerContribution } from '../../../browser/chat/sharedChatInputComposerToolbar.js';
import { AgentHostAgentPickerContribution, registerAgentHostAgentPickerActions } from '../../agentHost/browser/agentHostAgentPicker.js';
import { AgentHostSessionConfigPickerContribution, registerAgentHostSessionConfigPickerActions } from '../../agentHost/browser/agentHostSessionConfigPicker.js';
import { CopilotPickerActionViewItemContribution, registerCopilotSandboxPickerActions } from '../../copilotChatSessions/browser/copilotSandboxPickers.js';

/** The agent host's pickers as an editor window's chat part has them: without the isolation picker of a new session, whose workspace picker offers New Worktree instead. */
export class EditorWindowAgentHostSessionConfigPickerContribution extends AgentHostSessionConfigPickerContribution {
	protected override showsRepositoryProperty(isIsolation: boolean, isNewSession: boolean): boolean {
		return !(isIsolation && isNewSession);
	}
}

/**
 * Registers the controls of the new-session composers and of the session chats of an editor window's chat part, as the
 * Agents window has them, until the returned disposable is disposed: the composer's Add Context, model, agent, mode and
 * approvals pickers, its repository controls, and the pickers of a running session's chat input.
 */
export function registerAgentsViewComposerControls(accessor: ServicesAccessor): IDisposable {
	const instantiationService = accessor.get(IInstantiationService);
	const store = new DisposableStore();
	store.add(registerSharedChatInputComposerToolbar());
	store.add(registerModelPickerAction());
	store.add(registerAgentHostAgentPickerActions());
	store.add(registerAgentHostSessionConfigPickerActions());
	store.add(registerCopilotSandboxPickerActions());
	store.add(instantiationService.createInstance(SharedChatInputComposerContribution));
	store.add(instantiationService.createInstance(ModelPickerToolbarsContribution));
	store.add(instantiationService.createInstance(AgentHostAgentPickerContribution));
	store.add(instantiationService.createInstance(AgentHostSessionConfigPickerContribution));
	store.add(instantiationService.createInstance(CopilotPickerActionViewItemContribution));
	return store;
}
