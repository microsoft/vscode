/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Separator } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { McpAuthRequiredReason, McpServerStatusKind, type McpServerSummary } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { type IChatExecuteActionContext } from '../../actions/chatExecuteActions.js';
import { IAgentHostMcpAuthRegistry, type IAgentHostMcpAuthSessionEntry } from './agentHostMcpAuthRegistry.js';
import './media/chatMcpAuthAction.css';

const CHAT_CATEGORY = localize2('chat.category', 'Chat');

/**
 * Toolbar action that surfaces an MCP icon next to the chat send button
 * when the active session has at least one MCP server requiring
 * authentication. Clicking opens a context menu listing each server,
 * plus an "Allow All" entry that authenticates every server in
 * `AuthRequired` state in one go.
 */
export class OpenMcpAuthAction extends Action2 {

	static readonly ID = 'workbench.action.chat.openMcpAuth';

	constructor() {
		super({
			id: OpenMcpAuthAction.ID,
			title: localize2('chat.openMcpAuth.label', "Authenticate MCP Servers"),
			tooltip: localize('chat.openMcpAuth.tooltip', "One or more MCP servers require authentication"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.mcp,
			menu: [{
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.notEquals(ChatContextKeys.mcpAuthRequiredCount.key, 0),
				order: 2,
				group: 'navigation',
			}],
		});
	}

	// `run` is a no-op fallback. The custom view item ({@link McpAuthActionViewItem})
	// handles clicks and shows a context menu anchored at the icon. This
	// path is only reached if the action is invoked outside the toolbar
	// (e.g. via the command palette, which is suppressed by `f1: false`).
	override async run(_accessor: ServicesAccessor, ..._args: unknown[]): Promise<void> {
		// no-op
	}
}

/**
 * Custom view item that renders the {@link OpenMcpAuthAction} icon and,
 * on click, opens a context menu listing each MCP server requiring
 * authentication for the current chat session.
 */
export class McpAuthActionViewItem extends MenuEntryActionViewItem {

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IAgentHostMcpAuthRegistry private readonly _registry: IAgentHostMcpAuthRegistry,
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-mcp-auth-action');
	}

	override async onClick(event: MouseEvent): Promise<void> {
		event.preventDefault();
		event.stopPropagation();

		const widget = (this._context as IChatExecuteActionContext | undefined)?.widget;
		const sessionResource = widget?.viewModel?.sessionResource;
		const entry = sessionResource ? this._registry.getEntry(sessionResource) : undefined;
		if (!entry || !this.element) {
			return;
		}

		showMcpAuthContextMenu(entry, this.element, this._contextMenuService);
	}
}

/**
 * Builds and shows the MCP-auth context menu for `entry` anchored at
 * `anchor`. Lists every server in `AuthRequired` state plus an
 * "Authenticate All" entry when more than one is pending. No-op when
 * no servers need authentication. Reused by the chat-input toolbar
 * action and by the new-chat-input toolbar indicator so both surfaces
 * present an identical menu.
 */
export function showMcpAuthContextMenu(
	entry: IAgentHostMcpAuthSessionEntry,
	anchor: HTMLElement,
	contextMenuService: IContextMenuService,
): void {
	const summaries = entry.mcpServers.get();
	const pending = summaries.filter(s => s.status.kind === McpServerStatusKind.AuthRequired);
	if (pending.length === 0) {
		return;
	}

	const actions: IAction[] = pending.map(summary => ({
		id: `chatMcpAuth.server.${summary.resource}`,
		label: localize('chat.openMcpAuth.server', "Sign in to {0} MCP", summary.label),
		tooltip: describeAuthRequired(summary),
		class: undefined,
		enabled: true,
		checked: undefined,
		run: () => entry.authenticate(summary).catch(() => false),
	}));

	if (pending.length > 1) {
		actions.push(new Separator());
		actions.push({
			id: 'chatMcpAuth.allowAll',
			label: localize('chat.openMcpAuth.allowAll', "Authenticate All"),
			tooltip: '',
			class: undefined,
			enabled: true,
			checked: undefined,
			run: () => entry.authenticate().catch(() => false),
		});
	}

	contextMenuService.showContextMenu({
		getAnchor: () => anchor,
		getActions: () => actions,
	});
}

function describeAuthRequired(summary: McpServerSummary): string {
	if (summary.status.kind !== McpServerStatusKind.AuthRequired) {
		return summary.label;
	}
	if (summary.status.description) {
		return summary.status.description;
	}
	switch (summary.status.reason) {
		case McpAuthRequiredReason.Expired:
			return localize('chat.openMcpAuth.reason.expired', "Authentication expired");
		case McpAuthRequiredReason.InsufficientScope:
			return localize('chat.openMcpAuth.reason.insufficientScope', "Additional permissions required");
		case McpAuthRequiredReason.Required:
		default:
			return localize('chat.openMcpAuth.reason.required', "Authentication required");
	}
}

/**
 * Returns true if the action describes the {@link OpenMcpAuthAction}, so
 * the chat input toolbar can swap in {@link McpAuthActionViewItem} for
 * its slot.
 */
export function isMcpAuthAction(action: IAction): action is MenuItemAction {
	return action instanceof MenuItemAction && action.id === OpenMcpAuthAction.ID;
}

/**
 * Creates a {@link McpAuthActionViewItem} for `action` if it is the MCP
 * auth toolbar action, otherwise returns undefined. Used as a branch in
 * the chat input toolbar's `actionViewItemProvider`.
 */
export function createMcpAuthActionViewItem(action: IAction, options: IMenuEntryActionViewItemOptions | undefined, instantiationService: IInstantiationService): McpAuthActionViewItem | undefined {
	if (!isMcpAuthAction(action)) {
		return undefined;
	}
	return instantiationService.createInstance(McpAuthActionViewItem, action, options);
}

export function registerMcpAuthActions(): void {
	registerAction2(OpenMcpAuthAction);
}

// The factory is exported so consumers can fetch it via the
// instantiation service as needed; the unused parameter silences the
// lint rule that complains about unused references.
export type { IAgentHostMcpAuthSessionEntry };
