/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { isLightScheme } from './colorGroupsMockupColors.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SessionStatus } from '../../../../../services/sessions/common/session.js';
import { SessionsGrouping } from '../../../browser/views/sessionsList.js';
import { defineSessionsListFixture, ISessionsListFixtureSession } from '../sessionsListFixtureUtils.js';
import { MockDensity, MockGroupStyle } from './colorGroupsMockupList.js';
import { getGroup } from './colorGroupsMockupModel.js';
import { IColorGroupsMockupOptions, IColorGroupsMockupSnapshot, MockSwitcherStyle, MockThemeKind, renderColorGroupsMockup } from './colorGroupsMockupView.js';

/*
 * UX mockup: colored session groups and collections for the Agents window.
 *
 * Open the interactive demo on its own page:
 *   http://localhost:5123/___explorer?mode=embedded&fixture=sessions/colorGroupsMockup/Interactive/Dark
 */

type MockupOptions = IColorGroupsMockupOptions | ((context: ComponentFixtureContext) => IColorGroupsMockupOptions);

function mockup(options: MockupOptions, after?: (result: Awaited<ReturnType<typeof renderColorGroupsMockup>>, context: ComponentFixtureContext) => void | Promise<void>, fixtureOptions: { readonly realTime?: boolean } = {}) {
	return defineComponentFixture({
		themes: ['dark'],
		additionalThemes: ['light2026', 'darkHighContrast'],
		// The live demo runs pretend agent turns on real timers; virtual time would strand timers created during render.
		virtualTime: fixtureOptions.realTime ? { enabled: false } : undefined,
		render: async context => {
			const result = await renderColorGroupsMockup(context, typeof options === 'function' ? options(context) : options);
			await after?.(result, context);
		},
	});
}

//#region Theme switching

const THEME_SNAPSHOT_KEY = 'colorGroupsMockup.themeSnapshot';
const THEME_FIXTURE_VARIANTS: Readonly<Record<MockThemeKind, string>> = {
	[MockThemeKind.Dark]: 'Dark',
	[MockThemeKind.Light]: 'Light2026',
};

/**
 * The interactive demo switches themes by loading the fixture's other theme
 * variant; the demo state rides along in session storage.
 */
function interactiveOptions(context: ComponentFixtureContext): IColorGroupsMockupOptions {
	const targetWindow = DOM.getWindow(context.container);
	let snapshot: IColorGroupsMockupSnapshot | undefined;
	try {
		const saved = targetWindow.sessionStorage.getItem(THEME_SNAPSHOT_KEY);
		targetWindow.sessionStorage.removeItem(THEME_SNAPSHOT_KEY);
		snapshot = saved ? JSON.parse(saved) : undefined;
	} catch {
		snapshot = undefined;
	}
	const current = isLightScheme(context.theme.type) ? MockThemeKind.Light : MockThemeKind.Dark;
	const fixtureId = new URL(targetWindow.location.href).searchParams.get('fixture');
	return {
		controls: true,
		interactive: true,
		selectedSessionId: 'seed-5',
		...snapshot,
		themeSwitch: fixtureId ? {
			current,
			switchTo: (theme, next) => {
				const url = new URL(targetWindow.location.href);
				url.searchParams.set('fixture', fixtureId.replace(/[^/]+$/, THEME_FIXTURE_VARIANTS[theme]));
				targetWindow.sessionStorage.setItem(THEME_SNAPSHOT_KEY, JSON.stringify(next));
				targetWindow.location.assign(url.toString());
			},
		} : undefined,
	};
}

//#endregion

//#region Today

