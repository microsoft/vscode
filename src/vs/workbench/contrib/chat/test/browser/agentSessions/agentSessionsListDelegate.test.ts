/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionSection, IAgentSession, IAgentSessionSection } from '../../../browser/agentSessions/agentSessionsModel.js';
import { AgentSessionRenderer, AgentSessionsListDelegate } from '../../../browser/agentSessions/agentSessionsViewer.js';
import { ChatSessionStatus } from '../../../common/chatSessionsService.js';

suite('AgentSessionsListDelegate', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session: IAgentSession = {
		providerType: 'test',
		providerLabel: 'Test',
		resource: URI.parse('test://session/default'),
		status: ChatSessionStatus.Completed,
		label: 'Session',
		icon: Codicon.terminal,
		timing: {
			created: Date.now(),
			lastRequestStarted: undefined,
			lastRequestEnded: undefined,
		},
		isArchived: () => false,
		setArchived: () => { },
		isPinned: () => false,
		setPinned: () => { },
		isRead: () => true,
		isMarkedUnread: () => false,
		setRead: () => { },
	};

	const section: IAgentSessionSection = {
		section: AgentSessionSection.Today,
		label: 'Today',
		sessions: [session],
	};

	test('uses default heights', () => {
		const delegate = new AgentSessionsListDelegate();

		assert.deepStrictEqual({
			item: delegate.getHeight(session),
			section: delegate.getHeight(section),
		}, {
			item: AgentSessionsListDelegate.ITEM_HEIGHT,
			section: AgentSessionsListDelegate.SECTION_HEIGHT,
		});
	});

	test('reads current Modern UI heights', () => {
		let itemHeight = AgentSessionsListDelegate.COMPACT_ITEM_HEIGHT;
		let sectionHeight = AgentSessionsListDelegate.SPACED_SECTION_HEIGHT;
		const delegate = new AgentSessionsListDelegate(undefined, undefined, () => itemHeight, () => sectionHeight);

		const modernUI = {
			item: delegate.getHeight(session),
			section: delegate.getHeight(section),
		};

		itemHeight = AgentSessionsListDelegate.ITEM_HEIGHT;
		sectionHeight = AgentSessionsListDelegate.SECTION_HEIGHT;

		assert.deepStrictEqual({
			modernUI,
			defaultUI: {
				item: delegate.getHeight(session),
				section: delegate.getHeight(section),
			},
		}, {
			modernUI: {
				item: 52,
				section: 30,
			},
			defaultUI: {
				item: 54,
				section: 26,
			},
		});
	});

	test('calculates approval row heights', () => {
		assert.deepStrictEqual([
			AgentSessionRenderer.getApprovalRowHeight('one'),
			AgentSessionRenderer.getApprovalRowHeight('one\ntwo'),
			AgentSessionRenderer.getApprovalRowHeight('one\ntwo\nthree'),
			AgentSessionRenderer.getApprovalRowHeight('one\ntwo\nthree\nfour'),
		], [32, 50, 68, 68]);
	});
});
