/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionsAccessibilityProvider } from '../../../browser/agentSessions/agentSessionsViewer.js';
import { AgentSessionSection, IAgentSession, IAgentSessionSection } from '../../../browser/agentSessions/agentSessionsModel.js';
import { ChatSessionStatus } from '../../../common/chatSessionsService.js';
import { Codicon } from '../../../../../../base/common/codicons.js';

suite('AgentSessionsAccessibilityProvider', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let accessibilityProvider: AgentSessionsAccessibilityProvider;

	function createMockSession(overrides: Partial<{
		id: string;
		label: string;
		providerLabel: string;
		status: ChatSessionStatus;
		children: readonly IAgentSession[];
		parentSession: { readonly resource: URI; readonly label: string };
	}> = {}): IAgentSession {
		const now = Date.now();
		return {
			providerType: 'test',
			providerLabel: overrides.providerLabel ?? 'Test',
			resource: URI.parse(`test://session/${overrides.id ?? 'default'}`),
			status: overrides.status ?? ChatSessionStatus.Completed,
			label: overrides.label ?? `Session ${overrides.id ?? 'default'}`,
			icon: Codicon.terminal,
			timing: {
				created: now,
				lastRequestEnded: undefined,
				lastRequestStarted: undefined,
			},
			changes: undefined,
			children: overrides.children,
			parentSession: overrides.parentSession,
			isArchived: () => false,
			setArchived: () => { },
			isPinned: () => false,
			setPinned: () => { },
			isRead: () => true,
			isMarkedUnread: () => false,
			setRead: () => { },
		};
	}

	function createMockSection(section: AgentSessionSection = AgentSessionSection.Today, sessions: IAgentSession[] = []): IAgentSessionSection {
		return {
			section,
			label: 'Today',
			sessions
		};
	}

	setup(() => {
		accessibilityProvider = new AgentSessionsAccessibilityProvider();
	});

	test('getWidgetRole returns tree', () => {
		assert.strictEqual(accessibilityProvider.getWidgetRole(), 'tree');
	});

	test('getRole returns treeitem for session', () => {
		const session = createMockSession();
		assert.strictEqual(accessibilityProvider.getRole(session), 'treeitem');
	});

	test('getRole returns treeitem for section', () => {
		const section = createMockSection();
		assert.strictEqual(accessibilityProvider.getRole(section), 'treeitem');
	});

	test('getWidgetAriaLabel returns correct label', () => {
		assert.strictEqual(accessibilityProvider.getWidgetAriaLabel(), 'Agent Sessions');
	});

	test('getAriaLabel returns correct label for session', () => {
		const session = createMockSession({
			id: 'test-session',
			label: 'Test Session Title',
			providerLabel: 'Agent'
		});

		const ariaLabel = accessibilityProvider.getAriaLabel(session);

		assert.ok(ariaLabel);
		assert.ok(ariaLabel.includes('Test Session Title'), 'Aria label should include the session title');
		assert.ok(ariaLabel.includes('Agent'), 'Aria label should include the provider label');
	});

	test('getAriaLabel distinguishes session parents and chat children', () => {
		const child = createMockSession({
			id: 'child',
			label: 'Peer chat',
			parentSession: { resource: URI.parse('test://session/parent'), label: 'Parent session' },
		});
		const parent = createMockSession({
			id: 'parent',
			label: 'Parent session',
			children: [child],
		});

		assert.deepStrictEqual({
			parent: accessibilityProvider.getAriaLabel(parent),
			child: accessibilityProvider.getAriaLabel(child),
		}, {
			parent: `${parent.providerLabel} session Parent session, 1 peer chat (Completed), created ${new Date(parent.timing.created).toLocaleString()}`,
			child: 'Peer chat, chat in session Parent session (Completed)',
		});
	});

	test('getAriaLabel returns singular label for section with 1 session', () => {
		const section = createMockSection(AgentSessionSection.Today, [createMockSession({ id: 'a' })]);
		const ariaLabel = accessibilityProvider.getAriaLabel(section);

		assert.ok(ariaLabel);
		assert.ok(ariaLabel.includes('sessions section'), 'Aria label should indicate it is a section');
		assert.ok(ariaLabel.includes('1 session'), 'Aria label should include session count');
		assert.ok(!ariaLabel.includes('1 sessions'), 'Aria label should use singular form');
	});

	test('getAriaLabel returns plural label for section with multiple sessions', () => {
		const section = createMockSection(AgentSessionSection.Today, [createMockSession({ id: 'a' }), createMockSession({ id: 'b' })]);
		const ariaLabel = accessibilityProvider.getAriaLabel(section);

		assert.ok(ariaLabel);
		assert.ok(ariaLabel.includes('sessions section'), 'Aria label should indicate it is a section');
		assert.ok(ariaLabel.includes('2 sessions'), 'Aria label should include session count with plural form');
	});
});
