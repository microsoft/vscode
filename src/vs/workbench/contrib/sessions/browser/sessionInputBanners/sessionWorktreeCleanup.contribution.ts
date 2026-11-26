/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { localize, localize2 } from '../../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { Extensions as WorkbenchConfigurationExtensions, IConfigurationMigrationRegistry } from '../../../../common/configuration.js';
import { EditorExtensions } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CHAT_CATEGORY } from '../../../chat/browser/actions/chatActions.js';
import { ChatViewId } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { Menus } from '../menus.js';
import { sessionStorageCleanupSuggestionConfigurationMigration } from './sessionStorageCleanupConfiguration.js';
import { SessionWorktreeCleanupAccessibilityHelp } from './sessionWorktreeCleanupAccessibilityHelp.js';
import { SessionWorktreeCleanupEditor } from './sessionWorktreeCleanupEditor.js';
import { SessionWorktreeCleanupEditorInput } from './sessionWorktreeCleanupEditorInput.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, ISessionWorktreeCleanupService, MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID } from './sessionWorktreeCleanupService.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(SessionWorktreeCleanupEditor, SessionWorktreeCleanupEditor.ID, localize('sessionWorktreeCleanupEditor', "Open worktree cleanup editor")),
	[new SyncDescriptor(SessionWorktreeCleanupEditorInput)],
);

registerAction2(class ManageAgentSessionStorageAction extends Action2 {
	constructor() {
		super({
			id: MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID,
			title: localize2('manageAgentSessionStorage', "Open Worktree Cleanup"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: Menus.SidebarSessionsHeader,
				group: '2_manage',
				order: 0,
				when: ChatContextKeys.enabled,
			}, {
				id: MenuId.ViewTitle,
				group: '3_configure',
				order: 14.5,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
			}],
		});
	}

	override async run(accessor: ServicesAccessor, section?: unknown): Promise<void> {
		accessor.get(ISessionWorktreeCleanupService).suppressForWindow();
		const pane = await accessor.get(IEditorService).openEditor(new SessionWorktreeCleanupEditorInput(), { pinned: true });
		if (section === 'automatic' && pane instanceof SessionWorktreeCleanupEditor) {
			pane.focusAutomaticCleanup();
		} else if (section === 'all' && pane instanceof SessionWorktreeCleanupEditor) {
			pane.showAllWorktrees();
		}
	}
});

registerAction2(class DisableSessionStorageCleanupSuggestionsAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chat.disableSessionStorageCleanupSuggestions',
			title: localize2('disableSessionStorageCleanupSuggestions', "Disable Session Storage Cleanup Suggestions"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING}`, true)),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(ISessionWorktreeCleanupService).suppressForWindow();
		await accessor.get(IConfigurationService).updateValue(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, false, ConfigurationTarget.APPLICATION);
		status(localize('sessionStorageCleanupSuggestionsDisabled', "Session storage cleanup suggestions disabled."));
	}
});

AccessibleViewRegistry.register(new SessionWorktreeCleanupAccessibilityHelp());

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			description: localize('chat.agentSessions.sessionStorageCleanupSuggestion', "Controls whether session storage cleanup is suggested when inactive worktrees reach the count or reclaimable-storage threshold, or a local worktree's disk has less than 5 GB available."),
		},
	},
});

Registry.as<IConfigurationMigrationRegistry>(WorkbenchConfigurationExtensions.ConfigurationMigration).registerConfigurationMigrations([
	sessionStorageCleanupSuggestionConfigurationMigration,
]);
