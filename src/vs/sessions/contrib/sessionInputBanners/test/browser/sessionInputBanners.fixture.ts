/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
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

	CommentsLoading: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanners(context, [commentsBanner(3, 'mixed')], 480, true),
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
		render: (context) => renderBanners(context, [combinedPRBanner(42, 1, 3)]),
	}),

	MultiplePullRequests: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanners(context, [
			combinedPRBanner(42, 2, 3, true),
			{ ...commentsBanner(4, 'pr'), id: 'pr-43', text: '4 PR Comments', ariaLabel: '#43, 4 PR Comments', reference: { label: '#43', hover: 'Pull Request #43: Improve session rendering' } },
			{ ...ciBanner(1, 2, 0), id: 'pr-44', text: '1 Check Failing', ariaLabel: '#44, 1 Check Failing', reference: { label: '#44', hover: 'Pull Request #44: Fix accessibility labels' } },
		]),
	}),

	CombinedNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderBanners(context, [combinedPRBanner(42, 2, 3)], 360),
	}),

	CommentsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderBanners(context, [commentsBanner(3, 'pr')], 280),
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
			{ label: 'Reveal', run: () => console.log('Open Pull Request') },
		],
		dismiss: () => console.log('Dismiss CI banner'),
	};
}

function commentsBanner(count: number, kind: 'pr' | 'agent' | 'mixed'): ISessionInputBanner {
	const noun = kind === 'pr' ? 'PR Comment' : kind === 'agent' ? 'Agent Comment' : 'Comment';
	const text = count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
	return {
		icon: Codicon.commentDiscussion,
		accent: false,
		text,
		ariaLabel: text,
		dismissTooltip: 'Hide for this session',
		actions: [
			{ label: 'Address Comments', primary: true, run: () => console.log('Address Comments') },
			{ label: 'Reveal', run: () => console.log('Reveal Comments') },
		],
		dismiss: () => console.log('Dismiss comments banner'),
	};
}

function combinedPRBanner(number: number, failed: number, comments: number, multiplePullRequests = false): ISessionInputBanner {
	const fixCI = { label: 'Fix Checks', primary: true, run: () => console.log('Fix Checks') };
	const addressComments = { label: 'Address Comments', primary: true, run: () => console.log('Address Comments') };
	const reference = multiplePullRequests
		? { reference: { label: `#${number}`, hover: `Pull Request #${number}: Add multi-PR banner support` } }
		: {};
	return {
		id: `pr-${number}`,
		icon: Codicon.warning,
		accent: true,
		text: `${failed} Checks Failing | ${comments} PR Comments`,
		ariaLabel: multiplePullRequests
			? `#${number}, ${failed} Checks Failing, ${comments} PR Comments`
			: `${failed} Checks Failing, ${comments} PR Comments`,
		...reference,
		dismissTooltip: 'Hide this item for this session',
		actions: [{
			label: 'Fix Checks & Address Comments',
			primary: true,
			dropdownActions: [fixCI, addressComments],
			run: () => console.log('Fix Checks and Address Comments'),
		}],
		dismiss: () => console.log('Dismiss PR banner'),
	};
}

function renderBanners({ container, disposableStore, theme }: ComponentFixtureContext, banners: readonly ISessionInputBanner[], width = 480, working = false): void {
	container.style.width = `${width}px`;
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '4px';
	container.style.padding = '8px';
	container.style.backgroundColor = 'var(--vscode-editorWidget-background)';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registerWorkbenchServices,
	});

	const widget = disposableStore.add(instantiationService.createInstance(SessionInputBannerWidget, banners));
	widget.setWorking(working);
	container.appendChild(widget.domNode);
}
