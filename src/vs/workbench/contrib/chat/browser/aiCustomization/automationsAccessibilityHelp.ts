/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import {
	AccessibleContentProvider,
	AccessibleViewProviderId,
	AccessibleViewType,
} from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import {
	CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
	CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION,
} from './aiCustomizationManagement.js';

/**
 * Alt+F1 / "Open Accessibility Help" provider for the Automations
 * section of the Agent Customizations editor. Mirrors the structure
 * used by sibling sections (problems, scm, debug). The provider is
 * activated when the editor is focused and the active section is
 * `Automations`.
 */
export class AutomationsAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 105;
	readonly name = 'automations';
	readonly when = ContextKeyExpr.and(
		CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
		CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.isEqualTo(AICustomizationManagementSection.Automations),
	);

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const keybindingService = accessor.get(IKeybindingService);
		// Must be a real AccessibleContentProvider instance: the accessible-view
		// service does `instanceof` checks and otherwise falls back to
		// ExtensionContentProvider semantics, breaking verbositySettingKey
		// propagation. (The repo accessibility skill discourages custom subclasses.)
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Automations,
			{ type: AccessibleViewType.Help },
			() => buildAutomationsHelpContent(keybindingService),
			() => { /* no-op: the accessible view returns focus to the previously focused element. */ },
			AccessibilityVerbositySettingId.Automations,
		);
	}
}

/**
 * Renders the static Automations accessibility-help content. Exported so
 * tests can validate the rendered string without instantiating an
 * {@link AccessibleContentProvider}.
 */
export function buildAutomationsHelpContent(keybindingService: IKeybindingService): string {
	const lines: string[] = [];

	lines.push(nls.localize('automations.help.header', 'Accessibility Help: Automations'));
	lines.push(nls.localize('automations.help.intro', 'Automations let you schedule agent sessions to run on a cadence you choose. When an automation is due, a fresh chat session is created in the background and the prompt is sent automatically.'));
	lines.push('');

	lines.push(nls.localize('automations.help.layoutHeader', 'Layout:'));
	lines.push(nls.localize('automations.help.layoutDesc', 'The Automations section shows a list of all your automations. Each row displays the automation\u2019s name, schedule (Manual, Hourly, Daily at a time, or Weekly on a day at a time), whether it targets a workspace folder or runs without a workspace, the next scheduled run, and a preview of the prompt. Row action buttons follow on the right.'));
	lines.push('');

	lines.push(nls.localize('automations.help.actionsHeader', 'Row Actions (Tab between them):'));
	lines.push(nls.localize('automations.help.actionRun', '- Run now: spawns a new agent session immediately using the automation\u2019s prompt. The trigger is recorded as Manual.'));
	lines.push(nls.localize('automations.help.actionToggle', '- Toggle enabled: pauses or resumes scheduled runs. Disabled automations skip their scheduled tick but can still be run manually.'));
	lines.push(nls.localize('automations.help.actionEdit', '- Edit: opens the create/edit dialog with the current values prefilled.'));
	lines.push(nls.localize('automations.help.actionDelete', '- Delete: removes the automation after a confirmation prompt. Runs already in flight continue to completion.'));
	lines.push(nls.localize('automations.help.actionHistory', '- Show history: expands an inline list of recent runs for the automation, including their status and any error messages.'));
	lines.push('');

	lines.push(nls.localize('automations.help.dialogHeader', 'Create/Edit Dialog:'));
	lines.push(nls.localize('automations.help.dialogFields', 'The dialog has a Name field, a multi-line Prompt field, a Schedule selector (Manual, Hourly, Daily, Weekly), Time and Day-of-Week fields that appear when relevant, a Workspace target selector, a Session type selector, an isolation selector, a branch selector for supported Worktree sessions, an Agent Mode selector (Use default, Agent, Ask, Edit), and a Permission Mode selector (Use default, Default Approvals, Bypass Approvals, Autopilot). Choose No workspace from the Workspace target selector to run without a backing workspace. Only workspace-less-capable session types are then offered, and the isolation and branch controls do not apply. Folder isolation follows the selected repository\u2019s current branch. Worktree isolation lets you choose a local base branch. The selected configuration is replayed when the scheduler starts a run. Tab and Shift+Tab move between fields; Enter or Space opens a focused selector, and Escape closes an open selector before it closes the dialog.'));
	lines.push(nls.localize('automations.help.dialogValidation', 'Save is disabled until Name, Prompt, and Session type are set. Workspace-backed automations also require a Workspace folder, and Worktree isolation requires a branch. Activate Cancel or press Escape to dismiss without saving.'));
	lines.push('');

	lines.push(nls.localize('automations.help.historyHeader', 'Run History:'));
	lines.push(nls.localize('automations.help.historyDesc', 'Each run records its status (Pending, Running, Completed, Failed), the trigger that started it (Schedule, Manual, or Catch-up after VS Code restarts), the time it started, and the time it took. Failed runs include the failure reason.'));
	lines.push('');

	lines.push(nls.localize('automations.help.statusHeader', 'Screen Reader Announcements:'));
	lines.push(nls.localize('automations.help.statusDesc', 'The Automations list announces state changes when you create, update, delete, toggle, or manually run an automation. Verbose announcements can be turned off via the accessibility.verbosity.automations setting.'));
	lines.push('');

	lines.push(nls.localize('automations.help.settingsHeader', 'Settings ({0} opens Settings):', describeCommand(keybindingService, 'workbench.action.openSettings') || 'Ctrl+,'));
	lines.push(nls.localize('automations.help.settingVerbosity', '- `accessibility.verbosity.automations`: Controls whether this Accessibility Help hint is announced when the Automations section is focused.'));
	lines.push('');

	lines.push(nls.localize('automations.help.closingHeader', 'Closing this dialog:'));
	lines.push(nls.localize('automations.help.closingDesc', 'Press Escape to close this dialog and return focus to the Automations list.'));

	return lines.join('\n');
}

function describeCommand(keybindingService: IKeybindingService, commandId: string): string | undefined {
	const kb = keybindingService.lookupKeybinding(commandId);
	return kb?.getAriaLabel() ?? undefined;
}
