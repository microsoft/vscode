/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
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
	function createContext(options: { readonly primaryOperation: string; readonly agentMergeEnabled: boolean; readonly featureEnabled?: boolean; readonly archived?: boolean }): Context {
		const context = new Context(1, null);
		context.setValue(IsSessionsWindowContext.key, true);
		context.setValue(ChatContextKeys.enabled.key, true);
		context.setValue(SessionProviderIdContext.key, 'local-agent-host');
		context.setValue(SessionIsArchivedContext.key, options.archived ?? false);
		context.setValue(`config.${AgentMergeSettingId.Enabled}`, options.featureEnabled ?? true);
		context.setValue(SessionHasOpenPullRequestContext.key, true);
		context.setValue(SessionPrimaryPullRequestOperationContext.key, options.primaryOperation);
		context.setValue(SessionAgentMergeEnabledContext.key, options.agentMergeEnabled);
		return context;
	}

	function ownsPrimaryButton(options: { readonly primaryOperation: string; readonly agentMergeEnabled: boolean; readonly featureEnabled?: boolean; readonly archived?: boolean }): boolean {
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
		}, {
			featureOff: false,
			archived: false,
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
});
