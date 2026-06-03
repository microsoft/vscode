/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { AUTO_APPROVE_DONT_SHOW_AGAIN_KEY, AUTOPILOT_DONT_SHOW_AGAIN_KEY, CODEX_SANDBOX_DONT_SHOW_AGAIN_KEY } from './chatPermissionStorageKeys.js';
import { ChatConfiguration, ChatPermissionLevel } from './constants.js';

/**
 * In-memory record of warnings already accepted in this VS Code session.
 * Checked alongside the persisted "Don't show again" storage value so that the
 * warning isn't repeated within a session even when the user didn't tick the
 * checkbox.
 *
 * Per-renderer; the `StorageScope.PROFILE` storage entry is what synchronizes
 * the dismissed state across windows (workbench and Agents).
 */
const shownWarnings = new Set<ChatPermissionLevel>();

function dontShowAgainKey(level: ChatPermissionLevel): string | undefined {
	if (level === ChatPermissionLevel.Autopilot) {
		return AUTOPILOT_DONT_SHOW_AGAIN_KEY;
	}
	if (level === ChatPermissionLevel.AutoApprove) {
		return AUTO_APPROVE_DONT_SHOW_AGAIN_KEY;
	}
	return undefined;
}

/**
 * Clears the in-process suppression set so that previously accepted (but not
 * persistently dismissed) warnings will be shown again within this session.
 * Call this alongside removing the persisted storage keys when implementing a
 * "reset" developer action.
 */
export function resetShownWarnings(): void {
	shownWarnings.clear();
}

export function hasShownElevatedWarning(level: ChatPermissionLevel, storageService: IStorageService): boolean {
	if (shownWarnings.has(level)) {
		return true;
	}
	const key = dontShowAgainKey(level);
	if (key && storageService.getBoolean(key, StorageScope.PROFILE, false)) {
		return true;
	}
	return false;
}

/**
 * If `level` is an elevated permission level (Bypass Approvals or Autopilot)
 * that hasn't already been confirmed in this session or persistently
 * dismissed, show the corresponding warning dialog. Returns:
 *
 * - `true` if the level is not elevated, has already been confirmed, or the
 *   user accepts the dialog. In these cases the caller should proceed to apply
 *   the level.
 * - `false` if the user cancels the dialog. The caller should abort the
 *   permission change.
 *
 * When the user ticks "Don't show again", the choice is persisted in
 * `StorageScope.PROFILE`, which is shared across the workbench and Agents
 * windows so a dismissal in one applies to the other.
 */
export async function maybeConfirmElevatedPermissionLevel(
	level: ChatPermissionLevel,
	dialogService: IDialogService,
	storageService: IStorageService,
): Promise<boolean> {
	const key = dontShowAgainKey(level);
	if (!key || hasShownElevatedWarning(level, storageService)) {
		return true;
	}

	const isAutopilot = level === ChatPermissionLevel.Autopilot;
	const result = await dialogService.prompt({
		type: Severity.Warning,
		message: isAutopilot
			? localize('permissions.autopilot.warning.title', "Enable Autopilot?")
			: localize('permissions.autoApprove.warning.title', "Enable Bypass Approvals?"),
		buttons: [
			{
				label: isAutopilot
					? localize('permissions.autopilot.warning.confirm', "Enable")
					: localize('permissions.autoApprove.warning.confirm', "Enable"),
				run: () => true,
			},
			{
				label: isAutopilot
					? localize('permissions.autopilot.warning.cancel', "Cancel")
					: localize('permissions.autoApprove.warning.cancel', "Cancel"),
				run: () => false,
			},
		],
		checkbox: {
			label: localize('permissions.warning.dontShowAgain', "Don't show again"),
			checked: false,
		},
		custom: {
			icon: isAutopilot ? Codicon.rocket : Codicon.warning,
			markdownDetails: [{
				markdown: new MarkdownString(
					isAutopilot
						? localize('permissions.autopilot.warning.detail', "Autopilot will auto-approve all tool calls and continue working autonomously until the task is complete. This includes terminal commands, file edits, and external tool calls. The agent will make decisions on your behalf without asking for confirmation.\n\nYou can stop the agent at any time by clicking the stop button. This applies to the current session only.\n\nTo make this the starting permission level for new chat sessions, change the [{0}](command:workbench.action.openSettings?%5B%22{0}%22%5D) setting.", ChatConfiguration.DefaultPermissionLevel)
						: localize('permissions.autoApprove.warning.detail', "Bypass Approvals will auto-approve all tool calls without asking for confirmation. This includes file edits, terminal commands, and external tool calls.\n\nTo make this the starting permission level for new chat sessions, change the [{0}](command:workbench.action.openSettings?%5B%22{0}%22%5D) setting.", ChatConfiguration.DefaultPermissionLevel),
					{ isTrusted: { enabledCommands: ['workbench.action.openSettings'] } },
				),
			}],
		},
	});
	if (result.result !== true) {
		return false;
	}
	if (result.checkboxChecked) {
		storageService.store(key, true, StorageScope.PROFILE, StorageTarget.USER);
	}
	shownWarnings.add(level);
	return true;
}

