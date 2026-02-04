/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerWorkbenchContribution2, WorkbenchPhase, IWorkbenchContribution } from '../../../common/contributions.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { AuxiliaryBarMaximizedContext } from '../../../common/contextkeys.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { AgentSessionsWelcomeInput } from './agentSessionsWelcomeInput.js';
import { AgentSessionsWelcomePage, AgentSessionsWelcomeInputSerializer } from './agentSessionsWelcome.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';

// Registration priority
const agentSessionsWelcomeInputTypeId = 'workbench.editors.agentSessionsWelcomeInput';

// Register editor serializer
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(agentSessionsWelcomeInputTypeId, AgentSessionsWelcomeInputSerializer);

// Register editor pane
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		AgentSessionsWelcomePage,
		AgentSessionsWelcomePage.ID,
		localize('agentSessionsWelcome', "Agent Sessions Welcome")
	),
	[
		new SyncDescriptor(AgentSessionsWelcomeInput)
	]
);

const getWorkspaceKind = (workspaceContextService: IWorkspaceContextService) => {
	const state = workspaceContextService.getWorkbenchState();
	switch (state) {
		case WorkbenchState.EMPTY:
			return 'empty';
		case WorkbenchState.FOLDER:
			return 'folder';
		case WorkbenchState.WORKSPACE:
			return 'workspace';
		default:
			return 'empty';

	}
};

// Register resolver contribution
class AgentSessionsWelcomeEditorResolverContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentSessionsWelcomeEditorResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${AgentSessionsWelcomeInput.RESOURCE.scheme}:${AgentSessionsWelcomeInput.RESOURCE.authority}/**`,
			{
				id: AgentSessionsWelcomePage.ID,
				label: localize('agentSessionsWelcome.displayName', "Agent Sessions Welcome"),
				priority: RegisteredEditorPriority.builtin,
			},
			{
				singlePerResource: true,
				canSupportResource: resource =>
					resource.scheme === AgentSessionsWelcomeInput.RESOURCE.scheme &&
					resource.authority === AgentSessionsWelcomeInput.RESOURCE.authority
			},
			{
				createEditorInput: () => {
					return {
						editor: instantiationService.createInstance(AgentSessionsWelcomeInput, { workspaceKind: getWorkspaceKind(workspaceContextService) }),
					};
				}
			}
		));
	}
}

// Register command to open agent sessions welcome page
registerAction2(class OpenAgentSessionsWelcomeAction extends Action2 {
	constructor() {
		super({
			id: AgentSessionsWelcomePage.COMMAND_ID,
			title: localize('openAgentSessionsWelcome', "Open Agent Sessions Welcome"),
			precondition: ChatContextKeys.enabled
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const input = instantiationService.createInstance(AgentSessionsWelcomeInput, { initiator: 'command', workspaceKind: getWorkspaceKind(workspaceContextService) });
		await editorService.openEditor(input, { pinned: true });
	}
});

// Runner contribution - handles opening on startup
class AgentSessionsWelcomeRunnerContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentSessionsWelcomeRunner';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService
	) {
		super();
		this.run();
	}

	private async run(): Promise<void> {
		// Check if AI features are enabled
		if (this.chatEntitlementService.sentiment.hidden) {
			return;
		}

		// Get startup editor configuration
		const startupEditor = this.configurationService.getValue<string>('workbench.startupEditor');

		// Only proceed if configured to show agent sessions welcome page
		if (startupEditor !== 'agentSessionsWelcomePage') {
			return;
		}

		// Wait for editors to restore
		await this.editorGroupsService.whenReady;

		// If the auxiliary bar is maximized, we do not show the welcome page
		if (AuxiliaryBarMaximizedContext.getValue(this.contextKeyService)) {
			return;
		}

		// Check if there's prefill data from a workspace transfer - always show welcome page in that case
		const hasPrefillData = !!this.storageService.get('chat.welcomeViewPrefill', StorageScope.APPLICATION);

		// Don't open if there are already editors open (unless we have prefill data)
		if (this.editorService.activeEditor && !hasPrefillData) {
			return;
		}

		// Open the agent sessions welcome page
		const input = this.instantiationService.createInstance(AgentSessionsWelcomeInput, { initiator: 'startup', workspaceKind: getWorkspaceKind(this.workspaceContextService) });
		await this.editorService.openEditor(input, { pinned: false });
	}
}

// Register contributions
registerWorkbenchContribution2(AgentSessionsWelcomeEditorResolverContribution.ID, AgentSessionsWelcomeEditorResolverContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(AgentSessionsWelcomeRunnerContribution.ID, AgentSessionsWelcomeRunnerContribution, WorkbenchPhase.AfterRestored);
