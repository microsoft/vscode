/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { IActionListItemInlineToggle } from '../../actionWidget/browser/actionList.js';

interface IAgentHostSandboxToggleState {
	readonly provider: string | undefined;
	readonly sessionEnabled: boolean | undefined;
	readonly globalEnabled: boolean;
	readonly managedEnabled: boolean;
	readonly allowsBypass: boolean;
}

/** Resolves the displayed sandbox state for the Copilot harness, with mandatory policy taking precedence over the session choice. */
export function getAgentHostSandboxToggleState(state: IAgentHostSandboxToggleState): { checked: boolean; disabled: boolean } | undefined {
	if (state.provider !== 'copilotcli') {
		return undefined;
	}
	const disabled = state.managedEnabled && !state.allowsBypass;
	return {
		checked: disabled || (state.sessionEnabled ?? (state.managedEnabled || state.globalEnabled)),
		disabled,
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
				: localize('agentHostSandboxToggle.editableManagedTitle', "Sandboxing is enabled by your organization, but you may disable it")
			: localize('agentHostSandboxToggle.title', "Run this session's terminal commands inside a sandbox that restricts file system and network access. This choice is saved for this session only."),
		get checked() { return displayedChecked; },
		disabled,
		onChange: enabled => {
			const currentState = getAgentHostSandboxToggleState(readState());
			if (currentState && !currentState.disabled && displayedChecked !== enabled) {
				displayedChecked = enabled;
				onChange(enabled);
			}
		},
	};
}
