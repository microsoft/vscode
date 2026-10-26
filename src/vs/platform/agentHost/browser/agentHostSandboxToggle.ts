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
	readonly applyFailed?: boolean;
	readonly rejectedSelection?: boolean;
	readonly globalEnabled: boolean;
	readonly managedEnabled: boolean;
	readonly allowsBypass: boolean;
	readonly devContainer?: boolean;
	readonly devContainerSandboxSupported?: boolean;
}

const toggleSelections = new WeakMap<IActionListItemInlineToggle, { checked: boolean; changedByUser: boolean }>();

/** Retains an open picker's rejected choice while the runtime synchronizes the rollback. */
export function preserveAgentHostSandboxToggleSelection(previous: IActionListItemInlineToggle | undefined, current: IActionListItemInlineToggle | undefined, preserveSelection: boolean): void {
	const previousSelection = previous && toggleSelections.get(previous);
	const currentSelection = current && toggleSelections.get(current);
	if (preserveSelection && previousSelection?.changedByUser && currentSelection && current && !current.disabled && previous?.label === current.label) {
		currentSelection.checked = previousSelection.checked;
		currentSelection.changedByUser = true;
	}
}

/** Managed sandboxing permits session changes only when bypass is allowed. */
export function isAgentHostSandboxDisablingBlocked(state: Pick<IAgentHostSandboxToggleState, 'managedEnabled' | 'allowsBypass' | 'confirmedEnabled' | 'sessionEnabled'>): boolean {
	return state.managedEnabled && !state.allowsBypass;
}

/** Reflect the requested selection immediately while runtime enforcement remains authoritative. */
export function getAgentHostSandboxToggleState(state: IAgentHostSandboxToggleState): { checked: boolean; disabled: boolean } | undefined {
	if (state.provider !== 'copilotcli') {
		return undefined;
	}
	const checked = isAgentHostSandboxDisablingBlocked(state) || (state.sessionEnabled ?? (state.managedEnabled || state.globalEnabled));
	return {
		checked,
		disabled: isAgentHostSandboxDisablingBlocked(state) || (state.devContainerSandboxSupported === false && !checked),
	};
}

/** Returns the collapsed-control state, using runtime confirmation after an application failure. */
export function getAgentHostSandboxCollapsedState(state: IAgentHostSandboxToggleState): boolean | undefined {
	return getAgentHostSandboxToggleState({
		...state,
		sessionEnabled: state.applyFailed ? state.confirmedEnabled ?? state.sessionEnabled : state.sessionEnabled,
	})?.checked;
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
	const selection = { checked, changedByUser: false };
	const toggle: IActionListItemInlineToggle = {
		label: state.devContainer
			? localize('agentHostSandboxToggle.devContainerLabel', "Sandboxing in Dev Container")
			: localize('agentHostSandboxToggle.label', "Sandboxing for terminal"),
		showInfoIcon: state.devContainer,
		title: state.devContainerSandboxSupported === false
			? checked
				? localize('agentHostSandboxToggle.devContainerUnavailableEnabledTitle', "Sandboxing is requested for this session, but this Dev Container was started without the required Docker options. Recreate it with sandboxing enabled, or turn sandboxing off for this session if your organization permits it.")
				: localize('agentHostSandboxToggle.devContainerUnavailableTitle', "This Dev Container was started without the Docker options required for sandboxing. Recreate it with sandboxing enabled to use this option.")
			: state.devContainer
				? localize('agentHostSandboxToggle.devContainerTitle', "Start the Dev Container with the Docker options needed for terminal sandboxing: unconfined seccomp, AppArmor and system paths, and access to /dev/net/tun. This relaxes the outer container's isolation; terminal commands still run inside their own sandbox.")
				: state.managedEnabled
					? disabled
						? localize('agentHostSandboxToggle.requiredTitle', "Sandboxing is required by your organization")
						: localize('agentHostSandboxToggle.managedBypassTitle', "Your organization allows you to turn sandboxing off for this session. Changes are subject to runtime approval.")
					: localize('agentHostSandboxToggle.title', "Run this session's terminal commands inside a sandbox that restricts file system and network access. The applied setting is saved for this session and checked against current organization policy when restored."),
		get checked() { return selection.checked; },
		get disabled() { return disabled || (state.devContainerSandboxSupported === false && !selection.checked); },
		onChange: enabled => {
			const latest = readState();
			const currentState = getAgentHostSandboxToggleState(latest);
			if (currentState && !currentState.disabled && !(latest.devContainerSandboxSupported === false && enabled) && selection.checked !== enabled) {
				selection.checked = enabled;
				selection.changedByUser = true;
				onChange(enabled);
			}
		},
	};
	toggleSelections.set(toggle, selection);
	return toggle;
}
