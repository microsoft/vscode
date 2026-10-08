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
	readonly devContainer?: boolean;
	readonly devContainerSandboxSupported?: boolean;
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
		disabled: (state.managedEnabled && checked) || (state.devContainerSandboxSupported === false && !checked),
	};
}

export function equalsAgentHostSandboxTogglePresentation(previous: IActionListItemInlineToggle | undefined, current: IActionListItemInlineToggle | undefined): boolean {
	return previous?.checked === current?.checked
		&& previous?.disabled === current?.disabled
		&& previous?.label === current?.label
		&& previous?.title === current?.title
		&& previous?.showInfoIcon === current?.showInfoIcon;
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
		label: state.devContainer
			? localize('agentHostSandboxToggle.devContainerLabel', "Sandboxing in Dev Container")
			: localize('agentHostSandboxToggle.label', "Sandboxing for terminal"),
		showInfoIcon: state.devContainer,
		title: state.devContainerSandboxSupported === false
			? localize('agentHostSandboxToggle.devContainerUnavailableTitle', "This Dev Container was started without the Docker options required for sandboxing. Recreate it with sandboxing enabled to use this option, or turn sandboxing off for this session if your organization permits it.")
			: state.devContainer
				? localize('agentHostSandboxToggle.devContainerTitle', "Start the Dev Container with the Docker options needed for terminal sandboxing: unconfined seccomp, AppArmor and system paths, and access to /dev/net/tun. This relaxes the outer container's isolation; terminal commands still run inside their own sandbox.")
				: state.managedEnabled
					? disabled
						? localize('agentHostSandboxToggle.requiredTitle', "Sandboxing is required by your organization")
						: localize('agentHostSandboxToggle.reenableManagedTitle', "Sandboxing was disabled for this session through an approved bypass. You can enable it again.")
					: localize('agentHostSandboxToggle.title', "Run this session's terminal commands inside a sandbox that restricts file system and network access. The applied setting is saved for this session and checked against current organization policy when restored."),
		get checked() { return displayedChecked; },
		get disabled() { return disabled || (state.managedEnabled && displayedChecked) || (state.devContainerSandboxSupported === false && !displayedChecked); },
		onChange: enabled => {
			const latest = readState();
			const currentState = getAgentHostSandboxToggleState(latest);
			if (currentState && !currentState.disabled && !(latest.managedEnabled && displayedChecked) && !(latest.devContainerSandboxSupported === false && enabled) && displayedChecked !== enabled) {
				displayedChecked = enabled;
				onChange(enabled);
			}
		},
	};
}
