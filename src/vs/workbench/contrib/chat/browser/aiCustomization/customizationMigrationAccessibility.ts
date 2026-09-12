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
				localize('migrationHelpOverview', "The migration checklist groups supported migrations by your profile and workspace."),
				localize('migrationHelpNavigation', "Use Tab and Shift+Tab to move between controls. Review opens the existing migration page filtered to that location. No files change until you confirm migration."),
				localize('migrationHelpLocations', "Change destinations configures file migration locations. MCP servers always migrate to the workspace root .mcp.json."),
				localize('migrationHelpSkip', "Skip Workspace excludes workspace migrations from the checklist count without changing files. Include Workspace restores them."),
				localize('migrationHelpActivity', "Migration activity records successful changes locally. Expand an activity entry with Enter or Space to read its source and destination paths. Dismiss removes the activity record, not the migrated files."),
				localize('migrationHelpView', "Use {0} to read the checklist and activity in the Accessible View.", '<keybinding:editor.action.accessibleView>'),
			].join('\n\n') : content,
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.CustomizationMigrations,
		);
	}
}

AccessibleViewRegistry.register(new CustomizationMigrationAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new CustomizationMigrationAccessibleView(AccessibleViewType.View));
