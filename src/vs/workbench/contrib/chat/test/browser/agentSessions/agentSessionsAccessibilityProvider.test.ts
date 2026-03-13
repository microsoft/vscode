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
			isArchived: () => false,
			setArchived: () => { },
			isRead: () => true,
			setRead: () => { },
		};
	}

	function createMockSection(section: AgentSessionSection = AgentSessionSection.Today): IAgentSessionSection {
		return {
			section,
			label: 'Today',
			sessions: []
		};
	}

	setup(() => {
		accessibilityProvider = new AgentSessionsAccessibilityProvider();
	});

	test('getWidgetRole returns list', () => {
		assert.strictEqual(accessibilityProvider.getWidgetRole(), 'list');
	});

	test('getRole returns listitem for session', () => {
		const session = createMockSession();
		assert.strictEqual(accessibilityProvider.getRole(session), 'listitem');
	});

	test('getRole returns listitem for section', () => {
		const section = createMockSection();
		assert.strictEqual(accessibilityProvider.getRole(section), 'listitem');
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

	test('getAriaLabel returns correct label for section', () => {
		const section = createMockSection();
		const ariaLabel = accessibilityProvider.getAriaLabel(section);

		assert.ok(ariaLabel);
		assert.ok(ariaLabel.includes('sessions section'), 'Aria label should indicate it is a section');
	});
});
