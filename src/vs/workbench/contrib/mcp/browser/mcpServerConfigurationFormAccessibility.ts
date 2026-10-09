/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { getFocusedMcpServerConfigurationForm, McpServerConfigurationFormFocusContext } from './mcpServerConfigurationForm.js';

/**
 * Accessibility help for {@link McpServerConfigurationForm}. The form uses native text fields,
 * so it does not need an Accessible View.
 */
export class McpServerConfigurationFormAccessibilityHelp implements IAccessibleViewImplementation {
	// Above the Agent Customizations editor's own help, which also matches while the form is focused.
	readonly priority = 115;
	readonly name = 'mcp-server-configuration-form';
	readonly type = AccessibleViewType.Help;
	readonly when = McpServerConfigurationFormFocusContext;

	getProvider(_accessor: ServicesAccessor): AccessibleContentProvider {
		// Captured now: a file change while Help is open can rebuild the focused row.
		const restoreFocus = getFocusedMcpServerConfigurationForm()?.captureFocus();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.McpServerConfiguration,
			{ type: AccessibleViewType.Help },
			() => getMcpServerConfigurationFormHelpContent(),
			() => restoreFocus?.(),
			AccessibilityVerbositySettingId.McpServerConfiguration,
		);
	}
}

export function getMcpServerConfigurationFormHelpContent(): string {
	return [
		localize('mcpFormHelp.overview', "You are in the configuration form of an MCP server. It edits the server's entry in its configuration file, and only offers the fields that file can store."),
		localize('mcpFormHelp.type', "Server Type is a group of options: stdio runs a local process, http connects to a remote server, and sse connects using Server-Sent Events. Use the arrow keys to change the type; the fields below change to match it."),
		localize('mcpFormHelp.arguments', "Arguments are separated by spaces. If an argument contains spaces or is empty, enter all arguments as a JSON array of strings instead, for example [\"--path\", \"My Documents\"]."),
		localize('mcpFormHelp.rows', "Environment variables and headers are rows of a name field, a value field and a Remove button. Use Add Variable or Add Header to add a row; focus moves to its name field. Removing a row moves focus to the next row, or to the add button when no rows remain."),
		localize('mcpFormHelp.validation', "Invalid fields are marked as invalid and announce their error. Errors that apply to the whole form, such as a value the configuration file does not support, are announced below the fields."),
		localize('mcpFormHelp.save', "Save writes only the changed properties to the configuration file and is unavailable until there is a valid change. Discard Changes restores the configuration from the file."),
		localize('mcpFormHelp.otherProperties', "Other Properties opens the configuration file at the server's entry, to edit properties the form does not show."),
	].join('\n\n');
}
