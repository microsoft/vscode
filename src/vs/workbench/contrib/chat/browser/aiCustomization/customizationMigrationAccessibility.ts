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
				localize('migrationHelpOverview', "The migrations tree groups each migration type by workspace or user. Expand a group to inspect each customization, its source location, and its destination."),
				localize('migrationHelpNavigation', "Use the arrow keys to move through and expand the tree. Use each row's checkbox to include or exclude it. Open a customization to view its editor or details. The More Actions menu can migrate or delete one item."),
				localize('migrationHelpAgent', "Migrate with Agent starts a new chat for the selected harness. The agent guides scope selection, creates a recovery log and backups in a VS Code-managed location, and explains each migration before making changes."),
				localize('migrationHelpActions', "Migrate applies to the selected items in one group and shows the planned source and destination changes before modifying files. Ignore permanently hides a group. Show Ignored Migrations restores hidden groups."),
				localize('migrationHelpLocations', "Activate a destination path to change the destination. Workspace MCP servers migrate to the root .mcp.json. User MCP servers migrate to mcp-config.json in Copilot home. Disabled user servers may become enabled after migration."),
				localize('migrationHelpMcpChanges', "MCP servers that migrate with changes explain each property removal in their row. Review these warnings before confirming migration."),
				localize('migrationHelpMcpDetails', "MCP servers that cannot migrate automatically appear in the Needs manual review group. Open a server to review its details; Edit Configuration opens its source file and selects the server's JSON configuration."),
				localize('migrationHelpActivity', "Migration activity records successful changes locally. Expand an activity entry with Enter or Space to read its source and destination paths. Dismiss removes the activity record, not the migrated files."),
				localize('migrationHelpView', "Use {0} to read the migrations and activity in the Accessible View.", '<keybinding:editor.action.accessibleView>'),
			].join('\n\n') : content,
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.CustomizationMigrations,
		);
	}
}

AccessibleViewRegistry.register(new CustomizationMigrationAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new CustomizationMigrationAccessibleView(AccessibleViewType.View));
