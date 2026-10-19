/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SESSIONS_LIST_COLLECTIONS_SETTING, SESSIONS_LIST_GROUP_COLORS_SETTING } from '../../../../common/sessionConfig.js';
import { ISessionGroup } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { SessionPaletteColor, SessionTextColorMode } from '../../../../services/sessions/common/sessionColors.js';
import { SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { createListHarness, createTestSession, IListHarnessOptions } from './sessionsListTestUtils.js';

suite('SessionsList colors and collections', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const group: ISessionGroup = { id: 'g1', name: 'Release', createdAt: 1 };

	function renderList(sessions: ISession[], options: IListHarnessOptions & { readonly colors?: boolean; readonly collectionsEnabled?: boolean } = {}) {
		const harness = createListHarness(disposables, sessions, options);
		const configurationService = harness.instantiationService.get(IConfigurationService) as TestConfigurationService;
		configurationService.setUserConfiguration(SESSIONS_LIST_GROUP_COLORS_SETTING, options.colors ?? true);
		configurationService.setUserConfiguration(SESSIONS_LIST_COLLECTIONS_SETTING, options.collectionsEnabled ?? false);
		const container = harness.createContainer(400, 700);
		const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
			grouping: () => SessionsGrouping.Workspace,
			sorting: () => SessionsSorting.Created,
			onSessionOpen: () => { },
		}));
		list.layout(700, 400);
		return { list, container };
	}

	/** Every rendered header and session row, with how it is colored. */
	function describeRows(container: HTMLElement) {
		return [...container.querySelectorAll<HTMLElement>('.monaco-list-row')].map(row => {
			const header = row.querySelector<HTMLElement>('.session-section');
			if (header) {
				return {
					header: header.querySelector('.session-section-label')?.textContent,
					colored: header.classList.contains('session-header-colored'),
					fill: header.style.getPropertyValue('--session-group-fill') || undefined,
					count: header.querySelector('.session-header-pill-count')?.textContent || undefined,
					aria: row.getAttribute('aria-label'),
				};
			}
			const item = row.querySelector<HTMLElement>('.session-item');
			return {
				session: item?.querySelector('.session-title')?.textContent,
				rail: item?.classList.contains('session-in-colored-group') ? [item.classList.contains('session-rail-first') ? 'first' : '', item.classList.contains('session-rail-last') ? 'last' : ''].join('|') : undefined,
			};
		});
	}

	test('colors groups, workspaces and Pinned as pills with a rail beside their sessions', () => {
		const a = createTestSession('A', { workspaceLabel: 'vscode' }).session;
		const b = createTestSession('B', { workspaceLabel: 'vscode' }).session;
		const c = createTestSession('C', { workspaceLabel: 'netmon' }).session;
		const d = createTestSession('D', { workspaceLabel: 'docs' }).session;
		const pinned = createTestSession('P', { workspaceLabel: 'docs' }).session;
		const { container } = renderList([a, b, c, d, pinned], {
			groups: [group],
			memberships: new Map([[a.sessionId, group.id], [b.sessionId, group.id]]),
			pinnedSessionIds: new Set([pinned.sessionId]),
			sectionColors: new Map([
				[`group:${group.id}`, { color: SessionPaletteColor.Blue, textColor: SessionTextColorMode.Auto }],
				['workspace:netmon', { color: '#1f5f99', textColor: SessionTextColorMode.Light }],
				['pinned', { color: SessionPaletteColor.Red, textColor: SessionTextColorMode.Auto }],
			]),
		});

		assert.deepStrictEqual(describeRows(container), [
			{ header: 'Pinned', colored: true, fill: 'var(--vscode-agentsSessionGroup-red)', count: '1', aria: 'Pinned, section, Red, 1 session' },
			{ header: 'Release', colored: true, fill: 'var(--vscode-agentsSessionGroup-blue)', count: undefined, aria: 'Release, group, Blue, 2 sessions' },
			{ session: 'A', rail: 'first|' },
			{ session: 'B', rail: '|last' },
			{ header: 'docs', colored: false, fill: undefined, count: undefined, aria: 'docs, 1' },
			{ session: 'D', rail: undefined },
			{ header: 'netmon', colored: true, fill: '#1f5f99', count: undefined, aria: 'netmon, workspace, #1F5F99, 1 session' },
			{ session: 'C', rail: 'first|last' },
		]);
	});

	test('a collapsed colored group shows its count and most urgent status', () => {
		const inProgress = createTestSession('Working', { workspaceLabel: 'vscode', status: SessionStatus.InProgress }).session;
		const needsInput = createTestSession('Asking', { workspaceLabel: 'vscode', status: SessionStatus.NeedsInput }).session;
		const unread = createTestSession('Unread', { workspaceLabel: 'vscode', isRead: false }).session;
		const { list, container } = renderList([inProgress, needsInput, unread], {
			groups: [group],
			memberships: new Map([[inProgress.sessionId, group.id], [needsInput.sessionId, group.id], [unread.sessionId, group.id]]),
			sectionColors: new Map([[`group:${group.id}`, { color: SessionPaletteColor.Green, textColor: SessionTextColorMode.Auto }]]),
		});
		list.collapseAllSections();

		const header = container.querySelector<HTMLElement>('.session-header-colored')!;
		assert.deepStrictEqual({
			count: header.querySelector('.session-header-pill-count')?.textContent,
			status: (header.querySelector('.session-header-pill-status.visible')?.childElementCount ?? 0) > 0,
			aria: header.closest('.monaco-list-row')?.getAttribute('aria-label'),
		}, {
			count: '3',
			status: true,
			aria: 'Release, group, Green, 3 sessions, needs input',
		});
	});

	test('stored colors have no effect while colored groups are disabled', () => {
		const a = createTestSession('A', { workspaceLabel: 'vscode' }).session;
		const { container } = renderList([a], {
			colors: false,
			groups: [group],
			memberships: new Map([[a.sessionId, group.id]]),
			sectionColors: new Map([[`group:${group.id}`, { color: SessionPaletteColor.Blue, textColor: SessionTextColorMode.Auto }]]),
		});

		assert.deepStrictEqual(describeRows(container), [
			{ header: 'Release', colored: false, fill: undefined, count: undefined, aria: 'Release, 1' },
			{ session: 'A', rail: undefined },
		]);
	});

	test('shows only the sessions and groups of the active collection', () => {
		const work = createTestSession('Work', { workspaceLabel: 'vscode' }).session;
		const home = createTestSession('Home', { workspaceLabel: 'garden' }).session;
		const grouped = createTestSession('Grouped', { workspaceLabel: 'vscode' }).session;
		const otherGroup: ISessionGroup = { id: 'g2', name: 'Personal group', createdAt: 2 };
		const options: IListHarnessOptions = {
			groups: [group, otherGroup],
			memberships: new Map([[grouped.sessionId, otherGroup.id]]),
			collections: {
				collections: [
					{ id: 'default', name: 'General', icon: 'layers', color: SessionPaletteColor.Blue },
					{ id: 'personal', name: 'Personal', icon: 'home', color: SessionPaletteColor.Green },
				],
				activeCollectionId: 'personal',
				sessionCollections: new Map([[home.sessionId, 'personal']]),
				groupCollections: new Map([[otherGroup.id, 'personal']]),
			},
		};
		const labels = (container: HTMLElement) => [...container.querySelectorAll('.session-section-label, .session-title')].map(e => e.textContent);

		const enabled = renderList([work, home, grouped], { ...options, colors: false, collectionsEnabled: true });
		const disabled = renderList([work, home, grouped], { ...options, colors: false, collectionsEnabled: false });

		assert.deepStrictEqual({ enabled: labels(enabled.container), disabled: labels(disabled.container) }, {
			enabled: ['Personal group', 'Grouped', 'garden', 'Home'],
			disabled: ['Personal group', 'Grouped', 'Release', 'garden', 'Home', 'vscode', 'Work'],
		});
	});
});
