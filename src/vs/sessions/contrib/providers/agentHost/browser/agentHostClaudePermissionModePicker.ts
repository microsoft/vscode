/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ClaudeSessionConfigKey } from '../../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { SessionConfigPropertySchema } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AgentHostSessionEnumPicker, IAgentHostSessionEnumPickerItem } from './agentHostModePicker.js';
import { isWellKnownClaudePermissionModeSchema } from './agentHostPermissionPickerDelegate.js';

const CLAUDE_PERMISSION_MODE_LEARN_MORE_URL = 'https://code.claude.com/docs/en/permission-modes#available-modes';
const LEARN_MORE_VALUE = '__agentHostClaudePermissionModePicker.learnMore__';

function getPermissionModeIcon(value: string | undefined): ThemeIcon | undefined {
	switch (value) {
		case 'default': return Codicon.shield;
		case 'acceptEdits': return Codicon.edit;
		case 'bypassPermissions': return Codicon.warning;
		case 'plan': return Codicon.lightbulb;
		default: return undefined;
	}
}

export class AgentHostClaudePermissionModePicker extends AgentHostSessionEnumPicker {

	protected readonly _property = ClaudeSessionConfigKey.PermissionMode;
	protected readonly _pickerId = 'agentHostClaudePermissionModePicker';
	protected readonly _telemetryId = 'NewChatAgentHostClaudePermissionModePicker';

	constructor(
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super(actionWidgetService, sessionsManagementService, sessionsProvidersService, telemetryService);
	}

	protected _isWellKnownSchema(schema: SessionConfigPropertySchema): boolean {
		return isWellKnownClaudePermissionModeSchema(schema);
	}

	protected _getTriggerIcon(value: string | undefined): ThemeIcon | undefined {
		return getPermissionModeIcon(value);
	}

	protected _getActionItemIcon(item: IAgentHostSessionEnumPickerItem): ThemeIcon | undefined {
		return getPermissionModeIcon(item.value);
	}

	protected _getTriggerAriaLabel(label: string): string {
		return localize('agentHostClaudePermissionModePicker.triggerAriaLabel', "Pick Approvals, {0}", label);
	}

	protected _getWidgetAriaLabel(): string {
		return localize('agentHostClaudePermissionModePicker.ariaLabel', "Approvals Picker");
	}

	protected override _getFooterActionItems(): readonly IActionListItem<IAgentHostSessionEnumPickerItem>[] {
		const learnMoreLabel = localize('permissions.learnMore', "Learn more about permissions");
		return [
			{
				kind: ActionListItemKind.Separator,
				label: '',
			},
			{
				kind: ActionListItemKind.Action,
				label: learnMoreLabel,
				group: { title: '', icon: Codicon.blank },
				item: {
					value: LEARN_MORE_VALUE,
					label: learnMoreLabel,
				},
			},
		];
	}

	protected override _handleFooterActionItem(item: IAgentHostSessionEnumPickerItem): boolean {
		if (item.value !== LEARN_MORE_VALUE) {
			return false;
		}
		void this._openerService.open(URI.parse(CLAUDE_PERMISSION_MODE_LEARN_MORE_URL));
		return true;
	}
}
