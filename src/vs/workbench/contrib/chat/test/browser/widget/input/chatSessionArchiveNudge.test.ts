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
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId } from '../../../../../../../platform/chat/common/sessionArchiveActions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../../platform/notification/test/common/testNotificationService.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkbenchAssignmentService } from '../../../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../../../services/assignment/test/common/nullAssignmentService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';
import { CHAT_SESSION_ARCHIVE_NUDGE_ICON_TREATMENT, CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT, ChatSessionArchiveNudge, IChatSessionArchiveNudgeOptions } from '../../../../browser/widget/input/chatSessionArchiveNudge.js';
import '../../../../../../browser/media/style.css';

suite('ChatSessionArchiveNudge', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function options(overrides: Partial<IChatSessionArchiveNudgeOptions> = {}): IChatSessionArchiveNudgeOptions {
		return {
			hasWorktree: false,
			pullRequestCount: 1,
			onArchive: async () => { },
			onDismiss: () => { },
			onOpenCleanupSettings: async () => { },
			...overrides,
		};
	}

	function createServices(assignmentService: IWorkbenchAssignmentService = new NullWorkbenchAssignmentService(), wording = ChatSessionArchiveActionWording.Archive) {
		const errors: string[] = [];
		const warnings: string[] = [];
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		const configurationService = new TestConfigurationService({ [ChatSessionArchiveActionWordingSettingId]: wording });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
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
		return { instantiationService, configurationService, errors, warnings };
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

	function createWidget(overrides?: Partial<IChatSessionArchiveNudgeOptions>, assignmentService?: IWorkbenchAssignmentService, wording = ChatSessionArchiveActionWording.Archive) {
		const { instantiationService, configurationService, errors, warnings } = createServices(assignmentService, wording);
		const container = createContainer();
		const widget = store.add(instantiationService.createInstance(ChatSessionArchiveNudge, options(overrides)));
		container.appendChild(widget.domNode);
		const [archive, cleanupSettings] = widget.domNode.querySelectorAll<HTMLElement>('.monaco-button');
		const dismiss = widget.domNode.querySelector<HTMLElement>('.action-label')!;
		return { widget, archive, cleanupSettings, dismiss, configurationService, errors, warnings, container };
	}

	async function setWording(configurationService: TestConfigurationService, wording: ChatSessionArchiveActionWording): Promise<void> {
		await configurationService.setUserConfiguration(ChatSessionArchiveActionWordingSettingId, wording);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: section => section === ChatSessionArchiveActionWordingSettingId,
			affectedKeys: new Set([ChatSessionArchiveActionWordingSettingId]),
			source: ConfigurationTarget.USER,
			change: { keys: [ChatSessionArchiveActionWordingSettingId], overrides: [] },
		});
	}

	function pressKey(target: HTMLElement, key: string, keyCode: number, shiftKey = false): KeyboardEvent {
		const keydown = new KeyboardEvent('keydown', { key, keyCode, shiftKey, bubbles: true, cancelable: true });
		target.dispatchEvent(keydown);
		target.dispatchEvent(new KeyboardEvent('keyup', { key, keyCode, shiftKey, bubbles: true, cancelable: true }));
		return keydown;
	}

	for (const wording of [ChatSessionArchiveActionWording.Archive, ChatSessionArchiveActionWording.MarkAsDone]) {
		test(`uses the primary button treatment for ${wording}`, () => {
			const { archive, cleanupSettings } = createWidget(undefined, undefined, wording);
			assert.deepStrictEqual({
				archiveSecondary: archive.classList.contains('secondary'),
				archiveBackground: archive.style.backgroundColor,
				cleanupSecondary: cleanupSettings.classList.contains('secondary'),
				cleanupBackground: cleanupSettings.style.backgroundColor,
			}, {
				archiveSecondary: false,
				archiveBackground: defaultButtonStyles.buttonBackground,
				cleanupSecondary: true,
				cleanupBackground: defaultButtonStyles.buttonSecondaryBackground,
			});
		});
	}

	test('explains reversible archiving without suggesting folder cleanup', () => {
		const { widget, archive, cleanupSettings, dismiss } = createWidget();
		const description = widget.domNode.querySelector<HTMLElement>('.chat-session-archive-nudge-description')!;
		const details = widget.domNode.querySelector<HTMLDetailsElement>('details')!;
		const worktree = widget.domNode.querySelector<HTMLElement>('.chat-session-archive-nudge-worktree')!;
		const icon = widget.domNode.querySelector<HTMLElement>('.chat-session-archive-nudge-icon')!;

		assert.deepStrictEqual({
			heading: widget.domNode.querySelector('h3')?.textContent,
			mergeIcon: icon.classList.contains('codicon-git-merge'),
			decorativeIcon: icon.getAttribute('aria-hidden'),
			iconBeforeTitle: icon.nextElementSibling === widget.domNode.querySelector('h3'),
			overview: description.textContent,
			overviewOutsideDetails: !details.contains(description),
			detailsExpanded: details.open,
			detailsLabel: details.querySelector('summary')?.textContent,
			recovery: details.querySelector('p')?.textContent,
			worktreeHidden: worktree.hidden,
			button: archive.textContent,
			buttonDescription: archive.getAttribute('aria-describedby'),
			cleanupSettingsButton: cleanupSettings.textContent,
			dismissLabel: dismiss.getAttribute('aria-label'),
			groupLabel: widget.domNode.getAttribute('aria-labelledby'),
		}, {
			heading: 'PR merged. Archive this session?',
			mergeIcon: true,
			decorativeIcon: 'true',
			iconBeforeTitle: true,
			overview: 'Archive this session to hide it from the sessions list and focus on your remaining tasks.',
			overviewOutsideDetails: true,
			detailsExpanded: false,
			detailsLabel: 'What Does "Archive" Do?',
			recovery: 'The session is not deleted. Ask your agent to find it, or look in the "Archived" section of the sessions list. You can unarchive it anytime.',
			worktreeHidden: true,
			button: 'Archive',
			buttonDescription: description.id,
			cleanupSettingsButton: 'Configure Automatic Cleanup',
			dismissLabel: 'Dismiss Archive Suggestion',
			groupLabel: widget.domNode.querySelector('h3')?.id,
		});
	});

	test('opens automatic cleanup settings and reports failures', async () => {
		let opens = 0;
		const success = createWidget({ onOpenCleanupSettings: async () => { opens++; } });
		success.cleanupSettings.click();
		await Promise.resolve();
		const failure = createWidget({ onOpenCleanupSettings: async () => { throw new Error('Settings unavailable'); } });
		failure.cleanupSettings.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			opens,
			errors: failure.errors,
		}, {
			opens: 1,
			errors: ['Unable to open automatic cleanup settings: Settings unavailable'],
		});
	});

	for (const hasWorktree of [false, true]) {
		test(`expands and collapses the explanation without hiding the overview (worktree: ${hasWorktree})`, () => {
			const { widget } = createWidget({ hasWorktree });
			const details = widget.domNode.querySelector<HTMLDetailsElement>('details')!;
			const summary = details.querySelector('summary')!;
			const overview = widget.domNode.querySelector<HTMLElement>('.chat-session-archive-nudge-description')!;
			const recovery = details.querySelector('p')!;
			const worktree = details.querySelector<HTMLElement>('.chat-session-archive-nudge-worktree')!;
			const snapshot = () => ({
				expanded: details.open,
				overview: overview.checkVisibility(),
				recovery: recovery.checkVisibility(),
				worktree: worktree.checkVisibility(),
			});
			const collapsed = snapshot();
			summary.click();
			const expanded = snapshot();
			summary.focus();
			widget.setOptions(options({ hasWorktree, pullRequestCount: 2 }));
			const updated = { ...snapshot(), focused: document.activeElement === summary };
			summary.click();

			assert.deepStrictEqual({ collapsed, expanded, updated, collapsedAgain: snapshot() }, {
				collapsed: { expanded: false, overview: true, recovery: false, worktree: false },
				expanded: { expanded: true, overview: true, recovery: true, worktree: hasWorktree },
				updated: { expanded: true, overview: true, recovery: true, worktree: hasWorktree, focused: true },
				collapsedAgain: { expanded: false, overview: true, recovery: false, worktree: false },
			});
		});
	}

	test('keeps the merged icon purple in the workbench without recoloring other icons', async () => {
		const refetch = store.add(new Emitter<void>());
		let iconTreatment: string | undefined;
		const { widget, container, dismiss } = createWidget(undefined, createAssignmentService(name =>
			name === CHAT_SESSION_ARCHIVE_NUDGE_ICON_TREATMENT ? iconTreatment : undefined, refetch.event));
		container.classList.add('monaco-workbench');
		widget.domNode.style.setProperty('--vscode-charts-purple', '#a371f7');
		widget.domNode.style.setProperty('--vscode-icon-foreground', '#cccccc');
		await timeout(0);
		const workbenchIconRule = [...document.styleSheets, ...document.adoptedStyleSheets]
			.flatMap(sheet => Array.from(sheet.cssRules))
			.flatMap(rule => rule instanceof CSSImportRule && rule.styleSheet ? Array.from(rule.styleSheet.cssRules) : [rule])
			.find(rule => rule instanceof CSSStyleRule && rule.selectorText === '.monaco-workbench .codicon');
		assert.ok(workbenchIconRule);
		// Load the real workbench icon rule last to exercise the product's stylesheet order.
		dom.append(container, dom.$('style')).textContent = workbenchIconRule.cssText;
		await timeout(0);
		const icon = widget.domNode.querySelector<HTMLElement>('.chat-session-archive-nudge-icon')!;
		const colors = () => ({
			icon: dom.getWindow(icon).getComputedStyle(icon).color,
			dismiss: dom.getWindow(dismiss).getComputedStyle(dismiss).color,
		});
		const merged = colors();
		iconTreatment = 'archive';
		refetch.fire();
		await timeout(0);
		const alternate = colors();
		iconTreatment = undefined;
		refetch.fire();
		await timeout(0);

		assert.deepStrictEqual({ merged, alternate, restored: colors() }, {
			merged: { icon: 'rgb(163, 113, 247)', dismiss: 'rgb(204, 204, 204)' },
			alternate: { icon: 'rgb(204, 204, 204)', dismiss: 'rgb(204, 204, 204)' },
			restored: { icon: 'rgb(163, 113, 247)', dismiss: 'rgb(204, 204, 204)' },
		});
	});

	for (const width of [360, 720]) {
		test(`aligns the overview and button with the title and indents the explanation at width ${width}`, () => {
			const { widget, archive, container } = createWidget({ hasWorktree: true });
			container.style.width = `${width}px`;
			widget.domNode.style.setProperty('--vscode-codiconFontSize', '16px');
			widget.domNode.style.setProperty('--vscode-spacing-size80', '8px');
			widget.domNode.style.setProperty('--vscode-spacing-size160', '16px');
			const left = (selector: string) => widget.domNode.querySelector<HTMLElement>(selector)!.getBoundingClientRect().left;
			const titleLeft = left('h3');
			widget.domNode.querySelector('summary')!.click();

			assert.deepStrictEqual({
				iconOffset: titleLeft - left('.chat-session-archive-nudge-icon'),
				body: left('.chat-session-archive-nudge-description'),
				disclosure: left('summary'),
				recovery: left('details > p'),
				worktree: left('.chat-session-archive-nudge-worktree'),
				button: archive.getBoundingClientRect().left,
				overflows: widget.domNode.scrollWidth > widget.domNode.clientWidth,
			}, {
				iconOffset: 24,
				body: titleLeft,
				disclosure: titleLeft,
				recovery: titleLeft + 16,
				worktree: titleLeft + 16,
				button: titleLeft,
				overflows: false,
			});
		});
	}

	test('underlines the disclosure in neutral text rather than link blue', () => {
		const { widget } = createWidget();
		widget.domNode.style.setProperty('--vscode-descriptionForeground', '#cccccc');
		widget.domNode.style.setProperty('--vscode-textLink-foreground', '#3794ff');
		const summary = widget.domNode.querySelector('summary')!;
		const style = dom.getWindow(summary).getComputedStyle(summary);
		const labelStyle = dom.getWindow(summary).getComputedStyle(summary.firstElementChild!);

		assert.deepStrictEqual({ color: style.color, cursor: style.cursor, decoration: labelStyle.textDecorationLine }, {
			color: 'rgb(204, 204, 204)', cursor: 'pointer', decoration: 'underline',
		});
	});

	test('uses Mark as Done and Restore throughout the nudge', () => {
		const { widget, archive, dismiss } = createWidget({ hasWorktree: true }, undefined, ChatSessionArchiveActionWording.MarkAsDone);
		const title = widget.domNode.querySelector('h3')?.textContent;
		widget.setOptions(options({ hasWorktree: true, pullRequestCount: 2 }));

		assert.deepStrictEqual({
			title,
			multipleTitle: widget.domNode.querySelector('h3')?.textContent,
			description: widget.domNode.querySelector('.chat-session-archive-nudge-description')?.textContent,
			disclosure: widget.domNode.querySelector('summary')?.textContent,
			recovery: widget.domNode.querySelector('details > p')?.textContent,
			worktree: widget.domNode.querySelector('.chat-session-archive-nudge-worktree')?.textContent,
			button: archive.textContent,
			dismiss: dismiss.getAttribute('aria-label'),
			archiveWording: /archive/i.test(widget.domNode.textContent ?? ''),
		}, {
			title: 'PR merged. Mark this session as done?',
			multipleTitle: 'All PRs merged. Mark this session as done?',
			description: 'Mark this session as done to hide it from the sessions list and focus on your remaining tasks.',
			disclosure: 'What Does "Mark as Done" Do?',
			recovery: 'The session is not deleted. Ask your agent to find it, or look in the "Done" section of the sessions list. You can restore it anytime.',
			worktree: 'The worktree created for this session will be deleted. You can recreate it by restoring the session.',
			button: 'Mark as Done',
			dismiss: 'Dismiss Mark as Done Suggestion',
			archiveWording: false,
		});
	});

	test('updates wording live without losing expansion or focus, including while busy', async () => {
		const pending = new DeferredPromise<void>();
		const { widget, archive, configurationService } = createWidget({ onArchive: () => pending.p });
		const summary = widget.domNode.querySelector('summary')!;
		summary.click();
		summary.focus();
		await setWording(configurationService, ChatSessionArchiveActionWording.MarkAsDone);
		const updated = {
			expanded: widget.domNode.querySelector('details')!.open,
			focused: document.activeElement === summary,
			button: archive.textContent,
			disclosure: summary.textContent,
		};
		archive.click();
		const busyDone = archive.textContent;
		await setWording(configurationService, ChatSessionArchiveActionWording.Archive);
		const busyArchive = archive.textContent;
		await pending.complete();

		assert.deepStrictEqual({
			updated, busyDone, busyArchive,
			idle: archive.textContent,
			title: widget.domNode.querySelector('h3')?.textContent,
			disclosure: summary.textContent,
		}, {
			updated: { expanded: true, focused: true, button: 'Mark as Done', disclosure: 'What Does "Mark as Done" Do?' },
			busyDone: 'Marking as Done...',
			busyArchive: 'Archiving...',
			idle: 'Archive',
			title: 'PR merged. Archive this session?',
			disclosure: 'What Does "Archive" Do?',
		});
	});

	test('uses Mark as Done wording for errors and retry', async () => {
		const pending = new DeferredPromise<void>();
		const { archive, errors } = createWidget({ onArchive: () => pending.p }, undefined, ChatSessionArchiveActionWording.MarkAsDone);
		archive.click();
		await pending.error(new Error('Worktree cleanup failed'));

		assert.deepStrictEqual({ errors, button: archive.textContent, disabled: archive.getAttribute('aria-disabled') }, {
			errors: ['Unable to mark the session as done: Worktree cleanup failed'],
			button: 'Mark as Done',
			disabled: 'false',
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
			buttonDescription: archive.getAttribute('aria-describedby') === widget.domNode.querySelector('.chat-session-archive-nudge-description')?.id,
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
			buttonDescription: true,
			cleanup: 'The worktree created for this session will be deleted. You can recreate it by unarchiving the session.',
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
		const { widget, archive, cleanupSettings, dismiss } = createWidget();
		const summary = widget.domNode.querySelector('summary')!;
		dismiss.focus();
		const tab = pressKey(dismiss, 'Tab', 9);
		summary.focus();
		const summaryTab = pressKey(summary, 'Tab', 9);
		archive.focus();
		const shiftTab = pressKey(archive, 'Tab', 9, true);

		assert.deepStrictEqual({
			dismissTabIndex: dismiss.tabIndex,
			archiveTabIndex: archive.tabIndex,
			cleanupSettingsTabIndex: cleanupSettings.tabIndex,
			summaryTabIndex: summary.tabIndex,
			dismissBeforeSummary: !!(dismiss.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING),
			summaryBeforeArchive: !!(summary.compareDocumentPosition(archive) & Node.DOCUMENT_POSITION_FOLLOWING),
			archiveBeforeCleanupSettings: !!(archive.compareDocumentPosition(cleanupSettings) & Node.DOCUMENT_POSITION_FOLLOWING),
			tabPrevented: tab.defaultPrevented,
			summaryTabPrevented: summaryTab.defaultPrevented,
			shiftTabPrevented: shiftTab.defaultPrevented,
		}, {
			dismissTabIndex: 0,
			archiveTabIndex: 0,
			cleanupSettingsTabIndex: 0,
			summaryTabIndex: 0,
			dismissBeforeSummary: true,
			summaryBeforeArchive: true,
			archiveBeforeCleanupSettings: true,
			tabPrevented: false,
			summaryTabPrevented: false,
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
		const { widget, archive, cleanupSettings, dismiss } = createWidget(callbacks);
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
			cleanupSettingsDisabled: cleanupSettings.getAttribute('aria-disabled'),
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
			busy: { ariaBusy: 'true', archiveDisabled: 'true', cleanupSettingsDisabled: 'true', dismissDisabled: 'true', label: 'Archiving...' },
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
