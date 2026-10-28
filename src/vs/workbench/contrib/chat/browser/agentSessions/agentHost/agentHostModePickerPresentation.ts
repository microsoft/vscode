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
import { equals } from '../../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { AnchorPosition } from '../../../../../../base/common/layout.js';
import { DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ActionListItemKind, IActionListItem, IActionListOptions } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { getSessionApprovalProperty, getSessionModeProperty } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { SessionConfigPropertySchema } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ChatPermissionLevel } from '../../../common/constants.js';
import { getCompactCodicon } from '../../chatIcons.js';
import { renderChatInputPickerSplit } from '../../widget/input/chatInputPickerActionItem.js';
import { organizationDefaultLabel } from '../../widget/input/modelPicker/modelPickerBadges.js';

export const AGENT_HOST_PERMISSIONS_SETTINGS_QUERY = '@tag:chatPermissions';

export interface IModePickerPermissions {
	readonly label: string;
	readonly level: ChatPermissionLevel;
	readonly sandboxed: boolean;
}

export interface IModePickerTrigger extends IDisposable {
	readonly modeButton: HTMLElement;
	readonly permissionsButton: HTMLElement;
}

export const MODE_SECTION_ID = 'agentHostModePicker.mode';
export const PERMISSIONS_SECTION_ID = 'agentHostModePicker.permissions';
export const MODE_PERMISSIONS_PICKER_OPEN_ATTRIBUTE = 'data-mode-permissions-picker-open';

const PERMISSION_LEVEL_ORDER: readonly ChatPermissionLevel[] = [
	ChatPermissionLevel.Default,
	ChatPermissionLevel.Assisted,
	ChatPermissionLevel.AutoApprove,
	ChatPermissionLevel.Autopilot,
];

/** A supported permission level the session does not currently allow. */
export interface IUnavailablePermissionLevel {
	readonly level: ChatPermissionLevel;
	/** Whether enterprise policy known to this client explains why the level is unavailable. */
	readonly byPolicy: boolean;
}

export function equalsUnavailablePermissionLevels(a: readonly IUnavailablePermissionLevel[] | undefined, b: readonly IUnavailablePermissionLevel[] | undefined): boolean {
	return equals(a, b, (x, y) => x.level === y.level && x.byPolicy === y.byPolicy);
}

export interface IPermissionLevelUnavailablePresentation {
	/** Visible reason; policy reasons include the managed-policy indicator. */
	readonly description: IMarkdownString;
	readonly hover: IMarkdownString;
	readonly ariaDescription: string;
	/** The reason and explanation for plain-text surfaces. */
	readonly plainText: string;
}

/** Explains why a supported permission level cannot be selected, attributing it to policy only when policy is known. */
export function getPermissionLevelUnavailablePresentation(byPolicy: boolean): IPermissionLevelUnavailablePresentation {
	const description = byPolicy
		? new MarkdownString('$(briefcase) ', { supportThemeIcons: true }).appendMarkdown(localize('agentHostModePicker.policyDisabled', "Disabled by policy"))
		: new MarkdownString(localize('agentHostModePicker.unavailable', "Unavailable"));
	const hover = byPolicy
		? new MarkdownString(localize('agentHostModePicker.policyDisabledHover', "Your organization's policy doesn't allow this permission level."))
		: new MarkdownString(localize('agentHostModePicker.unavailableHover', "The agent host doesn't allow this permission level for this session."));
	const plainText = byPolicy
		? localize('agentHostModePicker.policyDisabledPlain', "Disabled by policy. Your organization's policy doesn't allow this permission level.")
		: localize('agentHostModePicker.unavailablePlain', "Unavailable. The agent host doesn't allow this permission level for this session.");
	return {
		description,
		hover,
		ariaDescription: plainText,
		plainText,
	};
}

/** Orders selectable and unavailable levels together; unsupported levels stay hidden. */
export function getOfferedPermissionLevels(available: readonly ChatPermissionLevel[], unavailable: readonly IUnavailablePermissionLevel[] = []): readonly ChatPermissionLevel[] {
	return PERMISSION_LEVEL_ORDER.filter(level => available.includes(level) || unavailable.some(entry => entry.level === level));
}

