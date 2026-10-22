/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { SessionWorktreeCleanupEditor } from '../../browser/sessionWorktreeCleanupEditor.js';
import { SessionWorktreeCleanupEditorInput } from '../../browser/sessionWorktreeCleanupEditorInput.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, ISessionWorktree, ISessionWorktreeCleanupService } from '../../browser/sessionWorktreeCleanupService.js';

suite('SessionWorktreeCleanupEditor', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor(cleanupService: Partial<ISessionWorktreeCleanupService> = {}) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configuration = new TestConfigurationService({
			[ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays]: 0,
			[ChatConfiguration.AutoDeleteMarkedAsDoneMergedSessionsAfterDays]: 0,
			[AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING]: true,
		});
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const updateValue = stub(configuration, 'updateValue').callsFake((key, value) => configuration.setUserConfiguration(key, value));
		disposables.add({ dispose: () => updateValue.restore() });
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(ISessionWorktreeCleanupService, upcastPartial<ISessionWorktreeCleanupService>(cleanupService));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({}));
		const editor = disposables.add(instantiationService.createInstance(SessionWorktreeCleanupEditor, new TestEditorGroupView(1)));
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		disposables.add(toDisposable(() => container.remove()));
		editor.create(container);
		return { editor, container, configuration, updateValue };
	}

	test('finishes opening before worktree sessions load and then updates the results', async () => {
		const worktrees = new DeferredPromise<readonly ISessionWorktree[]>();
		const { editor, container } = createEditor({ getWorktrees: () => worktrees.p });
		const input = disposables.add(new SessionWorktreeCleanupEditorInput());
		let opened = false;
		const opening = editor.setInput(input, undefined, {}, CancellationToken.None).then(() => { opened = true; });
		try {
			await timeout(0);
			assert.deepStrictEqual({
				opened,
				heading: container.querySelector('h2')?.textContent,
				loading: container.querySelector('.session-worktree-cleanup-summary')?.textContent,
				pickerDisabled: container.querySelector<HTMLSelectElement>('select')?.disabled,
			}, {
				opened: true,
				heading: 'Cleanup Settings',
				loading: 'Measuring worktree storage...',
				pickerDisabled: true,
			});
		} finally {
			await worktrees.complete([]);
			await opening;
		}

		assert.deepStrictEqual({
			emptyStateVisible: !container.querySelector('.session-worktree-cleanup-empty')?.classList.contains('hidden'),
			pickerDisabled: container.querySelector<HTMLSelectElement>('select')?.disabled,
		}, { emptyStateVisible: true, pickerDisabled: false });
	});

	test('shows a text-only settings heading and no configure actions', () => {
		const { container } = createEditor();

		assert.deepStrictEqual({
			heading: container.querySelector('h2')?.textContent,
			headingIcons: container.querySelectorAll('h2 .codicon').length,
			gears: container.querySelectorAll('.codicon-settings-gear').length,
			configureActions: container.querySelectorAll('.session-worktree-cleanup-configure').length,
			intro: container.querySelector('.session-worktree-cleanup-intro')?.textContent,
		}, {
			heading: 'Cleanup Settings',
			headingIcons: 0,
			gears: 0,
			configureActions: 0,
			intro: 'Review all agent session worktrees, or filter by workspace and inactivity period. Inactive, unpinned sessions can be cleaned up to reclaim disk space, including recently used sessions. Any uncommitted changes are committed before the worktree is removed. Cleaning up a session marks it as done; you can restore the session later to recreate its worktree. Protected sessions are shown but cannot be selected.',
		});
	});

	function createWorktree(id: string, workspacePath: string, cleanupState: ISessionWorktree['cleanupState'] = 'eligible', ageDays = 0): ISessionWorktree {
		return {
			session: upcastPartial<ISession>({
				sessionId: id,
				resource: URI.parse(`test:/${id}`),
				title: constObservable(id),
				updatedAt: constObservable(new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000)),
				workspace: constObservable({
					uri: URI.file(workspacePath),
					label: workspacePath.split('/').pop()!,
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: false,
					isVirtualWorkspace: false,
				}),
			}),
			sizeBytes: cleanupState === 'unavailable' ? undefined : 100,
			worktreeCount: 1,
			cleanupState,
		};
	}

	async function openEditor(worktrees: readonly ISessionWorktree[]) {
		const cleaned: string[][] = [];
		const ages: number[] = [];
		const { editor, container } = createEditor({
			getWorktrees: async age => { ages.push(age); return worktrees; },
			cleanupWorktrees: async candidates => { cleaned.push(candidates.map(candidate => candidate.session.sessionId)); return false; },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		return { editor, container, cleaned, ages };
	}

	test('shows recent and protected worktrees with workspace names and eligibility reasons', async () => {
		const { container, ages } = await openEditor([
			createWorktree('recent', '/repos/app'),
			createWorktree('active', '/repos/app', 'active'),
			createWorktree('running', '/repos/other', 'running'),
			createWorktree('unmeasured', '/repos/other', 'unavailable'),
		]);

		assert.deepStrictEqual({
			ages,
			rows: [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].map(row => ({
				title: row.querySelector('a')?.textContent,
				workspace: row.querySelector('.workspace')?.textContent,
				disabled: row.querySelector('[role="checkbox"]')?.getAttribute('aria-disabled'),
				reason: row.querySelector('.session-worktree-cleanup-reason')?.textContent ?? '',
				storage: row.lastElementChild?.textContent,
			})),
		}, {
			ages: [0],
			rows: [
				{ title: 'recent', workspace: 'app', disabled: null, reason: '', storage: '100B' },
				{ title: 'active', workspace: 'app', disabled: 'true', reason: 'Active session', storage: '100B' },
				{ title: 'running', workspace: 'other', disabled: 'true', reason: 'Running', storage: '100B' },
				{ title: 'unmeasured', workspace: 'other', disabled: 'true', reason: 'Storage unavailable', storage: 'Unknown' },
			],
		});
	});

	test('workspace filtering disambiguates names and restricts select all and cleanup to visible rows', async () => {
		const { container, cleaned } = await openEditor([
			createWorktree('first', '/repos/app'),
			createWorktree('second', '/other/app'),
			createWorktree('third', '/repos/app'),
			createWorktree('unique', '/repos/zeta'),
		]);
		const picker = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-workspace')!;
		const options = [...picker.options].map(option => option.textContent);
		picker.value = URI.file('/repos/app').toString();
		picker.dispatchEvent(new Event(dom.EventType.CHANGE));
		const rows = [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent);
		container.querySelector<HTMLElement>('.header [role="checkbox"]')!.click();
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);

		assert.deepStrictEqual({ options, rows, cleaned }, {
			options: ['All workspaces', 'app (file:///repos/app)', 'app (file:///other/app)', 'zeta'],
			rows: ['first', 'third'],
			cleaned: [['first', 'third']],
		});
	});

	test('shows the workspace picker only when multiple distinct workspaces are available', async () => {
		let worktrees: readonly ISessionWorktree[] = [];
		const { editor, container } = createEditor({ getWorktrees: async () => worktrees });
		const picker = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-workspace')!;
		const label = picker.parentElement!;
		const states = [];
		for (const nextWorktrees of [
			[],
			[createWorktree('first', '/repos/app'), createWorktree('second', '/repos/app')],
			[createWorktree('first', '/repos/app'), createWorktree('other', '/other/app')],
			[createWorktree('first', '/repos/app'), createWorktree('second', '/repos/app')],
			[],
		]) {
			worktrees = nextWorktrees;
			editor.showAllWorktrees();
			await timeout(0);
			states.push({
				visible: mainWindow.getComputedStyle(label).display !== 'none',
				ariaHidden: label.getAttribute('aria-hidden'),
				selected: picker.value,
				rows: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
			});
			if (worktrees.some(worktree => worktree.session.sessionId === 'other')) {
				picker.value = URI.file('/repos/app').toString();
				picker.dispatchEvent(new Event(dom.EventType.CHANGE));
			}
		}

		assert.deepStrictEqual(states, [
			{ visible: false, ariaHidden: 'true', selected: '', rows: [] },
			{ visible: false, ariaHidden: 'true', selected: '', rows: ['first', 'second'] },
			{ visible: true, ariaHidden: null, selected: '', rows: ['first', 'other'] },
			{ visible: false, ariaHidden: 'true', selected: '', rows: ['first', 'second'] },
			{ visible: false, ariaHidden: 'true', selected: '', rows: [] },
		]);
	});

	test('age filtering includes all ages by default and can return to recently used worktrees', async () => {
		const { container, ages } = await openEditor([
			createWorktree('recent', '/repos/app'),
			createWorktree('old', '/repos/app', 'eligible', 30),
		]);
		const picker = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-age')!;
		const rows = () => [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent);
		const states = [rows()];
		for (const days of [7, 60, 0]) {
			picker.value = String(days);
			picker.dispatchEvent(new Event(dom.EventType.CHANGE));
			await timeout(0);
			states.push(rows());
		}

		assert.deepStrictEqual({ ages, states }, {
			ages: [0, 7, 60, 0],
			states: [['recent', 'old'], ['old'], [], ['recent', 'old']],
		});
	});

	test('keeps the table visible when only protected worktrees match', async () => {
		const { container } = await openEditor([createWorktree('pinned', '/repos/app', 'pinned')]);
		assert.deepStrictEqual({
			tableHidden: container.querySelector('.session-worktree-cleanup-list')?.classList.contains('hidden'),
			emptyHidden: container.querySelector('.session-worktree-cleanup-empty')?.classList.contains('hidden'),
			selectAllDisabled: container.querySelector('.header [role="checkbox"]')?.getAttribute('aria-disabled'),
			cleanupDisabled: container.querySelector('.session-worktree-cleanup-action')?.getAttribute('aria-disabled'),
		}, { tableHidden: false, emptyHidden: true, selectAllDisabled: 'true', cleanupDisabled: 'true' });
	});

	test('disables every protected cleanup state and never includes it in cleanup', async () => {
		const states: ISessionWorktree['cleanupState'][] = ['active', 'running', 'needsInput', 'pinned', 'recent', 'archived', 'untitled', 'error', 'unavailable'];
		const { container, cleaned } = await openEditor([
			createWorktree('eligible', '/repos/app'),
			...states.map(state => createWorktree(state, '/repos/app', state)),
		]);
		const protectedRows = [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].slice(1);
		for (const row of protectedRows) {
			row.querySelector<HTMLElement>('[role="checkbox"]')!.click();
		}
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			disabled: protectedRows.map(row => row.querySelector('[role="checkbox"]')?.getAttribute('aria-disabled')),
			checked: protectedRows.map(row => row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')),
			cleaned,
		}, { disabled: states.map(() => 'true'), checked: states.map(() => 'false'), cleaned: [['eligible']] });
	});

	test('shows a clickable cursor over both filter pickers but not their labels', async () => {
		const { container } = await openEditor([
			createWorktree('first', '/repos/app'),
			createWorktree('second', '/repos/other'),
		]);
		const labels = [...container.querySelectorAll<HTMLElement>('.session-worktree-cleanup-controls label')];

		assert.deepStrictEqual(labels.map(label => ({
			labelCursor: mainWindow.getComputedStyle(label).cursor,
			pickerCursor: mainWindow.getComputedStyle(label.querySelector('select')!).cursor,
		})), [
			{ labelCursor: 'default', pickerCursor: 'pointer' },
			{ labelCursor: 'default', pickerCursor: 'pointer' },
		]);
	});

	test('allows cleaning up worktrees used less than seven days ago', async () => {
		const ages: number[] = [];
		const { editor, container } = createEditor({
			getWorktrees: async age => {
				ages.push(age);
				return [];
			},
		});
		const picker = container.querySelector<HTMLSelectElement>('select')!;
		const options = Array.from(picker.options, option => ({ value: option.value, label: option.textContent }));
		picker.value = '1';
		picker.dispatchEvent(new Event(dom.EventType.CHANGE));
		await timeout(0);
		editor.showAllWorktrees();
		await timeout(0);

		assert.deepStrictEqual({ options: options.slice(0, 4), ages, selected: picker.value }, {
			options: [
				{ value: '0', label: 'Any time' },
				{ value: '1', label: '1 day' },
				{ value: '3', label: '3 days' },
				{ value: '7', label: '7 days' },
			],
			ages: [1, 0],
			selected: '0',
		});
	});

	test('shows the Command Palette command in a bold second paragraph', () => {
		const { container } = createEditor();
		const paragraph = container.querySelector('.session-worktree-cleanup-content > p:nth-child(2)')!;

		assert.deepStrictEqual({
			text: paragraph.textContent,
			boldText: paragraph.querySelector('strong')?.textContent,
		}, {
			text: 'You can return to this editor at any time by running Open Worktree Cleanup from the Command Palette.',
			boldText: 'You can return to this editor at any time by running Open Worktree Cleanup from the Command Palette.',
		});
	});

	for (const [index, setting] of [
		ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays,
		ChatConfiguration.AutoDeleteMarkedAsDoneMergedSessionsAfterDays,
	].entries()) {
		test(`configures ${setting} inline`, async () => {
			const { container, configuration, updateValue } = createEditor();
			const row = container.querySelectorAll('.session-worktree-cleanup-setting')[index];
			const checkbox = row.querySelector<HTMLElement>('[role="checkbox"]')!;
			const days = row.querySelector<HTMLInputElement>('input[type="number"]')!;
			const getState = () => ({
				checked: checkbox.getAttribute('aria-checked'),
				disabled: days.disabled,
				days: days.value,
				value: configuration.getValue<number>(setting),
			});

			const states = [getState()];
			checkbox.click();
			await Promise.resolve();
			states.push(getState());
			days.value = '30';
			days.dispatchEvent(new Event(dom.EventType.INPUT));
			await Promise.resolve();
			states.push(getState());
			checkbox.click();
			await Promise.resolve();
			states.push(getState());

			assert.deepStrictEqual({ states, updates: updateValue.args }, {
				states: [
					{ checked: 'false', disabled: true, days: '15', value: 0 },
					{ checked: 'true', disabled: false, days: '15', value: 15 },
					{ checked: 'true', disabled: false, days: '30', value: 30 },
					{ checked: 'false', disabled: true, days: '15', value: 0 },
				],
				updates: [
					[setting, 15, ConfigurationTarget.APPLICATION],
					[setting, 30, ConfigurationTarget.APPLICATION],
					[setting, 0, ConfigurationTarget.APPLICATION],
				],
			});
		});
	}

	test('toggles the storage cleanup suggestion inline', async () => {
		const { container, configuration } = createEditor();
		const checkbox = container.querySelectorAll<HTMLElement>('.session-worktree-cleanup-setting [role="checkbox"]')[2];
		checkbox.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			checked: checkbox.getAttribute('aria-checked'),
			value: configuration.getValue<boolean>(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING),
		}, { checked: 'false', value: false });
	});
});