/**
 * In-memory record of whether the Codex `danger-full-access` sandbox warning
 * has already been accepted in this VS Code session. Checked alongside the
 * persisted "Don't show again" storage value so the warning isn't repeated
 * within a session even when the user didn't tick the checkbox.
 *
 * Per-renderer; the `StorageScope.PROFILE` storage entry is what synchronizes
 * the dismissed state across windows (workbench and Agents).
 */
let shownCodexSandboxFullAccessWarning = false;

/**
 * Test/dev helper that clears the in-process suppression flag so that the
 * Codex sandbox warning is shown again within this session.
 */
export function resetShownCodexSandboxWarnings(): void {
	shownCodexSandboxFullAccessWarning = false;
}

/**
 * If `sandboxMode` is the dangerous Codex `danger-full-access` value and the
 * warning hasn't already been confirmed in this session or persistently
 * dismissed, show the corresponding warning dialog. Returns:
 *
 * - `true` if the value is not `danger-full-access`, has already been
 *   confirmed, or the user accepts the dialog. In these cases the caller
 *   should proceed to apply the value.
 * - `false` if the user cancels the dialog. The caller should abort the
 *   sandbox-mode change.
 *
 * When the user ticks "Don't show again", the choice is persisted in
 * `StorageScope.PROFILE`, which is shared across the workbench and Agents
 * windows so a dismissal in one applies to the other.
 */
export async function maybeConfirmCodexSandboxLevel(
	sandboxMode: string,
	dialogService: IDialogService,
	storageService: IStorageService,
): Promise<boolean> {
	if (sandboxMode !== 'danger-full-access') {
		return true;
	}
	if (shownCodexSandboxFullAccessWarning) {
		return true;
	}
	if (storageService.getBoolean(CODEX_SANDBOX_DONT_SHOW_AGAIN_KEY, StorageScope.PROFILE, false)) {
		return true;
	}

	const result = await dialogService.prompt({
		type: Severity.Warning,
		message: localize('permissions.codexSandbox.dangerFullAccess.warning.title', "Enable Full Access (Dangerous)?"),
		buttons: [
			{
				label: localize('permissions.codexSandbox.dangerFullAccess.warning.confirm', "Enable"),
				run: () => true,
			},
			{
				label: localize('permissions.codexSandbox.dangerFullAccess.warning.cancel', "Cancel"),
				run: () => false,
			},
		],
		checkbox: {
			label: localize('permissions.warning.dontShowAgain', "Don't show again"),
			checked: false,
		},
		custom: {
			icon: Codicon.warning,
			markdownDetails: [{
				markdown: new MarkdownString(
					localize('permissions.codexSandbox.dangerFullAccess.warning.detail', "Full Access removes sandbox restrictions: tool calls can read, write, and reach the network anywhere on your system. This bypasses the workspace boundary that normally protects files and resources outside the workspace."),
				),
			}],
		},
	});
	if (result.result !== true) {
		return false;
	}
	if (result.checkboxChecked) {
		storageService.store(CODEX_SANDBOX_DONT_SHOW_AGAIN_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
	}
	shownCodexSandboxFullAccessWarning = true;
	return true;
}
