/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentHostModePicker.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IListAccessibilityProvider } from '../../../../../../base/browser/ui/list/listWidget.js';
import { IAction, toAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { AnchorPosition } from '../../../../../../base/common/layout.js';
import { DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ActionListItemKind, IActionListItem, IActionListOptions } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { KNOWN_AUTO_APPROVE_VALUES } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { SessionConfigPropertySchema } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { TerminalContribSettingId } from '../../../../terminal/terminalContribExports.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../common/constants.js';
import { getCompactCodicon } from '../../chatIcons.js';

export const AGENT_HOST_PERMISSIONS_SETTINGS_QUERY = `@id:${[
	ChatConfiguration.DefaultConfiguration,
	ChatConfiguration.DefaultPermissionLevel,
	ChatConfiguration.AssistedPermissionsEnabled,
	ChatConfiguration.GlobalAutoApprove,
	ChatConfiguration.AutoApproveEdits,
	ChatConfiguration.AutoApprovedUrls,
	ChatConfiguration.EligibleForAutoApproval,
	'chat.tools.riskAssessment.*',
	TerminalContribSettingId.EnableAutoApprove,
	TerminalContribSettingId.AutoApprove,
	TerminalContribSettingId.AutoApproveWorkspaceNpmScripts,
	TerminalContribSettingId.IgnoreDefaultAutoApproveRules,
	TerminalContribSettingId.BlockDetectedFileWrites,
	'chat.agent.sandbox.*',
	'chat.agentHost.sdkSandbox.*',
].join(',')}`;

export interface IModePickerPermissions {
	readonly label: string;
	readonly level: ChatPermissionLevel;
	readonly sandboxed: boolean;
}

export interface IModePickerTrigger extends IDisposable {
	readonly modeButton: HTMLElement;
	readonly permissionsButton: HTMLElement;
}

const MODE_SECTION_ID = 'agentHostModePicker.mode';
const PERMISSIONS_SECTION_ID = 'agentHostModePicker.permissions';
export const MODE_PERMISSIONS_PICKER_OPEN_ATTRIBUTE = 'data-mode-permissions-picker-open';

export function getModePermissionsPickerOptions(openPermissions = false, initialFocusItemId?: string): IActionListOptions {
	return {
		minWidth: 260,
		anchorPosition: AnchorPosition.ABOVE,
		useFullHeight: true,
		widgetClassName: 'agent-host-mode-permissions-popup',
		collapsedByDefault: new Set([openPermissions ? MODE_SECTION_ID : PERMISSIONS_SECTION_ID]),
		initialFocusItemId,
		reserveSubmenuSpace: false,
	};
}

export function createModePickerModeItems<T extends { readonly checked?: boolean }>(items: readonly IActionListItem<T>[], combined: boolean): IActionListItem<T | IAction>[] {
	if (!combined) {
		return [...items];
	}
	const label = localize('agentHostModePicker.agentMode', "Agent mode");
	const currentMode = items.find(item => item.item?.checked)?.label;
	return [{
		kind: ActionListItemKind.Action,
		label,
		item: toAction({ id: MODE_SECTION_ID, label, run: () => { } }),
		section: MODE_SECTION_ID,
		isSectionToggle: true,
		description: currentMode,
		ariaDescription: currentMode
			? localize('agentHostModePicker.currentMode', "Current mode: {0}", currentMode)
			: undefined,
		className: 'agent-host-mode-section',
	}, ...items.map(item => ({
		...item,
		section: MODE_SECTION_ID,
	})), {
		kind: ActionListItemKind.Separator,
		section: MODE_SECTION_ID,
	}];
}

export function getModePermissionsPickerAccessibilityProvider<T extends { readonly checked?: boolean }>(combined: boolean): Partial<IListAccessibilityProvider<IActionListItem<T>>> {
	if (!combined) {
		return {};
	}
	const getChecked = (element: IActionListItem<T>) => element.kind === ActionListItemKind.Action && !element.isSectionToggle && !element.standaloneToggle
		? element.item?.checked
		: undefined;
	return {
		isChecked: getChecked,
		getRole: element => element.kind === ActionListItemKind.Action
			? getChecked(element) !== undefined ? 'menuitemradio' : 'menuitem'
			: 'separator',
		getWidgetRole: () => 'menu',
	};
}

export function renderModePickerTrigger(
	trigger: HTMLElement,
	mode: { readonly label: string; readonly icon: ThemeIcon | undefined; readonly labelClassName: string },
	permissions: IModePickerPermissions,
	openPicker: (anchor: HTMLElement, openPermissions: boolean) => void,
	previous?: IModePickerTrigger,
): IModePickerTrigger {
	const store = new DisposableStore();
	const modeButton = previous?.modeButton ?? dom.$('a.agent-host-mode-picker-button.agent-host-mode-button');
	const icon = mode.icon ? renderIcon(getCompactCodicon(mode.icon)) : undefined;
	if (icon) {
		icon.ariaHidden = 'true';
	}
	dom.reset(modeButton, ...(icon ? [icon] : []), dom.$(`span.${mode.labelClassName}`, undefined, mode.label));
	const permissionsButton = previous?.permissionsButton ?? dom.$('a.agent-host-mode-picker-button.agent-host-permissions-button');
	dom.clearNode(permissionsButton);
	renderModePickerPermissions(permissionsButton, permissions);
	if (modeButton.parentElement !== trigger || permissionsButton.parentElement !== trigger) {
		dom.reset(trigger, modeButton, permissionsButton);
	}
	trigger.classList.add('agent-host-mode-permissions-trigger');
	trigger.role = 'group';
	trigger.tabIndex = -1;
	trigger.removeAttribute('aria-haspopup');
	trigger.removeAttribute('aria-expanded');
	modeButton.ariaLabel = localize('agentHostModePicker.modeButton', "Pick Mode, {0}", mode.label);
	permissionsButton.ariaLabel = permissions.sandboxed
		? localize('agentHostModePicker.permissionsButtonSandboxed', "Pick Permissions, {0}, terminal sandboxed", permissions.label)
		: localize('agentHostModePicker.permissionsButton', "Pick Permissions, {0}", permissions.label);
	for (const button of [modeButton, permissionsButton]) {
		button.role = 'button';
		button.tabIndex = trigger.ariaDisabled === 'true' ? -1 : 0;
		button.ariaDisabled = trigger.ariaDisabled;
		button.ariaHasPopup = 'menu';
		button.ariaExpanded ??= 'false';
		store.add(Gesture.addTarget(button));
		const open = () => {
			if (trigger.ariaDisabled !== 'true') {
				openPicker(button, button === permissionsButton);
			}
		};
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			store.add(dom.addDisposableListener(button, eventType, e => {
				dom.EventHelper.stop(e, true);
				open();
			}));
		}
		store.add(dom.addDisposableListener(button, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
				dom.EventHelper.stop(e, true);
				open();
			}
		}));
	}
	return { modeButton, permissionsButton, dispose: () => store.dispose() };
}

