/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { Context } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { AgentHostPullRequestOperationId } from '../../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { AgentMergeSettingId } from '../../../../../../platform/agentHost/common/agentMerge.js';
import { IsSessionsWindowContext } from '../../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../../../browser/menus.js';
import { SessionAgentMergeEnabledContext, SessionHasOpenPullRequestContext, SessionIsArchivedContext, SessionPrimaryPullRequestOperationContext, SessionProviderIdContext } from '../../../../../common/contextkeys.js';
import '../../browser/agentMergeActions.js';

suite('Agent Merge Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/** A session where Agent Merge applies: agent host provider, live, with an open pull request. */
	function createContext(options: { readonly primaryOperation: string; readonly agentMergeEnabled: boolean; readonly featureEnabled?: boolean; readonly archived?: boolean; readonly hasOpenPullRequest?: boolean }): Context {
		const context = new Context(1, null);
		context.setValue(IsSessionsWindowContext.key, true);
		context.setValue(ChatContextKeys.enabled.key, true);
		context.setValue(SessionProviderIdContext.key, 'local-agent-host');
		context.setValue(SessionIsArchivedContext.key, options.archived ?? false);
		context.setValue(`config.${AgentMergeSettingId.Enabled}`, options.featureEnabled ?? true);
		context.setValue(SessionHasOpenPullRequestContext.key, options.hasOpenPullRequest ?? true);
		context.setValue(SessionPrimaryPullRequestOperationContext.key, options.primaryOperation);
		context.setValue(SessionAgentMergeEnabledContext.key, options.agentMergeEnabled);
		return context;
	}

	function ownsPrimaryButton(options: { readonly primaryOperation: string; readonly agentMergeEnabled: boolean; readonly featureEnabled?: boolean; readonly archived?: boolean; readonly hasOpenPullRequest?: boolean }): boolean {
		const item = MenuRegistry.getMenuItems(Menus.ChangesOperationsDropdown)
			.find(entry => !isIMenuItem(entry) && entry.submenu === Menus.ChangesAgentMerge);
		assert.ok(item, 'Agent Merge is contributed to the changes operations dropdown');
		return item.when?.evaluate(createContext(options)) ?? true;
	}

	test('Agent Merge takes the primary button in the auto-merge states, enabled or not', () => {
		// Agent Merge replaces the auto-merge operations on the button, so it has
		// to take the button while it is still off — enabling it is one of the
		// entries its dropdown offers.
		assert.deepStrictEqual({
			enableAutoMergeWhileOff: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled: false }),
			enableAutoMergeWhileOn: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled: true }),
			disableAutoMergeWhileOff: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.DisableAutoMerge, agentMergeEnabled: false }),
			disableAutoMergeWhileOn: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.DisableAutoMerge, agentMergeEnabled: true }),
			// A blocked pull request advertises no operation at all.
			noOperationWhileOff: ownsPrimaryButton({ primaryOperation: '', agentMergeEnabled: false }),
		}, {
			enableAutoMergeWhileOff: true,
			enableAutoMergeWhileOn: true,
			disableAutoMergeWhileOff: true,
			disableAutoMergeWhileOn: true,
			noOperationWhileOff: true,
		});
	});

	test('Agent Merge owns a draft pull request until CI and review comments are ready', () => {
		assert.deepStrictEqual({
			agentMergeMarkReady: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.MarkReadyWithAgentMerge, agentMergeEnabled: true }),
			staleAgentMergeMarkReady: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.MarkReadyWithAgentMerge, agentMergeEnabled: false }),
			normalMarkReady: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.MarkReady, agentMergeEnabled: true }),
		}, {
			agentMergeMarkReady: true,
			staleAgentMergeMarkReady: false,
			normalMarkReady: false,
		});
	});

	test('Agent Merge leaves the primary button to the operation that moves the pull request along', () => {
		assert.deepStrictEqual({
			markReady: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.MarkReady, agentMergeEnabled: true }),
			merge: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.Merge, agentMergeEnabled: true }),
		}, {
			markReady: false,
			merge: false,
		});
	});

	test('Agent Merge does not stand in where it is unavailable', () => {
		// `chat.agentMerge.enabled` is off by default on stable, and an archived
		// session offers nothing. The auto-merge operations are dropped from the
		// bar regardless, so these states simply offer no button.
		assert.deepStrictEqual({
			featureOff: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled: false, featureEnabled: false }),
			archived: ownsPrimaryButton({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled: true, archived: true }),
			mergeCompleted: ownsPrimaryButton({ primaryOperation: '', agentMergeEnabled: true, hasOpenPullRequest: false }),
		}, {
			featureOff: false,
			archived: false,
			mergeCompleted: false,
		});
	});

	test('the Agent Merge dropdown offers whichever of enable/disable applies', () => {
		const entryVisible = (id: string, agentMergeEnabled: boolean) => {
			const item = MenuRegistry.getMenuItems(Menus.ChangesAgentMerge)
				.find(entry => isIMenuItem(entry) && entry.command.id === id);
			assert.ok(item, `${id} is contributed to the Agent Merge menu`);
			return item.when?.evaluate(createContext({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled })) ?? true;
		};

		assert.deepStrictEqual({
			enableWhileOff: entryVisible('sessions.agentHost.agentMerge.enableInSession', false),
			disableWhileOff: entryVisible('sessions.agentHost.agentMerge.disableInSession', false),
			enableWhileOn: entryVisible('sessions.agentHost.agentMerge.enableInSession', true),
			disableWhileOn: entryVisible('sessions.agentHost.agentMerge.disableInSession', true),
		}, {
			enableWhileOff: true,
			disableWhileOff: false,
			enableWhileOn: false,
			disableWhileOn: true,
		});
	});

	test('the Agent Merge primary menu places its toggle before the configuration submenu', () => {
		const visibleEntries = (menu: typeof Menus.ChangesAgentMerge, agentMergeEnabled: boolean) => MenuRegistry.getMenuItems(menu)
			.filter(entry => entry.group === '1_agentMerge')
			.filter(entry => entry.when?.evaluate(createContext({ primaryOperation: AgentHostPullRequestOperationId.EnableAutoMerge, agentMergeEnabled })) ?? true)
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			.map(entry => isIMenuItem(entry) ? entry.command.id : entry.submenu.id);

		assert.deepStrictEqual({
			operationsWhileOff: visibleEntries(Menus.ChangesOperationsDropdown, false),
			operationsWhileOn: visibleEntries(Menus.ChangesOperationsDropdown, true),
			primaryWhileOff: visibleEntries(Menus.ChangesAgentMerge, false),
			primaryWhileOn: visibleEntries(Menus.ChangesAgentMerge, true),
		}, {
			operationsWhileOff: ['sessions.agentHost.agentMerge.enableInSession', Menus.ChangesAgentMergeConfigure.id],
			operationsWhileOn: ['sessions.agentHost.agentMerge.disableInSession', Menus.ChangesAgentMergeConfigure.id],
			primaryWhileOff: ['sessions.agentHost.agentMerge.enableInSession', Menus.ChangesAgentMergeConfigure.id],
			primaryWhileOn: ['sessions.agentHost.agentMerge.disableInSession', Menus.ChangesAgentMergeConfigure.id],
		});
	});

	test('all Agent Merge configuration entries are nested under Configure Agent Merge', () => {
		const topLevelConfigurationCommands = [Menus.ChangesOperationsDropdown, Menus.ChangesAgentMerge]
			.flatMap(menu => MenuRegistry.getMenuItems(menu))
			.filter(isIMenuItem)
			.map(item => item.command.id)
			.filter(id => id.startsWith('sessions.agentHost.agentMerge.toggle.') || id === 'sessions.agentHost.agentMerge.openDefaults');
		const configurationItems = MenuRegistry.getMenuItems(Menus.ChangesAgentMergeConfigure);

		assert.deepStrictEqual({
			topLevelConfigurationCommands,
			commands: configurationItems.filter(isIMenuItem).map(item => item.command.id),
			submenus: configurationItems.filter(isISubmenuItem).map(item => item.submenu.id),
		}, {
			topLevelConfigurationCommands: [],
			commands: [
				'sessions.agentHost.agentMerge.toggle.addressReviews',
				'sessions.agentHost.agentMerge.toggle.fixCI',
				'sessions.agentHost.agentMerge.toggle.resolveConflicts',
				'sessions.agentHost.agentMerge.openDefaults',
			],
			submenus: Array(3).fill(Menus.ChangesAgentMergeMergePullRequest.id),
		});
	});
});
