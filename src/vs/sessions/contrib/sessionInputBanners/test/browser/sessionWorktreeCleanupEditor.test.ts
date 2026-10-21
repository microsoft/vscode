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
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
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
			intro: 'Inactive, unpinned sessions older than the selected period can be cleaned up to reclaim the disk space their worktrees use. Any uncommitted changes are committed before the worktree is removed. Cleaning up a session marks it as done; you can restore the session later to recreate its worktree. Active, running, needs-input, and pinned sessions are never cleaned up.',
		});
	});

	test('shows a clickable cursor only over the inactivity picker', () => {
		const { container } = createEditor();
		const label = container.querySelector<HTMLElement>('.session-worktree-cleanup-controls label')!;
		const picker = label.querySelector('select')!;

		assert.deepStrictEqual({
			labelCursor: mainWindow.getComputedStyle(label).cursor,
			pickerCursor: mainWindow.getComputedStyle(picker).cursor,
		}, { labelCursor: 'default', pickerCursor: 'pointer' });
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
