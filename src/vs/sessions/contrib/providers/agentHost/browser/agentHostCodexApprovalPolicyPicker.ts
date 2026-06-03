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
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AgentHostSessionEnumPicker, IAgentHostSessionEnumPickerItem } from './agentHostModePicker.js';
import { isWellKnownCodexApprovalPolicySchema } from './agentHostPermissionPickerDelegate.js';

/**
 * Picker widget for the agent-host `codex.approvalPolicy` session-config
 * property (`never` / `on-request` / `on-failure` / `untrusted`).
 * All values share the same shield icon; the chip's label reflects the
 * schema's `enumLabels` (Codex's user-facing strings such as
 * "Ask When Needed").
 */
export class AgentHostCodexApprovalPolicyPicker extends AgentHostSessionEnumPicker {

	protected readonly _property = CodexSessionConfigKey.ApprovalPolicy;
	protected readonly _pickerId = 'agentHostCodexApprovalPolicyPicker';
	protected readonly _telemetryId = 'NewChatAgentHostCodexApprovalPolicyPicker';

	constructor(
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(actionWidgetService, sessionsManagementService, sessionsProvidersService, telemetryService);
	}

	protected _isWellKnownSchema(schema: SessionConfigPropertySchema): boolean {
		return isWellKnownCodexApprovalPolicySchema(schema);
	}

	protected _getTriggerIcon(_value: string | undefined): ThemeIcon | undefined {
		return Codicon.shield;
	}

	protected _getActionItemIcon(item: IAgentHostSessionEnumPickerItem, currentValue: string): ThemeIcon {
		return item.value === currentValue ? Codicon.check : Codicon.blank;
	}

	protected _getTriggerAriaLabel(label: string): string {
		return localize('agentHostCodexApprovalPolicyPicker.triggerAriaLabel', "Pick Approval Policy, {0}", label);
	}

	protected _getWidgetAriaLabel(): string {
		return localize('agentHostCodexApprovalPolicyPicker.ariaLabel', "Approval Policy Picker");
	}
}
