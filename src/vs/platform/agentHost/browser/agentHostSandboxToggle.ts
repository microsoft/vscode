/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { IActionListItemInlineToggle } from '../../actionWidget/browser/actionList.js';

interface IAgentHostSandboxToggleState {
	readonly provider: string | undefined;
	readonly sessionEnabled: boolean | undefined;
	readonly confirmedEnabled?: boolean;
	readonly globalEnabled: boolean;
	readonly managedEnabled: boolean;
	readonly allowsBypass: boolean;
}

/** Managed enablement permits turning On after an authorized session opt-out, but never a direct Off. */
export function getAgentHostSandboxToggleState(state: IAgentHostSandboxToggleState): { checked: boolean; disabled: boolean } | undefined {
	if (state.provider !== 'copilotcli') {
		return undefined;
	}
	const authorizedDisable = state.allowsBypass && state.confirmedEnabled === false;
	const checked = state.managedEnabled && !authorizedDisable ? true : (state.sessionEnabled ?? (state.managedEnabled || state.globalEnabled));
	return {
		checked,
		disabled: state.managedEnabled && checked,
	};
}

export function equalsAgentHostSandboxTogglePresentation(previous: IActionListItemInlineToggle | undefined, current: IActionListItemInlineToggle | undefined): boolean {
	return previous?.checked === current?.checked
		&& previous?.disabled === current?.disabled
		&& previous?.label === current?.label
		&& previous?.title === current?.title;
}

export function createAgentHostSandboxToggle(readState: () => IAgentHostSandboxToggleState, onChange: (enabled: boolean) => void): IActionListItemInlineToggle | undefined {
	const state = readState();
	const toggleState = getAgentHostSandboxToggleState(state);
	if (!toggleState) {
		return undefined;
	}
	const { checked, disabled } = toggleState;
	let displayedChecked = checked;
	return {
		label: localize('agentHostSandboxToggle.label', "Sandboxing for terminal"),
		title: state.managedEnabled
			? disabled
				? localize('agentHostSandboxToggle.requiredTitle', "Sandboxing is required by your organization")
				: localize('agentHostSandboxToggle.reenableManagedTitle', "Sandboxing was disabled for this session through an approved bypass. You can enable it again.")
			: localize('agentHostSandboxToggle.title', "Run this session's terminal commands inside a sandbox that restricts file system and network access. This choice is saved for this session only."),
		get checked() { return displayedChecked; },
		get disabled() { return disabled || (state.managedEnabled && displayedChecked); },
		onChange: enabled => {
			const latest = readState();
			const currentState = getAgentHostSandboxToggleState(latest);
			if (currentState && !currentState.disabled && !(latest.managedEnabled && displayedChecked) && displayedChecked !== enabled) {
				displayedChecked = enabled;
				onChange(enabled);
			}
		},
	};
}