export function isWellKnownAutoApproveSchema(schema: SessionConfigPropertySchema): boolean {
	return schema.type === 'string'
		&& Array.isArray(schema.enum)
		&& schema.enum.includes('default')
		&& schema.enum.every(value => typeof value === 'string' && KNOWN_AUTO_APPROVE_VALUES.has(value));
}

export function isWellKnownModeSchema(schema: SessionConfigPropertySchema): boolean {
	return schema.type === 'string' && Array.isArray(schema.enum) && schema.enum.includes('interactive');
}

export function shouldCombineModeAndPermissions(enabled: boolean, isCopilot: boolean, modeSchema: SessionConfigPropertySchema | undefined, permissionSchema: SessionConfigPropertySchema | undefined): boolean {
	return enabled && isCopilot
		&& !!modeSchema && !modeSchema.readOnly && !modeSchema.enumDynamic && isWellKnownModeSchema(modeSchema)
		&& !!permissionSchema && !permissionSchema.readOnly && !permissionSchema.enumDynamic && isWellKnownAutoApproveSchema(permissionSchema);
}

export function renderModePickerPermissions(trigger: HTMLElement, permissions: IModePickerPermissions): void {
	const summary = dom.append(trigger, dom.$('span.agent-host-mode-permission-summary'));
	summary.textContent = permissions.label;
	const style = getPermissionLevelStyle(permissions.level);
	if (style) {
		summary.classList.add(style);
	}
	if (permissions.sandboxed) {
		const shield = dom.append(trigger, renderIcon(Codicon.shieldCompact));
		shield.classList.add('agent-host-mode-sandbox-icon');
		shield.ariaHidden = 'true';
	}
}

