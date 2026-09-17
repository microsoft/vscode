/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { markAsSingleton } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { aiCustomizationManagementSectionRegistry } from '../../chat/browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../chat/common/aiCustomizationWorkspaceService.js';
import { IWorkflowCatalogService } from '../common/workflowCatalog.js';
import { IWorkflowAuthoringService } from '../common/workflowAuthoring.js';
import { workflowCheckpointSchemaId, workflowSchemaId } from '../common/workflowCatalogModel.js';
import { workflowConfiguration, WorkflowContextKeys, WorkflowSettingId } from '../common/workflowConfiguration.js';
import { workflowCheckpointSchema, workflowSchema } from '../common/workflowSchemas.js';
import { IWorkflowService, WorkflowService } from '../common/workflowService.js';
import { IWorkflowSourceEnablementService } from '../common/workflowSources.js';
import { IWorkflowAccessibilityService, WorkflowAccessibilityService, WorkflowAccessibleView } from './workflowAccessibility.js';
import { WorkflowCatalogService } from './workflowCatalogService.js';
import { WorkflowAuthoringService } from './workflowAuthoringService.js';
import { WorkflowCatalogViewModel } from './workflowCatalogViewModel.js';
import { WorkflowCatalogWidget } from './workflowCatalogWidget.js';
import { WorkflowEditorInput, WorkflowEditorPane, WorkflowEditorSerializer, WorkflowRunEditorInput, WorkflowRunEditorPane } from './workflowEditors.js';
import { IWorkflowUIService } from './workflowUIService.js';
import { WorkflowUIService } from './workflowUIServiceImpl.js';
import { WorkflowSourceEnablementService } from './workflowSourceEnablementService.js';
import { WorkflowToolsContribution } from './workflowTools.js';

registerSingleton(IWorkflowCatalogService, WorkflowCatalogService, InstantiationType.Delayed);
registerSingleton(IWorkflowAuthoringService, WorkflowAuthoringService, InstantiationType.Delayed);
registerWorkbenchContribution2(WorkflowToolsContribution.ID, WorkflowToolsContribution, WorkbenchPhase.AfterRestored);
registerSingleton(IWorkflowService, WorkflowService, InstantiationType.Delayed);
registerSingleton(IWorkflowSourceEnablementService, WorkflowSourceEnablementService, InstantiationType.Delayed);
registerSingleton(IWorkflowUIService, WorkflowUIService, InstantiationType.Delayed);
registerSingleton(IWorkflowAccessibilityService, WorkflowAccessibilityService, InstantiationType.Delayed);
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(workflowConfiguration);

const schemas = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
schemas.registerSchema(workflowSchemaId, workflowSchema);
schemas.registerSchema(workflowCheckpointSchemaId, workflowCheckpointSchema);
schemas.registerSchemaAssociation(workflowSchemaId, '*.workflow.jsonc');
schemas.registerSchemaAssociation(workflowCheckpointSchemaId, '*.checkpoint.jsonc');

const contributionSchema: IJSONSchema = {
	type: 'array',
	description: localize('workflow.contributions', "Proposed declarative workflow contributions. Each path names a packaged JSONC file; no executable extension code is activated by discovery."),
	items: {
		type: 'string',
		minLength: 1,
		description: localize('workflow.contributionPath', "A relative file path within this extension's package."),
	},
};
ExtensionsRegistry.registerExtensionPoint({ extensionPoint: 'workflowCheckpointTypes', jsonSchema: contributionSchema, defaultExtensionKind: ['workspace'] });
ExtensionsRegistry.registerExtensionPoint({ extensionPoint: 'workflowTemplates', jsonSchema: contributionSchema, defaultExtensionKind: ['workspace'] });

markAsSingleton(aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.Workflows,
	label: localize('workflow.section', "Workflows"),
	description: localize('workflow.sectionDescription', "Create and inspect reusable checkpoint assignments without starting a run."),
	icon: Codicon.listTree,
	when: ContextKeyExpr.and(ChatContextKeys.enabled, WorkflowContextKeys.enabled),
	supportsHarness: () => true,
	createData: instantiationService => instantiationService.createInstance(WorkflowCatalogViewModel),
	create: (instantiationService, container) => instantiationService.createInstance(WorkflowCatalogWidget, container),
}));

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(WorkflowEditorPane, WorkflowEditorPane.ID, localize('workflow.editor', "Workflow Editor")),
	[new SyncDescriptor(WorkflowEditorInput)],
);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(WorkflowEditorInput.ID, WorkflowEditorSerializer);
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(WorkflowRunEditorPane, WorkflowRunEditorPane.ID, localize('workflow.progressEditor', "Workflow Checkpoints")),
	[new SyncDescriptor(WorkflowRunEditorInput)],
);
AccessibleViewRegistry.register(new WorkflowAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new WorkflowAccessibleView(AccessibleViewType.View));

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.workflows.open',
			title: localize2('workflow.openCatalog', "Open Workflows"),
			category: localize2('workflow.category', "Chat"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, WorkflowContextKeys.enabled),
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		if (accessor.get(IConfigurationService).getValue<boolean>(WorkflowSettingId.Enabled) !== true || accessor.get(IChatEntitlementService).sentiment.hidden) {
			return;
		}
		await accessor.get(ICommandService).executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Workflows);
	}
});
