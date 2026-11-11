/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { IChatWidget, IChatWidgetService } from '../../../../chat/browser/chat.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { AgentsChatViewHostDelegate } from '../../../browser/agentsView/agentsChatViewHostDelegate.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';

suite('AgentsChatViewHostDelegate', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createDelegate(chatAvailable: boolean) {
		const calls: string[] = [];
		const composerWidget = upcastPartial<IChatWidget>({});
		const chatPart = upcastPartial<IAgentsChatPartService>({
			activeChat: constObservable(undefined),
			show: async (_target, options) => { calls.push(`show preserveFocus=${options?.preserveFocus}`); },
			openComposer: async (target, options) => { calls.push(`openComposer sessionType=${target?.sessionTypeId} newComposer=${options?.newComposer}`); },
			getComposerWidget: async () => composerWidget,
			openChat: async () => { calls.push('openChat'); },
		});
		const delegate = new AgentsChatViewHostDelegate(
			chatPart,
			upcastPartial<ISessionsManagementService>({ getSessionForChatResource: () => undefined }),
			upcastPartial<IChatWidgetService>({ getAllWidgets: () => [] }),
			upcastPartial<IWorkbenchLayoutService>({ isVisible: () => false }),
			upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }) }),
			upcastPartial<IContextKeyService>({ contextMatchesRules: () => chatAvailable }),
		);
		return { delegate, calls, composerWidget };
	}

	test('what would show the Chat view gets the widget of the composer it shows, whose submits create the session', async () => {
		const { delegate, calls, composerWidget } = createDelegate(true);

		const revealed = await delegate.reveal(true);
		const created = await delegate.newSession('agent-host-copilot', false);

		assert.deepStrictEqual({ revealed: revealed === composerWidget, created: created === composerWidget, calls }, {
			revealed: true,
			created: true,
			calls: ['show preserveFocus=true', 'openComposer sessionType=agent-host-copilot newComposer=true'],
		});
	});

	test('shows nothing while chat is hidden or disabled, such as with AI features off', async () => {
		const { delegate, calls } = createDelegate(false);

		const results = [await delegate.reveal(undefined), await delegate.newSession(undefined, undefined), await delegate.openSession(URI.parse('test:/chat'), undefined)];
		await delegate.toggle();

		assert.deepStrictEqual({ results, calls }, { results: [undefined, undefined, undefined], calls: [] });
	});
});
