/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { AgentSessionsStartPage, AgentSessionsStartInputSerializer } from './agentSessionsStartPage.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { AgentSessionsStartEditorOptions, AgentSessionsStartInput } from './agentSessionsStartInput.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';

// Register Editor Serializer
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(AgentSessionsStartInput.ID, AgentSessionsStartInputSerializer);

// Register Editor Pane
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		AgentSessionsStartPage,
		AgentSessionsStartPage.ID,
		localize('agentSessionsStartPage', "Agent Sessions")
	),
	[
		new SyncDescriptor(AgentSessionsStartInput)
	]
);

// Editor resolver to handle the agent sessions start page resource
class AgentSessionsStartPageEditorResolverContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentSessionsStartPageEditorResolver';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorResolverService editorResolverService: IEditorResolverService
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${AgentSessionsStartInput.RESOURCE.scheme}:/**`,
			{
				id: AgentSessionsStartInput.ID,
				label: localize('agentSessions.displayName', "Agent Sessions"),
				priority: RegisteredEditorPriority.exclusive,
			},
			{
				singlePerResource: true,
				canSupportResource: uri => uri.scheme === AgentSessionsStartInput.RESOURCE.scheme,
			},
			{
				createEditorInput: ({ options }) => {
					return {
						editor: this.instantiationService.createInstance(AgentSessionsStartInput, options as AgentSessionsStartEditorOptions),
						options: {
							...options,
							pinned: false
						}
					};
				}
			}
		));
	}
}

registerWorkbenchContribution2(AgentSessionsStartPageEditorResolverContribution.ID, AgentSessionsStartPageEditorResolverContribution, WorkbenchPhase.BlockRestore);

// Action to open the agent sessions start page
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openAgentSessionsStartPage',
			title: localize2('openAgentSessionsStartPage', 'Open Agent Sessions Start Page'),
			category: Categories.View,
			f1: true,
		});
	}

	run(accessor: ServicesAccessor, toSide?: boolean) {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);
		const input = instantiationService.createInstance(AgentSessionsStartInput, {});
		editorService.openEditor(input, { preserveFocus: toSide ?? false }, toSide ? SIDE_GROUP : undefined);
	}
});