export function getModePickerAriaLabel(mode: string, permissions: IModePickerPermissions): string {
	return permissions.sandboxed
		? localize('agentHostModePicker.withSandboxedPermissions', "Pick Mode and Permissions, {0}, {1}, terminal sandboxed", mode, permissions.label)
		: localize('agentHostModePicker.withPermissions', "Pick Mode and Permissions, {0}, {1}", mode, permissions.label);
}

export function getModePickerAccessibilityHelp(): string {
	return localize('agentHostModePicker.accessibilityHelp', "When the experimental combined picker is enabled for a Copilot Agent Host session, Tab reaches separate Mode and Permissions buttons. Press Enter or Space on Mode to open the picker with Agent Mode expanded, or on Permissions to open it with Permissions expanded. Each section header shows its current selection, and the opened section initially focuses that selection. Press Enter or Space on a section header to expand or collapse it, or use Right Arrow to expand and Left Arrow to collapse. Hover or keyboard navigation moves the single row highlight without changing the selection until you activate a choice. Focus the Permissions header and press Tab to reach Configure Permissions, which opens the related settings. Use Up and Down Arrow to navigate and Enter to select a mode, permission level, or terminal sandboxing. Escape closes the picker and returns focus to the button that opened it.");
}

function getPermissionLevelStyle(level: ChatPermissionLevel): string | undefined {
	switch (level) {
		case ChatPermissionLevel.Assisted: return 'warning';
		case ChatPermissionLevel.AutoApprove: return 'info';
		default: return undefined;
	}
}

function getShortPermissionLabel(permissions: IModePickerPermissions): string {
	switch (permissions.level) {
		case ChatPermissionLevel.Default: return localize('agentHostModePicker.manual', "Manual");
		case ChatPermissionLevel.Assisted: return localize('agentHostModePicker.assisted', "Assisted");
		case ChatPermissionLevel.AutoApprove: return localize('agentHostModePicker.allowAll', "Allow all");
		default: return permissions.label;
	}
}

export function createModePickerPermissionsItems<T>(permissions: IModePickerPermissions, items: readonly IActionListItem<IAction>[], configurePermissions: () => Promise<void>): IActionListItem<T | IAction>[] {
	const label = localize('agentHostModePicker.permissions', "Permissions");
	return [{
		kind: ActionListItemKind.Action,
		label,
		item: toAction({ id: PERMISSIONS_SECTION_ID, label, run: () => { } }),
		section: PERMISSIONS_SECTION_ID,
		isSectionToggle: true,
		description: getShortPermissionLabel(permissions),
		ariaDescription: permissions.sandboxed
			? localize('agentHostModePicker.permissionsSandboxed', "{0}, terminal sandboxed", permissions.label)
			: permissions.label,
		className: ['agent-host-mode-permissions', getPermissionLevelStyle(permissions.level)].filter(Boolean).join(' '),
		toolbarActions: [toAction({
			id: 'agentHostModePicker.configurePermissions',
			label: localize('agentHostModePicker.configurePermissions', "Configure Permissions"),
			class: ThemeIcon.asClassName(Codicon.gear),
			run: configurePermissions,
		})],
	}, ...items.map(item => ({
		...item,
		section: PERMISSIONS_SECTION_ID,
	}))];
}
