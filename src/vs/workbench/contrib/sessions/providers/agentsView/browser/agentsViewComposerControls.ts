/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../../../base/common/observable.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { ISessionHostService } from '../../../../../services/sessions/browser/sessionHost.js';
import { IChatPhoneInputPresenter } from '../../../../chat/browser/widget/input/chatPhoneInputPresenter.js';
import { ISessionsService } from '../../../browser/sessionsService.js';
import { IChatViewFactory } from '../../../browser/chatViewFactory.js';
import { IEditorWindowComposerFoldersService } from '../../../browser/editorWindow/editorWindowComposerFolders.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ModelPickerToolbarsContribution, registerModelPickerAction } from '../../../browser/chat/modelPicker.js';
import { registerSharedChatInputComposerToolbar, SharedChatInputComposerContribution } from '../../../browser/chat/sharedChatInputComposerToolbar.js';
import { AgentHostAgentPickerContribution, registerAgentHostAgentPickerActions } from '../../agentHost/browser/agentHostAgentPicker.js';
import { AgentHostSessionConfigPickerContribution, registerAgentHostSessionConfigPickerActions } from '../../agentHost/browser/agentHostSessionConfigPicker.js';
import { CopilotPickerActionViewItemContribution, registerCopilotSandboxPickerActions } from '../../copilotChatSessions/browser/copilotSandboxPickers.js';

/**
 * The agent host's pickers as an editor window's chat part has them: without the isolation picker of a new session while its
 * workspace picker offers New Worktree instead, which it does for a composer restricted to folders. A window without folders
 * restricts none, and keeps the isolation picker.
 */
export class EditorWindowAgentHostSessionConfigPickerContribution extends AgentHostSessionConfigPickerContribution {

	private readonly _restrictsComposers: IObservable<boolean> | undefined;

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionHostService sessionHostService: ISessionHostService,
		@IChatPhoneInputPresenter phonePresenter: IChatPhoneInputPresenter,
		@IChatViewFactory chatViewFactory: IChatViewFactory,
		@IEditorWindowComposerFoldersService composerFoldersService: IEditorWindowComposerFoldersService,
	) {
		super(actionViewItemService, layoutService, contextKeyService, sessionsProvidersService, sessionsService, sessionHostService, phonePresenter, chatViewFactory);
		const allowedFolders = composerFoldersService.getComposerFolderOptions().allowedFolders;
		const restrictsComposers = this._restrictsComposers = derived(this, reader => !!allowedFolders && allowedFolders.read(reader).length > 0);
		// The base class shows its controls as it is created, before the folders are known: with the isolation control
		let shown = false;
		this._register(autorun(reader => {
			const restricts = restrictsComposers.read(reader);
			if (restricts !== shown) {
				shown = restricts;
				this.refreshRepositoryProperties();
			}
		}));
	}

	protected override showsRepositoryProperty(isIsolation: boolean, isNewSession: boolean): boolean {
		return !(isIsolation && isNewSession && !!this._restrictsComposers?.get());
	}
}

/** Instantiates the contributions of the composer controls of an editor window's chat part, until the returned disposable is disposed. */
export function createAgentsViewComposerContributions(instantiationService: IInstantiationService): IDisposable {
	const store = new DisposableStore();
	store.add(instantiationService.createInstance(SharedChatInputComposerContribution));
	store.add(instantiationService.createInstance(ModelPickerToolbarsContribution));
	store.add(instantiationService.createInstance(AgentHostAgentPickerContribution));
	store.add(instantiationService.createInstance(EditorWindowAgentHostSessionConfigPickerContribution));
	store.add(instantiationService.createInstance(CopilotPickerActionViewItemContribution));
	return store;
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
	store.add(createAgentsViewComposerContributions(instantiationService));
	return store;
}
