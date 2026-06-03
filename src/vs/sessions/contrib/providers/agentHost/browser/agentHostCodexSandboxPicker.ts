/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { CodexSessionConfigKey } from '../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import { SessionConfigPropertySchema } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { maybeConfirmCodexSandboxLevel } from '../../../../../workbench/contrib/chat/common/chatPermissionWarnings.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AgentHostSessionEnumPicker, IAgentHostSessionEnumPickerItem } from './agentHostModePicker.js';
import { isWellKnownCodexSandboxSchema } from './agentHostPermissionPickerDelegate.js';

function getSandboxIcon(value: string | undefined): ThemeIcon | undefined {
	switch (value) {
		case 'read-only': return Codicon.shield;
		case 'workspace-write': return Codicon.edit;
		case 'danger-full-access': return Codicon.warning;
		default: return undefined;
	}
}

/**
 * Picker widget for the agent-host `codex.sandboxMode` session-config
 * property (`read-only` / `workspace-write` / `danger-full-access`).
 * Mirrors {@link AgentHostClaudePermissionModePicker}'s shape and uses
 * the shared {@link maybeConfirmCodexSandboxLevel} dialog to gate
 * escalation to the dangerous full-access mode.
 */
export class AgentHostCodexSandboxPicker extends AgentHostSessionEnumPicker {

	protected readonly _property = CodexSessionConfigKey.SandboxMode;
	protected readonly _pickerId = 'agentHostCodexSandboxPicker';
	protected readonly _telemetryId = 'NewChatAgentHostCodexSandboxPicker';

	constructor(
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super(actionWidgetService, sessionsManagementService, sessionsProvidersService, telemetryService);
	}

	protected _isWellKnownSchema(schema: SessionConfigPropertySchema): boolean {
		return isWellKnownCodexSandboxSchema(schema);
	}

	protected _getTriggerIcon(value: string | undefined): ThemeIcon | undefined {
		return getSandboxIcon(value);
	}

	protected _getActionItemIcon(item: IAgentHostSessionEnumPickerItem): ThemeIcon | undefined {
		return getSandboxIcon(item.value);
	}

	protected _getTriggerAriaLabel(label: string): string {
		return localize('agentHostCodexSandboxPicker.triggerAriaLabel', "Pick Sandbox, {0}", label);
	}

	protected _getWidgetAriaLabel(): string {
		return localize('agentHostCodexSandboxPicker.ariaLabel', "Sandbox Picker");
	}

	protected override _decorateTrigger(trigger: HTMLElement, value: string): void {
		trigger.classList.toggle('warning', value === 'danger-full-access');
	}

	protected override async _shouldApplyValue(item: IAgentHostSessionEnumPickerItem, currentValue: string): Promise<boolean> {
		if (item.value !== 'danger-full-access' || currentValue === 'danger-full-access') {
			return true;
		}
		return maybeConfirmCodexSandboxLevel(item.value, this._dialogService, this._storageService);
	}
}
