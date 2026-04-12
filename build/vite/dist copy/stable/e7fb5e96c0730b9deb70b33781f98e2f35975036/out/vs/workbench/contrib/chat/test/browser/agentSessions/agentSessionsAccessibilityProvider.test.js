/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionsAccessibilityProvider } from '../../../browser/agentSessions/agentSessionsViewer.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
suite('AgentSessionsAccessibilityProvider', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let accessibilityProvider;
    function createMockSession(overrides = {}) {
        const now = Date.now();
        return {
            providerType: 'test',
            providerLabel: overrides.providerLabel ?? 'Test',
            resource: URI.parse(`test://session/${overrides.id ?? 'default'}`),
            status: overrides.status ?? 1 /* ChatSessionStatus.Completed */,
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
            isPinned: () => false,
            setPinned: () => { },
            isRead: () => true,
            isMarkedUnread: () => false,
            setRead: () => { },
        };
    }
    function createMockSection(section = "today" /* AgentSessionSection.Today */, sessions = []) {
        return {
            section,
            label: 'Today',
            sessions
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
    test('getAriaLabel returns singular label for section with 1 session', () => {
        const section = createMockSection("today" /* AgentSessionSection.Today */, [createMockSession({ id: 'a' })]);
        const ariaLabel = accessibilityProvider.getAriaLabel(section);
        assert.ok(ariaLabel);
        assert.ok(ariaLabel.includes('sessions section'), 'Aria label should indicate it is a section');
        assert.ok(ariaLabel.includes('1 session'), 'Aria label should include session count');
        assert.ok(!ariaLabel.includes('1 sessions'), 'Aria label should use singular form');
    });
    test('getAriaLabel returns plural label for section with multiple sessions', () => {
        const section = createMockSection("today" /* AgentSessionSection.Today */, [createMockSession({ id: 'a' }), createMockSession({ id: 'b' })]);
        const ariaLabel = accessibilityProvider.getAriaLabel(section);
        assert.ok(ariaLabel);
        assert.ok(ariaLabel.includes('sessions section'), 'Aria label should indicate it is a section');
        assert.ok(ariaLabel.includes('2 sessions'), 'Aria label should include session count with plural form');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc0FjY2Vzc2liaWxpdHlQcm92aWRlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zQWNjZXNzaWJpbGl0eVByb3ZpZGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUczRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFcEUsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRTtJQUVoRCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUkscUJBQXlELENBQUM7SUFFOUQsU0FBUyxpQkFBaUIsQ0FBQyxZQUt0QixFQUFFO1FBQ04sTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3ZCLE9BQU87WUFDTixZQUFZLEVBQUUsTUFBTTtZQUNwQixhQUFhLEVBQUUsU0FBUyxDQUFDLGFBQWEsSUFBSSxNQUFNO1lBQ2hELFFBQVEsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLGtCQUFrQixTQUFTLENBQUMsRUFBRSxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2xFLE1BQU0sRUFBRSxTQUFTLENBQUMsTUFBTSx1Q0FBK0I7WUFDdkQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxLQUFLLElBQUksV0FBVyxTQUFTLENBQUMsRUFBRSxJQUFJLFNBQVMsRUFBRTtZQUNo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