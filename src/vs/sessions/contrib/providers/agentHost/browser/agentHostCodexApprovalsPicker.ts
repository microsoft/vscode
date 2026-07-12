/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { CodexSessionConfigKey } from '../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import { SessionConfigPropertySchema } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { AgentHostSessionEnumPicker, IAgentHostSessionEnumPickerItem } from './agentHostModePicker.js';
import { isWellKnownCodexApprovalsSchema } from './agentHostPermissionPickerDelegate.js';

const CODEX_APPROVALS_LEARN_MORE_URL = 'https://developers.openai.com/codex/concepts/sandboxing#how-you-control-it';
const LEARN_MORE_VALUE = '__agentHostCodexApprovalsPicker.learnMore__';

function getCodexApprovalsIcon(value: string | undefined): ThemeIcon | undefined {
	switch (value) {
		case 'default': return Codicon.shield;
		case 'auto-review': return Codicon.sparkle;
		case 'full-access': return Codicon.warning;
		default: return undefined;
	}
}

/**
 * Picker widget for the Codex `codex.permissionsPreset` session-config
 * property. Codex collapses its three security axes (sandbox × approval policy
 * × approvals reviewer) into a single user-facing preset, so this presents one
 * "Approvals" chip whose options mirror the Codex app's permissions selector.
 */
export class AgentHostCodexApprovalsPicker extends AgentHostSessionEnumPicker {

	protected readonly _property = CodexSessionConfigKey.PermissionsPreset;
	protected readonly _pickerId = 'agentHostCodexApprovalsPicker';
	protected readonly _telemetryId = 'NewChatAgentHostCodexApprovalsPicker';

	constructor(
		session: IObservable<IActiveSession | undefined>,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super(session, actionWidgetService, sessionsProvidersService, telemetryService, hoverService);
	}

	protected _isWellKnownSchema(schema: SessionConfigPropertySchema): boolean {
		return isWellKnownCodexApprovalsSchema(schema);
	}

	protected _getTriggerIcon(value: string | undefined): ThemeIcon | undefined {
		return getCodexApprovalsIcon(value);
	}

	protected _getActionItemIcon(item: IAgentHostSessionEnumPickerItem): ThemeIcon | undefined {
		return getCodexApprovalsIcon(item.value);
	}

	protected _getTriggerAriaLabel(label: string): string {
		return localize('agentHostCodexApprovalsPicker.triggerAriaLabel', "Pick Approvals, {0}", label);
	}

	protected _getWidgetAriaLabel(): string {
		return localize('agentHostCodexApprovalsPicker.ariaLabel', "Approvals Picker");
	}

	protected override _getFooterActionItems(): readonly IActionListItem<IAgentHostSessionEnumPickerItem>[] {
		const learnMoreLabel = localize('codexApprovals.learnMore', "Learn more about permissions");
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
		void this._openerService.open(URI.parse(CODEX_APPROVALS_LEARN_MORE_URL));
		return true;
	}
}