/** Today's list, rendered by the production sessions list: separator groups stand in for categories. */
const TODAY_SESSIONS: readonly ISessionsListFixtureSession[] = [
	{ id: 'corpus', title: 'vscode-corpus', workspace: 'vscode-engineering', pinned: true, minutesAgo: 90 },
	{ id: 'release-builds', title: 'release branch builds', isQuickChat: true, minutesAgo: 14 },
	{ id: 'version-bump', title: 'version bump fail', isQuickChat: true, minutesAgo: 55 },
	{ id: 'team-label', title: 'VS Code team label', isQuickChat: true, minutesAgo: 240 },
	{ id: 'internal', title: 'Triage duplicate-detection false positives', workspace: 'vscode-internalbacklog', minutesAgo: 300 },
	{ id: 'ci-token', title: 'Run PR CI unit tests with a product quality token', workspace: 'vscode', minutesAgo: 22 },
	{ id: 'flaky', title: 'Skip flaky sessionsListHierarchy fixture spec', workspace: 'vscode', minutesAgo: 75 },
	{ id: 'cherry', title: 'Cherry-pick duplicate issue analysis', workspace: 'vscode-engineering', minutesAgo: 35 },
	{ id: 'pipeline', title: 'Investigate pipeline-health alert', workspace: 'vscode-engineering', minutesAgo: 41 },
	{ id: 'rate-limit', title: 'GitHub API rate limit investigation', workspace: 'vscode-engineering', minutesAgo: 66 },
	{ id: 'labels', title: 'vscode label descriptions', workspace: 'vscode-engineering', minutesAgo: 88 },
	{ id: 'semantic', title: 'Semantic-similar shape change + #3934/#3935', workspace: 'vscode-engineering', minutesAgo: 140, status: SessionStatus.InProgress, description: 'Running the evaluation' },
	{ id: 'slack', title: 'Review Slack architecture', workspace: 'vscode-engineering', minutesAgo: 150 },
	{ id: 'review-mcp', title: 'Review MCP tool descriptions', workspace: 'vscode-review-mcp', minutesAgo: 500 },
	{ id: 'tools', title: 'Weekly report generator', workspace: 'vscode-tools', minutesAgo: 400 },
	{ id: 'netmon', title: 'Add per-device bandwidth chart', workspace: 'netmon', minutesAgo: 12, isRead: false },
	{ id: 'ledger', title: 'Import CSV from credit union', workspace: 'pocket-ledger', minutesAgo: 70 },
	{ id: 'fancyzones', title: 'FancyZones layout for ultrawide', workspace: 'powertoys', minutesAgo: 600 },
	{ id: 'quasimorph', title: 'Balance tweak: armor degradation', workspace: 'quasimorph-mods', minutesAgo: 8, status: SessionStatus.NeedsInput },
	{ id: 'ml-win', title: 'Build on Windows ARM', workspace: 'quasimorph-mods [ml_win]', minutesAgo: 720 },
	{ id: 'done', title: 'Bump electron to 43.7.3', workspace: 'vscode', isArchived: true, minutesAgo: 900 },
];

const TODAY = defineSessionsListFixture({
	sessions: TODAY_SESSIONS,
	groups: [
		{ id: 'eng', name: '===================== ENG' },
		{ id: 'backlog', name: 'backlog', sessions: ['review-mcp'] },
		{ id: 'priv', name: '===================== PRIV' },
		{ id: 'powertoys', name: 'powertoys', sessions: ['fancyzones'] },
		{ id: 'misc', name: '===================== MISC' },
	],
	header: { navigationShortcuts: true, customizationsCount: 112 },
	view: {
		grouping: SessionsGrouping.Workspace,
		compact: true,
		width: 340,
		height: 900,
		expanded: [{ section: 'pinned' }, { section: 'quickchats' }],
		collapsed: [
			{ group: 'eng' }, { group: 'priv' }, { group: 'misc' }, { group: 'backlog' }, { group: 'powertoys' },
			{ workspace: 'vscode-internalbacklog' }, { workspace: 'vscode-tools' }, { workspace: 'netmon' }, { workspace: 'pocket-ledger' },
			{ workspace: 'quasimorph-mods' }, { workspace: 'quasimorph-mods [ml_win]' }, { section: 'archived' },
		],
	},
}, { themes: ['dark'], additionalThemes: ['light2026'] });

//#endregion

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	/** The full interactive demo, with mockup controls beside the window. */
	Interactive: mockup(interactiveOptions, undefined, { realTime: true }),

	Today_ProductionList: TODAY,

	Rail: mockup({ style: MockGroupStyle.Rail, selectedSessionId: 'seed-5' }),
	Outline: mockup({ style: MockGroupStyle.Outline, selectedSessionId: 'seed-5' }),
	Tint: mockup({ style: MockGroupStyle.Tint, selectedSessionId: 'seed-5' }),
	Dot: mockup({ style: MockGroupStyle.Dot, selectedSessionId: 'seed-5' }),
	Compact: mockup({ density: MockDensity.Compact, selectedSessionId: 'seed-5' }),

	PersonalCollection_Tabs: mockup({ collectionId: 'personal', switcher: MockSwitcherStyle.Tabs, selectedSessionId: 'seed-35' }),
	MiscCollection_Menu: mockup({ collectionId: 'misc', switcher: MockSwitcherStyle.Menu }),

	GroupEditor: mockup({ selectedSessionId: 'seed-5' }, ({ view }) => view.openGroupEditor('eng-ci')),
	NewSession: mockup({ collectionId: 'personal' }, ({ view }) => {
		view.chat.startNewSession({ groupId: 'after-hackathon', workspace: 'netmon' });
		view.chat.setInput('Add a latency heatmap to the device detail page');
	}),
	GroupEditor_CustomColor: mockup({ selectedSessionId: 'seed-5' }, ({ model, view }) => {
		model.update(undefined, draft => {
			const group = getGroup(draft, 'endgame');
			if (group) {
				group.color = { kind: 'custom', hex: '#1f6f5c' };
			}
		});
		view.openGroupEditor('endgame', { customColor: true });
	}),
	CollectionEditor: mockup({ collectionId: 'personal' }, ({ view }) => view.editCollection('personal')),
});
