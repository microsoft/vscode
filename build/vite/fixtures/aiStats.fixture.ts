/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableValue } from '../../../src/vs/base/common/observable';
import { createAiStatsHover, IAiStatsHoverData } from '../../../src/vs/workbench/contrib/editTelemetry/browser/editStats/aiStatsStatusBar';
import { ISessionData } from '../../../src/vs/workbench/contrib/editTelemetry/browser/editStats/aiStatsChart';
import { Random } from '../../../src/vs/editor/test/common/core/random';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils';

export default defineThemedFixtureGroup({
	AiStatsHover: defineComponentFixture({
		render: (context) => renderAiStatsHover({ ...context, data: createSampleDataWithSessions() }),
	}),

	AiStatsHoverNoData: defineComponentFixture({
		render: (context) => renderAiStatsHover({ ...context, data: createEmptyData() }),
	}),
});

function createSampleDataWithSessions(): IAiStatsHoverData {
	const random = Random.create(42);

	// Use a fixed base time for determinism (Jan 1, 2025, 12:00:00 UTC)
	const baseTime = 1735732800000;
	const dayMs = 24 * 60 * 60 * 1000;
	const sessionLengthMs = 5 * 60 * 1000;

	// Generate fake session data for the last 7 days
	const fakeSessions: ISessionData[] = [];
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

function createEmptyData(): IAiStatsHoverData {
	return {
		aiRate: observableValue('aiRate', 0),
		acceptedInlineSuggestionsToday: observableValue('acceptedToday', 0),
		sessions: observableValue('sessions', []),
	};
}

interface RenderAiStatsOptions extends ComponentFixtureContext {
	data: IAiStatsHoverData;
}

function renderAiStatsHover({ container, disposableStore, data }: RenderAiStatsOptions): HTMLElement {
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

	return container;
}
