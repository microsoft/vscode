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

	function createMockSession(overrides: Partial<{
		id: string;
		status: ChatSessionStatus;
		label: string;
		providerLabel: string;
		startTime: number;
		endTime: number;
	}> = {}): IAgentSession {
		const now = Date.now();
		return {
			providerType: 'test',
			providerLabel: overrides.providerLabel ?? 'Background',
			resource: URI.parse(`test://session/${overrides.id ?? 'default'}`),
			status: overrides.status ?? ChatSessionStatus.Completed,
			label: overrides.label ?? 'Explain this screenshot',
			icon: Codicon.terminal,
			timing: {
				startTime: overrides.startTime ?? now,
				endTime: overrides.endTime ?? now,
			},
			isArchived: () => false,
			setArchived: () => { },
			isRead: () => true,
			setRead: () => { },
		};
	}

	function createMockSection(): IAgentSessionSection {
		return {
			section: AgentSessionSection.Today,
			label: 'Today',
			sessions: []
		};
	}

	test('aria label for session has label before provider type', () => {
		const provider = new AgentSessionsAccessibilityProvider();
		const session = createMockSession({
			label: 'Explain this screenshot',
			providerLabel: 'Background',
			status: ChatSessionStatus.Completed
		});

		const ariaLabel = provider.getAriaLabel(session);

		assert.ok(ariaLabel, 'Aria label should not be null');
		// The label "Explain this screenshot" should come before "Background session"
		assert.ok(ariaLabel.startsWith('Explain this screenshot'), 'Aria label should start with the session label');
		assert.ok(ariaLabel.includes('Background session'), 'Aria label should contain provider label and "session"');
		
		// Verify the order by checking indices
		const labelIndex = ariaLabel.indexOf('Explain this screenshot');
		const providerIndex = ariaLabel.indexOf('Background');
		assert.ok(labelIndex < providerIndex, 'Session label should appear before provider label');
	});

	test('aria label includes status', () => {
		const provider = new AgentSessionsAccessibilityProvider();
		const session = createMockSession({
			label: 'Test session',
			status: ChatSessionStatus.Completed
		});

		const ariaLabel = provider.getAriaLabel(session);

		assert.ok(ariaLabel, 'Aria label should not be null');
		assert.ok(ariaLabel.includes('Completed'), 'Aria label should include status');
	});

	test('aria label includes creation time', () => {
		const provider = new AgentSessionsAccessibilityProvider();
		const testTime = new Date('2025-01-01T12:00:00Z').getTime();
		const session = createMockSession({
			startTime: testTime
		});

		const ariaLabel = provider.getAriaLabel(session);

		assert.ok(ariaLabel, 'Aria label should not be null');
		assert.ok(ariaLabel.includes('created'), 'Aria label should mention creation time');
	});

	test('aria label for section', () => {
		const provider = new AgentSessionsAccessibilityProvider();
		const section = createMockSection();

		const ariaLabel = provider.getAriaLabel(section);

		assert.ok(ariaLabel, 'Aria label should not be null');
		assert.ok(ariaLabel.includes('Today'), 'Aria label should include section label');
		assert.ok(ariaLabel.includes('sessions section'), 'Aria label should indicate it is a section');
	});

	test('widget aria label', () => {
		const provider = new AgentSessionsAccessibilityProvider();
		const widgetLabel = provider.getWidgetAriaLabel();

		assert.strictEqual(widgetLabel, 'Agent Sessions');
	});
});
