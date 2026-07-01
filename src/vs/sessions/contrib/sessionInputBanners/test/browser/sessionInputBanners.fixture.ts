/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISessionInputBanner, SessionInputBannerWidget } from '../../browser/sessionInputBannerWidget.js';

export default defineThemedFixtureGroup({ path: 'sessions/inputBanners/' }, {
	CIFailures: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanners(context, [ciBanner(2, 5, 3)]),
	}),

	CIFailuresLoading: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanners(context, [ciBanner(2, 5, 3)], 480, true),
	}),

	Comments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanners(context, [commentsBanner(3, 'mixed')]),
	}),

	PRComments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanners(context, [commentsBanner(2, 'pr')]),
	}),

	AgentComments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanners(context, [commentsBanner(4, 'agent')]),
	}),

	Both: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanners(context, [ciBanner(1, 4, 0), commentsBanner(1, 'mixed')]),
	}),

	LongTextEllipsis: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanners(context, [ciBanner(12, 18, 0)], 360),
	}),
});

function ciBanner(failed: number, completed: number, pending: number): ISessionInputBanner {
	const failedText = completed === 1 ? '1 check failed' : `${failed} out of ${completed} checks failed`;
	const text = pending > 0 ? `${failedText}, ${pending} pending` : failedText;
	return {
		icon: Codicon.warning,
		accent: true,
		text,
		ariaLabel: text,
		dismissTooltip: 'Hide for this session',
		actions: [
			{ label: 'Fix Checks', primary: true, run: () => console.log('Fix Checks') },
			{ label: 'Reveal Checks', run: () => console.log('Reveal Checks') },
		],
		dismiss: () => console.log('Dismiss CI banner'),
	};
}

function commentsBanner(count: number, kind: 'pr' | 'agent' | 'mixed'): ISessionInputBanner {
	const noun = kind === 'pr' ? 'PR comment' : kind === 'agent' ? 'agent comment' : 'comment';
	const text = count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
	return {
		icon: Codicon.commentDiscussion,
		accent: false,
		text,
		ariaLabel: text,
		dismissTooltip: 'Hide for this session',
		actions: [
			{ label: 'Address Comments', primary: true, run: () => console.log('Address Comments') },
			{ label: 'Reveal Comments', run: () => console.log('Reveal Comments') },
		],
		dismiss: () => console.log('Dismiss comments banner'),
	};
}

function renderBanners({ container, disposableStore, theme }: ComponentFixtureContext, banners: readonly ISessionInputBanner[], width = 480, working = false): void {
	container.style.width = `${width}px`;
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '4px';
	container.style.padding = '8px';
	container.style.backgroundColor = 'var(--vscode-editorWidget-background)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });

	for (const banner of banners) {
		const widget = disposableStore.add(instantiationService.createInstance(SessionInputBannerWidget, banner));
		widget.setWorking(working);
		container.appendChild(widget.domNode);
	}
}
