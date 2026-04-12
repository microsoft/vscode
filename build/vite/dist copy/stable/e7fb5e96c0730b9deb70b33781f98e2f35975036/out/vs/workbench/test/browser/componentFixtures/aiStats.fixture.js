/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { observableValue } from '../../../../base/common/observable.js';
import { createAiStatsHover } from '../../../contrib/editTelemetry/browser/editStats/aiStatsStatusBar.js';
import { Random } from '../../../../editor/test/common/core/random.js';
import { defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
export default defineThemedFixtureGroup({ path: 'chat/' }, {
    AiStatsHover: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: (context) => renderAiStatsHover({ ...context, data: createSampleDataWithSessions() }),
    }),
    AiStatsHoverNoData: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: (context) => renderAiStatsHover({ ...context, data: createEmptyData() }),
    }),
});
function createSampleDataWithSessions() {
    const random = Random.create(42);
    // Use a fixed base time for determinism (Jan 1, 2025, 12:00:00 UTC)
    const baseTime = 1735732800000;
    const dayMs = 24 * 60 * 60 * 1000;
    const sessionLengthMs = 5 * 60 * 1000;
    // Generate fake session data for the last 7 days
    const fakeSessions = [];
    for (let day = 6; day >= 0; day--) {
        const dayStart = baseTime - day * dayMs;
        const sessionsPerDay = random.nextIntRange(3, 9);
        for (let s = 0; s < sessionsPerDay; s++) {
            const sessionTime = dayStart + s * sessionLengthMs * 2;
            fakeSessions.push({
                startTime: sessionTime,
                typedCharacters: random.nextIntRange(100, 600),
                aiCharacters: random.nextIntRange(200, 1000),
                acceptedInlineSuggestions: random.nextIntRange(1, 16),
                chatEditCount: random.nextIntRange(0, 5),
            });
        }
    }
    const totalAi = fakeSessions.reduce((sum, s) => sum + s.aiCharacters, 0);
    const totalTyped = fakeSessions.reduce((sum, s) => sum + s.typedCharacters, 0);
    const aiRate = totalAi / (totalAi + totalTyped);
    // "Today" for the fixture is the baseTime day
    const startOfToday = baseTime - (baseTime % dayMs);
    const todaySessions = fakeSessions.filter(s => s.startTime >= startOfToday);
    const acceptedToday = todaySessions.reduce((sum, s) => sum + (s.acceptedInlineSuggestions ?? 0), 0);
    return {
        aiRate: observableValue('aiRate', aiRate),
        acceptedInlineSuggestionsToday: observableValue('acceptedToday', acceptedToday),
        sessions: observableValue('sessions', fakeSessions),
    };
}
function createEmptyData() {
    return {
        aiRate: observableValue('aiRate', 0),
        acceptedInlineSuggestionsToday: observableValue('acceptedToday', 0),
        sessions: observableValue('sessions', []),
    };
}
function renderAiStatsHover({ container, disposableStore, data }) {
    container.style.width = '320px';
    container.style.padding = '8px';
    container.style.backgroundColor = 'var(--vscode-editorHoverWidget-background)';
    container.style.border = '1px solid var(--vscode-editorHoverWidget-border)';
    container.style.borderRadius = '4px';
    container.style.color = 'var(--vscode-editorHoverWidget-foreground)';
    const hover = createAiStatsHover({
        data,
        onOpenSettings: () => console.log('Open settings clicked'),
    });
    const elem = hover.keepUpdated(disposableStore).element;
    container.appendChild(elem);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlTdGF0cy5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9haVN0YXRzLmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxrQkFBa0IsRUFBcUIsTUFBTSxzRUFBc0UsQ0FBQztBQUU3SCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDdkUsT0FBTyxFQUEyQixzQkFBc0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRTlHLGVBQWUsd0JBQXdCLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUU7SUFDMUQsWUFBWSxFQUFFLHNCQUFzQixDQUFDO1FBQ3BDLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUU7UUFDOUIsTUFBTSxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEdBQUcsT0FBTyxFQUFFLElBQUksRUFBRSw0QkFBNEIsRUFBRSxFQUFFLENBQUM7S0FDN0YsQ0FBQztJQUVGLGtCQUFrQixFQUFFLHNCQUFzQixDQUFDO1FBQzFDLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUU7UUFDOUIsTUFBTSxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEdBQUcsT0FBTyxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsRUFBRSxDQUFDO0tBQ2hGLENBQUM7Q0FDRixDQUFDLENBQUM7QUFFSCxTQUFTLDRCQUE0QjtJQUNwQyxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUs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