export function getPermissionLevelBadge(level: string, disabled = false, organizationDefault?: ChatPermissionLevel): Pick<IActionListItem<unknown>, 'badge' | 'className' | 'additionalBadges'> {
	const additionalBadges = organizationDefault !== undefined && level === organizationDefault ? [{
		label: organizationDefaultLabel,
		className: 'agent-host-org-default-badge',
		tooltip: localize('agentHostModePicker.organizationDefaultDescription', "Your organization sets this as the default for new sessions. You can choose other permissions for this session."),
	}] : undefined;
	return {
		...(level === ChatPermissionLevel.Assisted && !disabled ? {
			badge: localize('agentHostModePicker.new', "New"),
			className: 'agent-host-assisted-permissions',
		} : {}),
		...(additionalBadges ? { additionalBadges } : {}),
	};
}

export function getModePermissionsPickerOptions(openPermissions = false, initialFocusItemId?: string): IActionListOptions {
	return {
		minWidth: 300,
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
	const { primaryButton: modeButton, secondaryButton: permissionsButton } = renderChatInputPickerSplit(trigger, previous?.modeButton, previous?.permissionsButton);
	modeButton.classList.add('agent-host-mode-picker-button', 'agent-host-mode-button');
	permissionsButton.classList.add('agent-host-mode-picker-button', 'agent-host-permissions-button');
	const icon = mode.icon ? renderIcon(getCompactCodicon(mode.icon)) : undefined;
	if (icon) {
		icon.ariaHidden = 'true';
	}
	dom.reset(modeButton, ...(icon ? [icon] : []), dom.$(`span.${mode.labelClassName}`, undefined, mode.label));
	dom.clearNode(permissionsButton);
	renderModePickerPermissions(permissionsButton, permissions);
	trigger.classList.add('agent-host-mode-permissions-trigger');
	modeButton.ariaLabel = localize('agentHostModePicker.modeButton', "Pick Mode, {0}", mode.label);
	permissionsButton.ariaLabel = permissions.sandboxed
		? localize('agentHostModePicker.permissionsButtonSandboxed', "Pick Permissions, {0}, terminal sandboxed", permissions.label)
		: localize('agentHostModePicker.permissionsButton', "Pick Permissions, {0}", permissions.label);
	for (const button of [modeButton, permissionsButton]) {
		button.ariaHasPopup = 'menu';
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
	return !!getSessionApprovalProperty({ type: 'object', properties: { autoApprove: schema } });
}

export function isWellKnownModeSchema(schema: SessionConfigPropertySchema): boolean {
	return !!getSessionModeProperty({ type: 'object', properties: { mode: schema } });
}

export function shouldCombineModeAndPermissions(enabled: boolean, isCopilot: boolean, modeSchema: SessionConfigPropertySchema | undefined, permissionSchema: SessionConfigPropertySchema | undefined): boolean {
	return enabled && isCopilot
		&& !!modeSchema && !modeSchema.readOnly && !modeSchema.enumDynamic && isWellKnownModeSchema(modeSchema)
		&& !!permissionSchema && !permissionSchema.readOnly && !permissionSchema.enumDynamic
		&& !!getSessionApprovalProperty({ type: 'object', properties: { [permissionSchema.enum?.includes('manual') ? 'approvalMode' : 'autoApprove']: permissionSchema } });
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
	return localize('agentHostModePicker.accessibilityHelp', "When the experimental combined picker is enabled for a Copilot Agent Host session or a new Cloud session, Tab reaches separate Mode and Permissions buttons. Press Enter or Space on Mode to open the picker with Agent Mode expanded, or on Permissions to open it with Permissions expanded. Each section header shows its current selection, and the opened section initially focuses that selection. Press Enter or Space on a section header to expand or collapse it, or use Right Arrow to expand and Left Arrow to collapse. Hover or keyboard navigation moves the single row highlight without changing the selection until you activate a choice. Focus the Permissions header and press Tab to reach Configure Permissions, which opens the related settings. Use Up and Down Arrow to navigate and Enter to select a mode, permission level, or terminal sandboxing. Assisted permissions is experimental and evaluates risk before running tools. When Assisted permissions or Allow all is unavailable for a session, the option remains visible but cannot be selected, with a reason such as Disabled by policy. Its hover also explains the restriction. When the session's host requires terminal sandboxing, its sandbox toggle is checked and disabled. If your organization permits bypassing, a supported outside-sandbox permission prompt can offer Allow in this Session. After that action succeeds, you can use the toggle to enable sandboxing again. This restriction applies only to that session. Cloud draft choices are locked while the first request starts the session. Escape closes the picker and returns focus to the button that opened it.");
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
