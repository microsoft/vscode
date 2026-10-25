/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR } from './aiCustomizationManagement.js';
import { AICustomizationManagementEditor } from './aiCustomizationManagementEditor.js';
import { CustomizationMigrationCategoryId, getCustomizationMigrationCategory } from './customizationMigrationCategories.js';

class CustomizationMigrationAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 110;
	readonly name = 'customization-migrations';
	readonly when = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR;

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (!(editor instanceof AICustomizationManagementEditor)) {
			return undefined;
		}
		const content = editor.getMigrationAccessibilityContent();
		if (!content) {
			return undefined;
		}
		const focused = DOM.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.CustomizationMigrations,
			{ type: this.type },
			() => this.type === AccessibleViewType.Help ? [
				localize('migrationHelpOverview', "The migrations tree groups each migration type by workspace or user. Expand a group to inspect each customization, its current source, and its destination."),
				localize('migrationHelpLearnMore', "Use Learn About Migrations to read why Copilot's new agent runtime needs different customization formats and locations, and how to migrate them."),
				localize('migrationHelpNavigation', "Use the arrow keys to move through and expand the tree. Use each row's checkbox to include or exclude it. Open a customization to view its editor or details. Use the header actions or the row's More Actions menu to migrate or delete one item."),
				localize('migrationHelpAgent', "Use Migrate to have VS Code update the selected customizations. Migrate with Agent backs up every original source before closing Agent Customizations and focusing a guided migration in chat for the selected harness. Agent migration uses Copilot credits."),
				localize('migrationHelpActions', "Migrate applies to the selected items in one group and asks for confirmation before modifying files or settings. While a migration runs, its group shows Migrating and progress is available in Notifications. Ignore permanently hides a group. Show Ignored Migrations restores hidden groups. Agent Migration Recovery can restore original sources or delete a backup; restoring does not remove destination files created or changed by the agent."),
				getCustomizationMigrationCategory(CustomizationMigrationCategoryId.PromptFiles).preMigrationConsequences ?? '',
				localize('migrationHelpLocations', "Activate a destination path to change the destination. Workspace MCP servers migrate to the root .mcp.json. User MCP servers migrate to mcp-config.json in Copilot home. Disabled user servers may become enabled after migration."),
				localize('migrationHelpMcpChanges', "MCP servers that migrate with changes explain each property removal in their row. Review these warnings before confirming migration."),
				localize('migrationHelpMcpDetails', "MCP servers that cannot migrate automatically appear in the Needs manual review group. Open a server to review its details; Edit Configuration opens its source file and selects the server's JSON configuration."),
				localize('migrationHelpPluginMarketplaces', "Plugin marketplace migrations copy entries from chat.plugins.marketplaces to Copilot settings. The original VS Code setting remains so the Local agent keeps working."),
				localize('migrationHelpGuidance', "Chat Participants and Tool Sets list read-only items without checkboxes or migration actions. Use Learn More to open migration documentation, or Ignore to hide the group. These items are not included in Migrate with Agent."),
				localize('migrationHelpDiscoveryErrors', "If a migration type cannot be checked, its error appears without hiding other migrations. Use Retry to check that migration type again."),
				localize('migrationHelpView', "Use {0} to read the migrations in the Accessible View.", '<keybinding:editor.action.accessibleView>'),
			].join('\n\n') : content,
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.CustomizationMigrations,
		);
	}
}

AccessibleViewRegistry.register(new CustomizationMigrationAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new CustomizationMigrationAccessibleView(AccessibleViewType.View));
