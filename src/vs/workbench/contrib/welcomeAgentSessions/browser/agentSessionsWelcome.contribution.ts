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
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { AgentSessionsWelcomeInput } from './agentSessionsWelcomeInput.js';
import { AgentSessionsWelcomePage, AgentSessionsWelcomeInputSerializer } from './agentSessionsWelcome.js';

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

// Register resolver contribution
class AgentSessionsWelcomeEditorResolverContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentSessionsWelcomeEditorResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
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
						editor: instantiationService.createInstance(AgentSessionsWelcomeInput, {}),
					};
				}
			}
		));
	}
}

// Register command to open agent sessions welcome page
CommandsRegistry.registerCommand(AgentSessionsWelcomePage.COMMAND_ID, (accessor) => {
	const editorService = accessor.get(IEditorService);
	const instantiationService = accessor.get(IInstantiationService);
	const input = instantiationService.createInstance(AgentSessionsWelcomeInput, {});
	return editorService.openEditor(input, { pinned: true });
});

// Register contributions
registerWorkbenchContribution2(AgentSessionsWelcomeEditorResolverContribution.ID, AgentSessionsWelcomeEditorResolverContribution, WorkbenchPhase.BlockStartup);
