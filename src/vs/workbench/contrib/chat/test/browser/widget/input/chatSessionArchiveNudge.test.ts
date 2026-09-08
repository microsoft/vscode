/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../../platform/notification/test/common/testNotificationService.js';
import { IWorkbenchAssignmentService } from '../../../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../../../services/assignment/test/common/nullAssignmentService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';
import { CHAT_SESSION_ARCHIVE_NUDGE_ICON_TREATMENT, CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT, ChatSessionArchiveNudge, IChatSessionArchiveNudgeOptions } from '../../../../browser/widget/input/chatSessionArchiveNudge.js';

suite('ChatSessionArchiveNudge', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function options(overrides: Partial<IChatSessionArchiveNudgeOptions> = {}): IChatSessionArchiveNudgeOptions {
		return {
			hasWorktree: false,
			pullRequestCount: 1,
			onArchive: async () => { },
			onDismiss: () => { },
			...overrides,
		};
	}

	function createServices(assignmentService: IWorkbenchAssignmentService = new NullWorkbenchAssignmentService()) {
		const errors: string[] = [];
		const warnings: string[] = [];
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IWorkbenchAssignmentService, assignmentService);
		instantiationService.stub(ILogService, new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		}());
		instantiationService.stub(INotificationService, new class extends TestNotificationService {
			override error(error: string | Error) {
				errors.push(error instanceof Error ? error.message : error);
				return super.error(error);
			}
		}());
		return { instantiationService, errors, warnings };
	}

	function createAssignmentService(read: (name: string) => string | boolean | undefined | Promise<string | boolean | undefined>, onDidRefetchAssignments: Event<void> = Event.None): IWorkbenchAssignmentService {
		return new class extends NullWorkbenchAssignmentService {
			override readonly onDidRefetchAssignments = onDidRefetchAssignments;
			override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
				return await read(name) as T | undefined;
			}
		}();
	}

	function createContainer(): HTMLElement {
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		return container;
	}

	function createWidget(overrides?: Partial<IChatSessionArchiveNudgeOptions>, assignmentService?: IWorkbenchAssignmentService) {
		const { instantiationService, errors, warnings } = createServices(assignmentService);
		const container = createContainer();
		const widget = store.add(instantiationService.createInstance(ChatSessionArchiveNudge, options(overrides)));
		container.appendChild(widget.domNode);
		const archive = widget.domNode.querySelector<HTMLElement>('.monaco-button')!;
		const dismiss = widget.domNode.querySelector<HTMLElement>('.action-label')!;
		return { widget, archive, dismiss, errors, warnings, container };
	}

	function pressKey(target: HTMLElement, key: string, keyCode: number, shiftKey = false): KeyboardEvent {
		const keydown = new KeyboardEvent('keydown', { key, keyCode, shiftKey, bubbles: true, cancelable: true });
		target.dispatchEvent(keydown);
		target.dispatchEvent(new KeyboardEvent('keyup', { key, keyCode, shiftKey, bubbles: true, cancelable: true }));
		return keydown;
	}

	test('explains reversible archiving without suggesting folder cleanup', () => {
		const { widget, archive, dismiss } = createWidget();
		const description = widget.domNode.querySelector<HTMLElement>('.chat-session-archive-nudge-description')!;
		const worktree = widget.domNode.querySelector<HTMLElement>('.chat-session-archive-nudge-worktree')!;
		const icon = widget.domNode.querySelector<HTMLElement>('.chat-session-archive-nudge-icon')!;

		assert.deepStrictEqual({
			heading: widget.domNode.querySelector('h3')?.textContent,
			mergeIcon: icon.classList.contains('codicon-git-merge'),
			decorativeIcon: icon.getAttribute('aria-hidden'),
			iconBeforeTitle: icon.nextElementSibling === widget.domNode.querySelector('h3'),
			overview: description.textContent?.includes('session list focused'),
			conversation: description.textContent?.includes('conversation stays available to you and your agents'),
			recovery: description.textContent?.includes('session list filter and unarchive anytime'),
			worktreeHidden: worktree.hidden,
			button: archive.textContent,
			buttonDescription: archive.getAttribute('aria-describedby'),
			dismissLabel: dismiss.getAttribute('aria-label'),
			groupLabel: widget.domNode.getAttribute('aria-labelledby'),
		}, {
			heading: 'PR merged. Archive this session?',
			mergeIcon: true,
			decorativeIcon: 'true',
			iconBeforeTitle: true,
			overview: true,
			conversation: true,
			recovery: true,
			worktreeHidden: true,
			button: 'Archive',
			buttonDescription: description.id,
			dismissLabel: 'Dismiss Archive Suggestion',
			groupLabel: widget.domNode.querySelector('h3')?.id,
		});
	});

	test('updates content and callbacks without replacing focused controls', async () => {
		let oldActions = 0;
		let archives = 0;
		let dismissals = 0;
		const { widget, archive, dismiss } = createWidget({
			onArchive: async () => { oldActions++; },
			onDismiss: () => { oldActions++; },
		});
		archive.focus();
		widget.setOptions(options({
			hasWorktree: true,
			pullRequestCount: 2,
			onArchive: async () => { archives++; },
			onDismiss: () => { dismissals++; },
		}));
		const worktree = widget.domNode.querySelector<HTMLElement>('.chat-session-archive-nudge-worktree')!;
		const updated = {
			sameArchive: widget.domNode.querySelector('.monaco-button') === archive,
			sameDismiss: widget.domNode.querySelector('.action-label') === dismiss,
			focused: document.activeElement === archive,
			heading: widget.domNode.querySelector('h3')?.textContent,
			worktreeHidden: worktree.hidden,
			worktreeDescription: archive.getAttribute('aria-describedby')?.includes(worktree.id),
			cleanup: worktree.textContent,
		};
		archive.click();
		await Promise.resolve();
		dismiss.click();

		assert.deepStrictEqual({ ...updated, oldActions, archives, dismissals }, {
			sameArchive: true,
			sameDismiss: true,
			focused: true,
			heading: 'All PRs merged. Archive this session?',
			worktreeHidden: false,
			worktreeDescription: true,
			cleanup: 'The worktree is cleaned up when you archive and recreated when you unarchive.',
			oldActions: 0,
			archives: 1,
			dismissals: 1,
		});
	});

	test('loads title and icon treatments as plain text without replacing focused controls', async () => {
		const queried: string[] = [];
		const title = '<b>All done?</b> Tidy up this session.';
		const assignmentService = createAssignmentService(name => {
			queried.push(name);
			return name === CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT ? title : 'archive';
		});
		const { widget, archive, dismiss } = createWidget(undefined, assignmentService);
		archive.focus();
		await timeout(0);
		widget.setOptions(options({ pullRequestCount: 2, hasWorktree: true }));
		const heading = widget.domNode.querySelector('h3')!;

		assert.deepStrictEqual({
			queried,
			title: heading.textContent,
			markup: heading.children.length,
			icon: widget.domNode.querySelector('.chat-session-archive-nudge-icon')?.classList.contains('codicon-archive'),
			sameArchive: widget.domNode.querySelector('.monaco-button') === archive,
			sameDismiss: widget.domNode.querySelector('.action-label') === dismiss,
			focused: document.activeElement === archive,
			groupLabel: widget.domNode.getAttribute('aria-labelledby'),
		}, {
			queried: [CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT, CHAT_SESSION_ARCHIVE_NUDGE_ICON_TREATMENT],
			title,
			markup: 0,
			icon: true,
			sameArchive: true,
			sameDismiss: true,
			focused: true,
			groupLabel: heading.id,
		});
	});

	test('supports independent title and icon treatments and resets to defaults when removed', async () => {
		const refetch = store.add(new Emitter<void>());
		let title: string | undefined = 'Ready for the next task?';
		let icon: string | undefined;
		const { widget } = createWidget(undefined, createAssignmentService(name =>
			name === CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT ? title : icon, refetch.event));
		const snapshot = () => ({
			title: widget.domNode.querySelector('h3')?.textContent,
			icon: widget.domNode.querySelector('.chat-session-archive-nudge-icon')?.className,
		});
		await timeout(0);
		const titleOnly = snapshot();
		title = undefined;
		icon = 'archive';
		refetch.fire();
		await timeout(0);
		const iconOnly = snapshot();
		icon = undefined;
		refetch.fire();
		await timeout(0);

		assert.deepStrictEqual({ titleOnly, iconOnly, default: snapshot() }, {
			titleOnly: { title: 'Ready for the next task?', icon: 'chat-session-archive-nudge-icon codicon codicon-git-merge' },
			iconOnly: { title: 'PR merged. Archive this session?', icon: 'chat-session-archive-nudge-icon codicon codicon-archive' },
			default: { title: 'PR merged. Archive this session?', icon: 'chat-session-archive-nudge-icon codicon codicon-git-merge' },
		});
	});

	test('falls back to localized defaults and logs invalid treatments', async () => {
		const widgets = [
			createWidget(undefined, createAssignmentService(name => name === CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT ? '  ' : 'not-a-registered-icon')),
			createWidget(undefined, createAssignmentService(() => true)),
			createWidget(undefined, createAssignmentService(name => name === CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT ? '' : 'constructor')),
		];
		await timeout(0);

		assert.deepStrictEqual(widgets.map(({ widget, warnings }) => ({
			title: widget.domNode.querySelector('h3')?.textContent,
			mergeIcon: widget.domNode.querySelector('.chat-session-archive-nudge-icon')?.classList.contains('codicon-git-merge'),
			warnings,
		})), Array.from({ length: 3 }, () => ({
			title: 'PR merged. Archive this session?',
			mergeIcon: true,
			warnings: ['[ChatSessionArchiveNudge] Ignoring invalid title treatment', '[ChatSessionArchiveNudge] Ignoring invalid icon treatment'],
		})));
	});

	test('ignores stale treatment requests and results after disposal', async () => {
		const refetch = store.add(new Emitter<void>());
		const pendingTitle = new DeferredPromise<string | undefined>();
		let title: string | Promise<string | undefined> = pendingTitle.p;
		const { widget } = createWidget(undefined, createAssignmentService(name =>
			name === CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT ? title : undefined, refetch.event));
		title = 'Latest title';
		refetch.fire();
		await timeout(0);
		await pendingTitle.complete('Stale title');
		await timeout(0);
		const latestTitle = widget.domNode.querySelector('h3')?.textContent;
		const disposedTitle = new DeferredPromise<string | undefined>();
		title = disposedTitle.p;
		refetch.fire();
		widget.dispose();
		await disposedTitle.complete('Disposed title');
		await timeout(0);

		assert.deepStrictEqual({ latestTitle, afterDispose: widget.domNode.querySelector('h3')?.textContent }, {
			latestTitle: 'Latest title',
			afterDispose: 'Latest title',
		});
	});

	test('logs failed treatment lookups without clearing the current presentation', async () => {
		const refetch = store.add(new Emitter<void>());
		let fail = false;
		const { widget, warnings } = createWidget(undefined, createAssignmentService(name => {
			if (fail) {
				throw new Error('Assignment lookup failed');
			}
			return name === CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT ? 'Ready to archive?' : 'archive';
		}, refetch.event));
		await timeout(0);
		fail = true;
		refetch.fire();
		await timeout(0);

		assert.deepStrictEqual({
			title: widget.domNode.querySelector('h3')?.textContent,
			icon: widget.domNode.querySelector('.chat-session-archive-nudge-icon')?.classList.contains('codicon-archive'),
			warnings,
		}, {
			title: 'Ready to archive?',
			icon: true,
			warnings: ['[ChatSessionArchiveNudge] Failed to resolve title and icon treatments'],
		});
	});

	test('does not take focus when it appears', () => {
		const input = dom.append(createContainer(), dom.$('input'));
		input.focus();
		createWidget();

		assert.strictEqual(document.activeElement, input);
	});

	test('leaves Tab and Shift+Tab to the normal input flow', () => {
		const { archive, dismiss } = createWidget();
		dismiss.focus();
		const tab = pressKey(dismiss, 'Tab', 9);
		archive.focus();
		const shiftTab = pressKey(archive, 'Tab', 9, true);

		assert.deepStrictEqual({
			dismissTabIndex: dismiss.tabIndex,
			archiveTabIndex: archive.tabIndex,
			dismissComesFirst: !!(dismiss.compareDocumentPosition(archive) & Node.DOCUMENT_POSITION_FOLLOWING),
			tabPrevented: tab.defaultPrevented,
			shiftTabPrevented: shiftTab.defaultPrevented,
		}, {
			dismissTabIndex: 0,
			archiveTabIndex: 0,
			dismissComesFirst: true,
			tabPrevented: false,
			shiftTabPrevented: false,
		});
	});

	for (const { key, keyCode } of [{ key: 'Enter', keyCode: 13 }, { key: ' ', keyCode: 32 }]) {
		test(`activates Archive and Dismiss with ${key === ' ' ? 'Space' : key}`, async () => {
			let archives = 0;
			let dismissals = 0;
			const { archive, dismiss } = createWidget({
				onArchive: async () => { archives++; },
				onDismiss: () => { dismissals++; },
			});
			archive.focus();
			pressKey(archive, key, keyCode);
			await Promise.resolve();
			dismiss.focus();
			// Tab's keyup also updates ActionBar focus when the test window is inactive.
			pressKey(dismiss, 'Tab', 9);
			pressKey(dismiss, key, keyCode);

			assert.deepStrictEqual({ archives, dismissals }, { archives: 1, dismissals: 1 });
		});
	}

	test('dismisses on unmodified Escape, including from the Archive button', () => {
		let dismissals = 0;
		const { archive } = createWidget({ onDismiss: () => { dismissals++; } });
		const modified = pressKey(archive, 'Escape', 27, true);
		const escape = pressKey(archive, 'Escape', 27);

		assert.deepStrictEqual({ dismissals, modified: modified.defaultPrevented, escape: escape.defaultPrevented }, {
			dismissals: 1,
			modified: false,
			escape: true,
		});
	});

	test('keeps one archive operation in flight even across updates', async () => {
		const pending = new DeferredPromise<void>();
		let archives = 0;
		let dismissals = 0;
		const callbacks = {
			onArchive: () => { archives++; return pending.p; },
			onDismiss: () => { dismissals++; },
		};
		const { widget, archive, dismiss } = createWidget(callbacks);
		archive.click();
		widget.setOptions(options({ ...callbacks, hasWorktree: true, pullRequestCount: 2 }));
		archive.click();
		pressKey(archive, 'Enter', 13);
		pressKey(archive, ' ', 32);
		dismiss.click();
		pressKey(archive, 'Escape', 27);
		const busy = {
			ariaBusy: widget.domNode.getAttribute('aria-busy'),
			archiveDisabled: archive.getAttribute('aria-disabled'),
			dismissDisabled: dismiss.getAttribute('aria-disabled'),
			label: archive.textContent,
		};
		await pending.complete();

		assert.deepStrictEqual({
			archives, dismissals, busy,
			idle: widget.domNode.getAttribute('aria-busy'),
			label: archive.textContent,
		}, {
			archives: 1,
			dismissals: 0,
			busy: { ariaBusy: 'true', archiveDisabled: 'true', dismissDisabled: 'true', label: 'Archiving...' },
			idle: 'false',
			label: 'Archive',
		});
	});

	test('reports archive errors and leaves the same card available to retry', async () => {
		const pending = new DeferredPromise<void>();
		let archives = 0;
		let dismissals = 0;
		const { widget, archive, errors } = createWidget({
			onArchive: () => ++archives === 1 ? pending.p : Promise.resolve(),
			onDismiss: () => { dismissals++; },
		});
		archive.click();
		await pending.error(new Error('Worktree cleanup failed'));
		archive.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			archives, dismissals, errors,
			connected: widget.domNode.isConnected,
			sameButton: widget.domNode.querySelector('.monaco-button') === archive,
			enabled: archive.getAttribute('aria-disabled'),
			busy: widget.domNode.getAttribute('aria-busy'),
			label: archive.textContent,
		}, {
			archives: 2,
			dismissals: 0,
			errors: ['Unable to archive the session: Worktree cleanup failed'],
			connected: true,
			sameButton: true,
			enabled: 'false',
			busy: 'false',
			label: 'Archive',
		});
	});

	test('cleans up controls even when disposed during archiving', async () => {
		const pending = new DeferredPromise<void>();
		let archives = 0;
		let dismissals = 0;
		const { widget, archive, dismiss } = createWidget({
			onArchive: () => { archives++; return pending.p; },
			onDismiss: () => { dismissals++; },
		});
		archive.click();
		widget.dispose();
		await pending.complete();
		archive.click();
		dismiss.click();
		pressKey(archive, 'Escape', 27);

		assert.deepStrictEqual({ archives, dismissals, connected: widget.domNode.isConnected }, {
			archives: 1,
			dismissals: 0,
			connected: false,
		});
	});

	function createInputPart() {
		const { instantiationService } = createServices();
		const container = createContainer();
		const slot = dom.append(container, dom.$('.chat-session-archive-nudge-container'));
		const input = dom.append(container, dom.$('input'));
		const inputPart = Object.create(ChatInputPart.prototype) as ChatInputPart;
		Object.defineProperties(inputPart, {
			instantiationService: { value: instantiationService },
			sessionArchiveNudgeContainer: { value: slot },
			sessionArchiveNudgeWidget: { value: store.add(new MutableDisposable<ChatSessionArchiveNudge>()) },
			focus: { value: () => input.focus() },
		});
		return { inputPart, slot, input };
	}

	test('input setter reuses, removes and disposes its nudge', () => {
		const { inputPart, slot } = createInputPart();
		const initial = inputPart.hasSessionArchiveNudge;
		inputPart.setSessionArchiveNudge(options());
		const widget = slot.firstElementChild;
		const shown = inputPart.hasSessionArchiveNudge;
		inputPart.setSessionArchiveNudge(options({ pullRequestCount: 2 }));
		const updated = { sameWidget: slot.firstElementChild === widget, children: slot.childElementCount };
		inputPart.setSessionArchiveNudge(undefined);

		assert.deepStrictEqual({ initial, shown, updated, cleared: inputPart.hasSessionArchiveNudge, children: slot.childElementCount }, {
			initial: false,
			shown: true,
			updated: { sameWidget: true, children: 1 },
			cleared: false,
			children: 0,
		});
	});

	test('dismissing returns focus to the originating input', () => {
		const first = createInputPart();
		const second = createInputPart();
		let dismissals = 0;
		first.inputPart.setSessionArchiveNudge(options({ onDismiss: () => { dismissals++; } }));
		second.input.focus();
		first.slot.querySelector<HTMLElement>('.action-label')!.click();

		assert.deepStrictEqual({
			dismissals,
			shown: first.inputPart.hasSessionArchiveNudge,
			originFocused: document.activeElement === first.input,
		}, { dismissals: 1, shown: false, originFocused: true });
	});

	test('clearing restores focus only when it was inside the nudge', () => {
		const first = createInputPart();
		const second = createInputPart();
		first.inputPart.setSessionArchiveNudge(options());
		first.slot.querySelector<HTMLElement>('.monaco-button')!.focus();
		first.inputPart.setSessionArchiveNudge(undefined);
		const restored = document.activeElement === first.input;
		first.inputPart.setSessionArchiveNudge(options());
		second.input.focus();
		first.inputPart.setSessionArchiveNudge(undefined);

		assert.deepStrictEqual({ restored, otherInputKeptFocus: document.activeElement === second.input }, {
			restored: true,
			otherInputKeptFocus: true,
		});
	});
});
