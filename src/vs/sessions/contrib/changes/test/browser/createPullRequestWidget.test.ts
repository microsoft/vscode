/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { CreatePullRequestPreferences, ICreatePullRequestPreferences } from '../../common/createPullRequestPreferences.js';
import { ISessionPullRequestAgentMergeOptions, ISessionPullRequestCreation, ISessionPullRequestDetails, ISessionPullRequestOptions } from '../../common/pullRequestCreation.js';
import { CreatePullRequestContextView } from '../../browser/createPullRequestContextView.js';
import { CreatePullRequestWidget, ICreatePullRequestWidgetOptions } from '../../browser/createPullRequestWidget.js';
import { SessionsChangesAccessibilityHelp } from '../../browser/sessionsChangesAccessibilityHelp.js';

suite('CreatePullRequestWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const agentMergeOptions: ISessionPullRequestAgentMergeOptions = {
		addressReviews: false,
		fixCI: true,
		resolveConflicts: false,
		mergePullRequest: 'ifUnchanged',
	};
	const details: ISessionPullRequestDetails = {
		title: 'Improve keyboard navigation',
		description: 'Preserve focus when switching between sessions.',
		branchName: 'fix/keyboard-navigation',
		baseBranchName: 'main',
		repository: 'microsoft/vscode',
		autoMergeAllowed: true,
		mergeMethods: ['SQUASH', 'MERGE', 'REBASE'],
		agentMergeAvailable: true,
		agentMergeOptions,
	};

	function createWidget(creation?: Partial<ISessionPullRequestCreation>, onCancel = () => { }, options: Partial<ICreatePullRequestWidgetOptions> = {}) {
		const submissions: ISessionPullRequestOptions[] = [];
		const hovers: Parameters<IHoverService['setupDelayedHoverAtMouse']>[] = [];
		const { contextMenuService, storage, logService } = createContextView();
		const preferences = new CreatePullRequestPreferences(storage, logService);
		if (options.preferences) {
			preferences.update(options.preferences);
		}
		let created = 0;
		const widget = store.add(new CreatePullRequestWidget({
			creation: {
				operationId: 'create-pr',
				prepareChatRequest: async query => ({ query }),
				prepare: async () => details,
				create: async options => { submissions.push(options); },
				...creation,
			},
			onCancel,
			onCreated: () => created++,
			onDetachedError: error => { throw error; },
			preferences: preferences.read(),
			onDidChangePreferences: change => preferences.update(change),
			...options,
		}, {
			...NullHoverService,
			setupDelayedHoverAtMouse: (...args) => {
				hovers.push(args);
				return toDisposable(() => hovers.splice(hovers.indexOf(args), 1));
			},
		}, contextMenuService));
		dom.append(document.body, widget.domNode);
		store.add(toDisposable(() => widget.domNode.remove()));
		widget.layout();
		return { widget, submissions, hovers, preferences, created: () => created };
	}

	function element<T extends HTMLElement>(widget: CreatePullRequestWidget, selector: string): T {
		const result = widget.domNode.querySelector<T>(selector);
		assert.ok(result, `Expected ${selector}`);
		return result;
	}

	function input(widget: CreatePullRequestWidget, selector: 'input' | 'textarea', value: string): void {
		const field = element<HTMLInputElement>(widget, selector);
		field.value = value;
		field.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function select(widget: CreatePullRequestWidget, text: string): void {
		const option = [...widget.domNode.querySelectorAll<HTMLElement>('[role="radio"]')].find(node => node.textContent === text);
		assert.ok(option, `Expected option ${text}`);
		option.click();
	}

	function submit(widget: CreatePullRequestWidget): void {
		element(widget, '.create-pr-buttons > .monaco-button:last-child').click();
	}

	function loadingState(widget: CreatePullRequestWidget) {
		return {
			spinners: [...widget.domNode.querySelectorAll<HTMLElement>('.create-pr-field-label > .codicon')].map(spinner => ({
				hidden: spinner.hidden,
				decorative: spinner.getAttribute('aria-hidden'),
			})),
			busy: [...widget.domNode.querySelectorAll('input, textarea')].map(input => input.getAttribute('aria-busy')),
			statusHidden: element(widget, '.create-pr-generation').hidden,
			status: element(widget, '[role="status"]').textContent,
		};
	}

	function createContextView(storage = store.add(new InMemoryStorageService())) {
		const host = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => host.remove()));
		const anchor = dom.append(host, dom.$('button', undefined, 'Create PR'));
		const onDidLayoutContainer = store.add(new Emitter<{ container: HTMLElement; dimension: dom.Dimension }>());
		const layout = new class extends mock<ILayoutService>() {
			override readonly mainContainer = host;
			override readonly activeContainer = host;
			override readonly onDidLayoutContainer = onDidLayoutContainer.event;
			override getContainer(): HTMLElement { return host; }
		}();
		const contextService = store.add(new ContextViewService(layout));
		const contextKeys = store.add(new ContextKeyService(new TestConfigurationService()));
		const errors: (string | Error)[] = [];
		const notificationService = new class extends mock<INotificationService>() {
			override error(error: string | Error): void { errors.push(error); }
		}();
		const contextMenuService = store.add(new ContextMenuService(
			NullTelemetryService, notificationService, contextService, new MockKeybindingService(),
			new class extends mock<IMenuService>() { }(), contextKeys,
		));
		const logService = store.add(new NullLogService());
		const contextView = store.add(new CreatePullRequestContextView(contextService, contextKeys, notificationService,
			layout, NullHoverService, contextMenuService, storage, logService));
		return { host, anchor, contextService, contextMenuService, contextView, errors, storage, logService, relayout: () => onDidLayoutContainer.fire({ container: host, dimension: dom.getClientArea(host) }) };
	}

	function openActionMenu(widget: CreatePullRequestWidget): void {
		const dropdown = element(widget, '.monaco-dropdown-button');
		dropdown.focus();
		dropdown.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, bubbles: true }));
	}

	for (const primaryAction of ['create', 'sendToChat'] as const) {
		test(`${primaryAction} forwards prepared identity without persisting it`, async () => {
			const context = { workingDirectory: 'file:///repo', repository: details.repository, branchName: details.branchName, baseBranchName: details.baseBranchName };
			const sent: ISessionPullRequestOptions[] = [];
			const { widget, submissions, preferences } = createWidget({ prepare: async () => ({ ...details, context }) }, undefined, {
				preferences: { primaryAction },
				sendToChat: async options => { sent.push(options); },
			});
			await widget.ready;
			element(widget, '.create-pr-submit').click();
			await timeout(0);
			assert.deepStrictEqual({
				created: submissions.map(options => options.expectedContext),
				sent: sent.map(options => options.expectedContext),
				storedContext: Object.hasOwn(preferences.read(), 'expectedContext') || Object.hasOwn(preferences.read(), 'context'),
			}, { created: primaryAction === 'create' ? [context] : [], sent: primaryAction === 'sendToChat' ? [context] : [], storedContext: false });
		});
	}

	function chooseMenuAction(label: string): void {
		const actions = [...document.querySelectorAll<HTMLElement>('.monaco-menu .action-label')];
		const index = actions.findIndex(node => node.textContent === label);
		assert.ok(index >= 0, `Expected menu action ${label}`);
		actions[0].dispatchEvent(new KeyboardEvent('keydown', { keyCode: 36, bubbles: true }));
		for (let i = 0; i < index; i++) {
			dom.getActiveElement()!.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 40, bubbles: true }));
		}
		const action = dom.getActiveElement()!;
		action.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, bubbles: true }));
		action.dispatchEvent(new KeyboardEvent('keyup', { keyCode: 13, bubbles: true }));
	}

	test('the dropdown sends form options to chat without creating a PR or unlocking achievements', async () => {
		const sent: ISessionPullRequestOptions[] = [];
		let completed = 0;
		const { widget, submissions, preferences, created } = createWidget(undefined, undefined, {
			sendToChat: async options => { sent.push(options); },
			onDidSendToChat: () => completed++,
		});
		await widget.ready;
		input(widget, 'input', 'Send this title');
		input(widget, 'textarea', 'Send this description');
		select(widget, 'Agent Merge');
		select(widget, 'When Ready');
		openActionMenu(widget);
		chooseMenuAction('Send Create PR Message');
		await timeout(0);
		assert.deepStrictEqual({
			sent, submissions, completed, created: created(),
			label: element(widget, '.create-pr-submit').textContent,
			primaryAction: preferences.read().primaryAction,
		}, {
			sent: [{
				title: 'Send this title', description: 'Send this description', draft: false, agentMerge: true,
				agentMergeOptions: { ...agentMergeOptions, mergePullRequest: 'always' }
			}],
			submissions: [], completed: 1, created: 0,
			label: 'Send Create PR Message', primaryAction: 'sendToChat',
		});
	});

	test('the remembered chat action runs on keyboard submission and direct creation can become primary again', async () => {
		let sent = 0;
		const { widget, submissions, preferences } = createWidget(undefined, undefined, {
			preferences: { primaryAction: 'sendToChat' },
			sendToChat: async () => { sent++; },
		});
		await widget.ready;
		const initialLabel = element(widget, '.create-pr-submit').textContent;
		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, ctrlKey: !isMacintosh, metaKey: isMacintosh, bubbles: true }));
		await timeout(0);
		openActionMenu(widget);
		chooseMenuAction('Create PR');
		await timeout(0);
		assert.deepStrictEqual({
			initialLabel, sent, submissions: submissions.length,
			label: element(widget, '.create-pr-submit').textContent,
			primaryAction: preferences.read().primaryAction,
		}, {
			initialLabel: 'Send Create PR Message', sent: 1, submissions: 1,
			label: 'Create PR', primaryAction: 'create',
		});
	});

	test('Tab reaches both split-button actions and Escape dismisses the menu without cancelling the form', async () => {
		let cancelled = 0;
		const { widget } = createWidget(undefined, () => cancelled++, { sendToChat: async () => { } });
		await widget.ready;
		const primary = element(widget, '.create-pr-submit');
		const dropdown = element(widget, '.monaco-dropdown-button');
		primary.focus();
		primary.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9, bubbles: true }));
		const tabReachedDropdown = dom.getActiveElement() === dropdown;
		openActionMenu(widget);
		const expanded = dropdown.getAttribute('aria-expanded');
		dom.getActiveElement()?.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, bubbles: true }));
		await timeout(0);
		const focusRestored = dom.getActiveElement() === dropdown;
		const collapsed = dropdown.getAttribute('aria-expanded');
		dropdown.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9, bubbles: true }));
		assert.deepStrictEqual({
			tabReachedDropdown, expanded, collapsed, focusRestored, cancelled,
			wrapped: dom.getActiveElement() === element(widget, 'input'),
		}, { tabReachedDropdown: true, expanded: 'true', collapsed: 'false', focusRestored: true, cancelled: 0, wrapped: true });
	});

	test('chat submission prevents duplicate sends and restores input focus on failure', async () => {
		const completion = new DeferredPromise<void>();
		let sent = 0;
		const { widget, created } = createWidget(undefined, undefined, {
			preferences: { primaryAction: 'sendToChat' },
			sendToChat: async () => { sent++; await completion.p; },
		});
		await widget.ready;
		const title = element<HTMLInputElement>(widget, 'input');
		title.focus();
		title.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, ctrlKey: !isMacintosh, metaKey: isMacintosh, bubbles: true }));
		element(widget, '.create-pr-submit').click();
		const disabled = element(widget, '.monaco-dropdown-button').getAttribute('aria-disabled');
		await completion.error(new Error('Session is busy'));
		await timeout(0);
		assert.deepStrictEqual({
			sent, disabled, created: created(), focused: dom.getActiveElement() === title,
			error: element(widget, '[role="alert"]').textContent, label: element(widget, '.create-pr-submit').textContent,
		}, {
			sent: 1, disabled: 'true', created: 0, focused: true,
			error: 'Could not send the create pull request message: Session is busy', label: 'Send Create PR Message',
		});
	});

	test('opening and cancelling uses session defaults without saving preferences or changing the session', async () => {
		const { widget, preferences, submissions } = createWidget();
		await widget.ready;
		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, bubbles: true }));
		assert.deepStrictEqual({ preferences: preferences.read(), submissions, options: details.agentMergeOptions }, {
			preferences: {}, submissions: [], options: agentMergeOptions,
		});
	});

	test('choosing Agent Merge remembers the displayed defaults even when cancelled', async () => {
		const { widget, preferences, submissions } = createWidget();
		await widget.ready;
		select(widget, 'Agent Merge');
		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, bubbles: true }));
		assert.deepStrictEqual({ preferences: preferences.read(), submissions }, {
			preferences: { mergeMode: 'agent', agentMergeOptions }, submissions: [],
		});
	});

	test('editing preferences is remembered on cancel without remembering PR content', async () => {
		const { host, anchor, contextView, storage } = createContextView();
		const creation: ISessionPullRequestCreation = { operationId: 'create-pr', prepare: async () => details, prepareChatRequest: async query => ({ query }), create: async () => assert.fail('Must not create') };
		contextView.show(anchor, creation);
		await timeout(0);
		const title = host.querySelector<HTMLInputElement>('input')!;
		title.value = 'Do not remember me';
		title.dispatchEvent(new Event('input', { bubbles: true }));
		const selectOption = (label: string) => [...host.querySelectorAll<HTMLElement>('[role="radio"]')].find(node => node.textContent === label)!.click();
		selectOption('Auto-Merge');
		selectOption('Rebase');
		selectOption('Agent Merge');
		selectOption('When Ready');
		host.querySelector<HTMLElement>('[role="checkbox"][aria-label="Address Reviews"]')!.click();
		host.querySelector<HTMLElement>('.create-pr-draft [role="checkbox"]')!.click();
		contextView.close();
		const recreated = createContextView(storage);
		recreated.contextView.show(recreated.anchor, {
			...creation, prepare: async () => ({
				...details, title: 'A different session', repository: 'another/repository', branchName: 'another-branch',
			})
		});
		await timeout(0);
		assert.deepStrictEqual({
			preferences: new CreatePullRequestPreferences(storage, store.add(new NullLogService())).read(),
			title: recreated.host.querySelector<HTMLInputElement>('input')!.value,
			repository: recreated.host.querySelector('.create-pr-repository')!.textContent,
			draft: recreated.host.querySelector('.create-pr-draft [role="checkbox"]')!.getAttribute('aria-checked'),
			mode: recreated.host.querySelector('[role="radio"][aria-label="Agent Merge"]')!.getAttribute('aria-checked'),
			policy: recreated.host.querySelector('.create-pr-agent-merge [role="radio"][aria-checked="true"]')!.textContent,
		}, {
			preferences: {
				draft: true, mergeMode: 'agent', mergeMethod: 'REBASE',
				agentMergeOptions: { ...agentMergeOptions, addressReviews: true, mergePullRequest: 'always' }
			},
			title: 'A different session', repository: 'another/repository', draft: 'true', mode: 'true', policy: 'When Ready',
		});
	});

	test('remembered Agent Merge options take precedence over session defaults and survive loading', async () => {
		const generation = new DeferredPromise<ISessionPullRequestDetails>();
		const remembered: ICreatePullRequestPreferences = {
			draft: true, mergeMode: 'agent', primaryAction: 'sendToChat',
			agentMergeOptions: { addressReviews: true, fixCI: false, resolveConflicts: true, mergePullRequest: 'always' },
		};
		const { widget, preferences } = createWidget({ prepare: () => generation.p }, undefined, { preferences: remembered, sendToChat: async () => { } });
		const loadingPreferences = preferences.read();
		await generation.complete(details);
		await widget.ready;
		assert.deepStrictEqual({
			loadingPreferences, preferences: preferences.read(), state: agentMergeState(widget),
			draft: element(widget, '.create-pr-draft [role="checkbox"]').getAttribute('aria-checked'),
			label: element(widget, '.create-pr-submit').textContent,
		}, {
			loadingPreferences: remembered, preferences: remembered, draft: 'true', label: 'Send Create PR Message',
			state: {
				hidden: false, actions: [
					{ label: 'Address Reviews', checked: 'true', disabled: 'false' },
					{ label: 'Fix CI Failures', checked: 'false', disabled: 'false' },
					{ label: 'Resolve Conflicts and Behind Branches', checked: 'true', disabled: 'false' },
				], policy: 'When Ready'
			},
		});
	});

	for (const restriction of ['auto-merge', 'merge-method', 'agent', 'agent-options', 'chat'] as const) {
		test(`a ${restriction} capability restriction never overwrites remembered preferences`, async () => {
			const remembered: ICreatePullRequestPreferences = {
				draft: false, mergeMode: restriction.startsWith('agent') ? 'agent' : 'auto',
				mergeMethod: 'REBASE', primaryAction: 'sendToChat', agentMergeOptions,
			};
			const restrictedDetails: ISessionPullRequestDetails = {
				...details,
				...(restriction === 'auto-merge' ? { autoMergeAllowed: false } : {}),
				...(restriction === 'merge-method' ? { mergeMethods: ['MERGE'] } as const : {}),
				...(restriction === 'agent' ? { agentMergeAvailable: false } : {}),
				...(restriction === 'agent-options' ? { agentMergeOptions: undefined } : {}),
			};
			const { widget, preferences, submissions } = createWidget({ prepare: async () => restrictedDetails }, undefined, { preferences: remembered });
			await widget.ready;
			const beforeSubmit = preferences.read();
			submit(widget);
			await timeout(0);
			assert.deepStrictEqual({
				beforeSubmit, rememberedMode: preferences.read().mergeMode, rememberedMethod: preferences.read().mergeMethod,
				rememberedAction: preferences.read().primaryAction, rememberedAgentOptions: preferences.read().agentMergeOptions,
				submittedAgent: submissions[0].agentMerge, submittedOptions: submissions[0].agentMergeOptions,
				submittedAuto: submissions[0].autoMergeMethod, dropdown: !!widget.domNode.querySelector('.monaco-dropdown-button'),
			}, {
				beforeSubmit: remembered, rememberedMode: remembered.mergeMode, rememberedMethod: 'REBASE',
				rememberedAction: 'sendToChat', rememberedAgentOptions: agentMergeOptions,
				submittedAgent: restriction === 'agent-options', submittedOptions: undefined,
				submittedAuto: restriction === 'merge-method' ? 'MERGE' : restriction === 'chat' ? 'REBASE' : undefined,
				dropdown: false,
			});
		});
	}

	test('draft temporarily disables remembered auto-merge without forgetting it', async () => {
		const { widget, preferences } = createWidget(undefined, undefined, { preferences: { draft: true, mergeMode: 'auto', mergeMethod: 'REBASE' } });
		await widget.ready;
		const before = element(widget, '[role="radio"][aria-label="Auto-Merge"]').getAttribute('aria-checked');
		element(widget, '.create-pr-draft [role="checkbox"]').click();
		assert.deepStrictEqual({
			before, after: element(widget, '[role="radio"][aria-label="Auto-Merge"]').getAttribute('aria-checked'),
			method: element(widget, '.create-pr-field [role="radio"][aria-checked="true"]').textContent,
			preferences: preferences.read(),
		}, { before: 'false', after: 'true', method: 'Auto-Merge', preferences: { draft: false, mergeMode: 'auto', mergeMethod: 'REBASE' } });
	});

	test('sending from the context-view menu closes only on successful send and does not call onCreated', async () => {
		const { host, anchor, contextView } = createContextView();
		const completion = new DeferredPromise<void>();
		let created = 0;
		let sent = 0;
		contextView.show(anchor, {
			operationId: 'create-pr', prepare: async () => details, prepareChatRequest: async query => ({ query }), create: async () => assert.fail('Must not create directly'),
		}, { sendToChat: async () => { sent++; await completion.p; } }, () => created++);
		await timeout(0);
		host.querySelector<HTMLElement>('.monaco-dropdown-button')!.click();
		const retainedDuringMenu = !!host.querySelector('[role="dialog"]');
		chooseMenuAction('Send Create PR Message');
		await timeout(0);
		const retainedDuringSend = !!host.querySelector('[role="dialog"]');
		await completion.complete();
		await timeout(0);
		assert.deepStrictEqual({
			retainedDuringMenu, retainedDuringSend, closed: !host.querySelector('[role="dialog"]'), created, sent,
		}, { retainedDuringMenu: true, retainedDuringSend: true, closed: true, created: 0, sent: 1 });
	});

	for (const outcome of ['success', 'failure'] as const) {
		test(`chat ${outcome} cannot close or steal focus from a newer form`, async () => {
			const { host, anchor, contextView, storage, errors } = createContextView();
			new CreatePullRequestPreferences(storage, store.add(new NullLogService())).update({ primaryAction: 'sendToChat' });
			const completion = new DeferredPromise<void>();
			const creation: ISessionPullRequestCreation = {
				operationId: 'create-pr', prepare: async () => details, prepareChatRequest: async query => ({ query }), create: async () => assert.fail('Must not create directly'),
			};
			contextView.show(anchor, creation, { sendToChat: () => completion.p });
			await timeout(0);
			host.querySelector<HTMLElement>('.create-pr-submit')!.click();
			contextView.show(anchor, creation);
			await timeout(0);
			const newTitle = host.querySelector<HTMLInputElement>('input')!;
			newTitle.focus();
			if (outcome === 'failure') {
				await completion.error(new Error('Message failed'));
			} else {
				await completion.complete();
			}
			await timeout(0);
			assert.deepStrictEqual({
				retained: newTitle.isConnected, focused: dom.getActiveElement() === newTitle,
				errors: errors.map(error => typeof error === 'string' ? error : error.message),
			}, { retained: true, focused: true, errors: outcome === 'failure' ? ['Message failed'] : [] });
		});
	}

	test('opens with editable fields before generation finishes', async () => {
		const generation = new DeferredPromise<ISessionPullRequestDetails>();
		const { widget, submissions } = createWidget({ prepare: () => generation.p });
		const before = {
			title: element<HTMLInputElement>(widget, 'input').value,
			description: element<HTMLTextAreaElement>(widget, 'textarea').value,
			editable: !element<HTMLInputElement>(widget, 'input').disabled,
			canCreate: element(widget, '.create-pr-buttons > .monaco-button:last-child').getAttribute('aria-disabled'),
			loading: loadingState(widget),
		};
		await generation.complete(details);
		await widget.ready;
		assert.deepStrictEqual({
			before,
			title: element<HTMLInputElement>(widget, 'input').value,
			description: element<HTMLTextAreaElement>(widget, 'textarea').value,
			canCreate: element(widget, '.create-pr-buttons > .monaco-button:last-child').getAttribute('aria-disabled'),
			loading: loadingState(widget),
			submissions,
		}, {
			before: {
				title: '',
				description: '',
				editable: true,
				canCreate: 'true',
				loading: {
					spinners: [{ hidden: false, decorative: 'true' }, { hidden: false, decorative: 'true' }],
					busy: ['true', 'true'],
					statusHidden: true,
					status: '',
				},
			},
			title: details.title,
			description: details.description,
			canCreate: 'false',
			loading: {
				spinners: [{ hidden: true, decorative: 'true' }, { hidden: true, decorative: 'true' }],
				busy: ['false', 'false'],
				statusHidden: true,
				status: '',
			},
			submissions: [],
		});
	});

	for (const field of ['input', 'textarea'] as const) {
		test(`generation preserves edits to ${field} and fills the other field`, async () => {
			const generation = new DeferredPromise<ISessionPullRequestDetails>();
			const { widget } = createWidget({ prepare: () => generation.p });
			input(widget, field, 'My own text');
			await generation.complete(details);
			await widget.ready;
			assert.deepStrictEqual({
				title: element<HTMLInputElement>(widget, 'input').value,
				description: element<HTMLTextAreaElement>(widget, 'textarea').value,
			}, {
				title: field === 'input' ? 'My own text' : details.title,
				description: field === 'textarea' ? 'My own text' : details.description,
			});
		});
	}

	test('generation preserves an intentionally cleared field', async () => {
		const generation = new DeferredPromise<ISessionPullRequestDetails>();
		const { widget } = createWidget({ prepare: () => generation.p });
		input(widget, 'textarea', 'Temporary');
		input(widget, 'textarea', '');
		await generation.complete(details);
		await widget.ready;
		assert.strictEqual(element<HTMLTextAreaElement>(widget, 'textarea').value, '');
	});

	test('explains branch creation for changes on the base branch', async () => {
		const { widget } = createWidget({ prepare: async () => ({ ...details, branchName: details.baseBranchName }) });
		await widget.ready;
		assert.deepStrictEqual({
			base: element(widget, '.create-pr-base-branch').textContent,
			source: element(widget, '.create-pr-source-branch').textContent,
			description: element(widget, '.create-pr-branches').getAttribute('aria-label'),
		}, { base: 'main', source: 'New branch', description: 'A new branch will be created from main' });
	});

	test('places the repository after the heading and the base to the left of the source', async () => {
		const { widget } = createWidget({ prepare: async () => ({ ...details, baseBranchName: 'release/1.0' }) });
		await widget.ready;
		const repository = element(widget, '.create-pr-repository');
		const heading = element(widget, '.create-pr-heading');
		const branches = element(widget, '.create-pr-branches');
		assert.deepStrictEqual({
			repository: repository.textContent,
			inlineRepository: heading.contains(repository),
			separator: element(widget, '.create-pr-heading-separator').getAttribute('aria-hidden'),
			branchOrder: [...branches.children].map(node => node.classList.contains('codicon-arrow-left') ? 'left-arrow' : node.textContent),
			direction: branches.getAttribute('aria-label'),
			baseFullLabel: element(widget, '.create-pr-base-branch').getAttribute('aria-label'),
			sourceFullLabel: element(widget, '.create-pr-source-branch').getAttribute('aria-label'),
			loading: element(widget, '.create-pr-branches-loading').hidden,
		}, {
			repository: 'microsoft/vscode',
			inlineRepository: true,
			separator: 'true',
			branchOrder: ['release/1.0', 'left-arrow', 'fix/keyboard-navigation'],
			direction: 'Merge source branch fix/keyboard-navigation into base branch release/1.0',
			baseFullLabel: 'Base branch: release/1.0',
			sourceFullLabel: 'Source branch: fix/keyboard-navigation',
			loading: true,
		});
	});

	test('hides the repository separator and branch diagram until metadata arrives', async () => {
		const generation = new DeferredPromise<ISessionPullRequestDetails>();
		const { widget } = createWidget({ prepare: () => generation.p });
		const before = {
			repositoryHidden: element(widget, '.create-pr-repository-context').hidden,
			branchesHidden: element(widget, '.create-pr-branches').hidden,
			loadingHidden: element(widget, '.create-pr-branches-loading').hidden,
		};
		await generation.complete(details);
		await widget.ready;
		assert.deepStrictEqual({
			before,
			after: {
				repositoryHidden: element(widget, '.create-pr-repository-context').hidden,
				branchesHidden: element(widget, '.create-pr-branches').hidden,
				loadingHidden: element(widget, '.create-pr-branches-loading').hidden,
			},
		}, {
			before: { repositoryHidden: true, branchesHidden: true, loadingHidden: false },
			after: { repositoryHidden: false, branchesHidden: false, loadingHidden: true },
		});
	});

	test('preserves full long names in the header labels', async () => {
		const branchName = 'feature/keep-keyboard-focus-when-switching-between-agent-sessions';
		const baseBranchName = 'release/long-term-support-branch';
		const repository = 'organization-with-a-long-name/repository-with-a-long-name';
		const { widget } = createWidget({ prepare: async () => ({ ...details, branchName, baseBranchName, repository }) });
		await widget.ready;
		assert.deepStrictEqual([
			element(widget, '.create-pr-repository').getAttribute('aria-label'),
			element(widget, '.create-pr-base-branch').getAttribute('aria-label'),
			element(widget, '.create-pr-source-branch').getAttribute('aria-label'),
		], [repository, `Base branch: ${baseBranchName}`, `Source branch: ${branchName}`]);
	});

	test('draft explanation uses a mouse-positioned hover and remains available to screen readers', async () => {
		const { widget, hovers } = createWidget();
		await widget.ready;
		const checkbox = element(widget, '.create-pr-draft [role="checkbox"]');
		const description = element(widget, `[id="${checkbox.getAttribute('aria-describedby')}"]`);
		const [target, options] = hovers[0];
		const hover = typeof options === 'function' ? options() : options;
		const draftText = element(widget, '.create-pr-draft .create-pr-option-text');
		draftText.click();
		assert.deepStrictEqual({
			hidden: description.hidden,
			description: description.textContent,
			hover: hover.content,
			hoverOnLabel: target === draftText,
			label: checkbox.getAttribute('aria-label'),
			checked: checkbox.getAttribute('aria-checked'),
			focused: dom.getActiveElement() === checkbox,
		}, {
			hidden: true,
			description: 'Keep the pull request in draft until it is ready for review.',
			hover: 'Keep the pull request in draft until it is ready for review.',
			hoverOnLabel: true,
			label: 'Create as Draft',
			checked: 'true',
			focused: true,
		});
		widget.dispose();
		assert.strictEqual(hovers.length, 0);
	});

	test('Agent Merge explanations appear only on info icons and remain accessible from checkboxes', async () => {
		const { widget, hovers } = createWidget();
		await widget.ready;
		select(widget, 'Agent Merge');
		const rows = [...widget.domNode.querySelectorAll<HTMLElement>('.create-pr-agent-merge-option')];
		assert.deepStrictEqual(rows.map(row => {
			const checkbox = row.querySelector<HTMLElement>('[role="checkbox"]')!;
			const description = element(widget, `[id="${checkbox.getAttribute('aria-describedby')}"]`);
			const info = row.querySelector<HTMLElement>('.create-pr-agent-merge-info')!;
			const rowHovers = hovers.filter(([target]) => row.contains(target));
			assert.deepStrictEqual(rowHovers.map(([target]) => target), [info]);
			const hover = rowHovers[0];
			const options = typeof hover[1] === 'function' ? hover[1]() : hover[1];
			const text = row.querySelector<HTMLElement>('.create-pr-agent-merge-label-text')!;
			const checked = checkbox.getAttribute('aria-checked');
			info.click();
			const infoDoesNotToggleCheckbox = checkbox.getAttribute('aria-checked') === checked;
			text.click();
			return {
				label: checkbox.getAttribute('aria-label'),
				description: description.textContent,
				hidden: description.hidden,
				hoverMatchesDescription: options.content === description.textContent,
				infoFollowsLabel: text.nextElementSibling === info,
				infoDoesNotToggleCheckbox,
				labelTogglesCheckbox: checkbox.getAttribute('aria-checked') !== checked,
				labelFocusesCheckbox: dom.getActiveElement() === checkbox,
			};
		}), [
			{
				label: 'Address Reviews',
				description: 'Agent Merge will automatically ask the agent to address feedback when the pull request has unresolved review comments.',
				hidden: true,
				hoverMatchesDescription: true,
				infoFollowsLabel: true,
				infoDoesNotToggleCheckbox: true,
				labelTogglesCheckbox: true,
				labelFocusesCheckbox: true,
			},
			{
				label: 'Fix CI Failures',
				description: 'Agent Merge will automatically ask the agent to investigate and fix failures when required CI checks fail.',
				hidden: true,
				hoverMatchesDescription: true,
				infoFollowsLabel: true,
				infoDoesNotToggleCheckbox: true,
				labelTogglesCheckbox: true,
				labelFocusesCheckbox: true,
			},
			{
				label: 'Resolve Conflicts and Behind Branches',
				description: 'Agent Merge will automatically ask the agent to update the source branch when it has merge conflicts or falls behind the base branch.',
				hidden: true,
				hoverMatchesDescription: true,
				infoFollowsLabel: true,
				infoDoesNotToggleCheckbox: true,
				labelTogglesCheckbox: true,
				labelFocusesCheckbox: true,
			},
		]);
	});

	test('draft clears auto-merge and leaves Agent Merge available', async () => {
		const { widget, submissions } = createWidget();
		await widget.ready;
		select(widget, 'Auto-Merge');
		element(widget, '.create-pr-draft [role="checkbox"]').click();
		submit(widget);
		await timeout(0);
		assert.deepStrictEqual(submissions, [{
			title: details.title,
			description: details.description,
			draft: true,
			agentMerge: false,
		}]);
	});

	for (const mode of ['Merge Manually', 'Agent Merge', 'Auto-Merge']) {
		test(`submits edited details with ${mode}`, async () => {
			const { widget, submissions, created } = createWidget();
			await widget.ready;
			input(widget, 'input', 'My title');
			input(widget, 'textarea', '');
			select(widget, mode);
			if (mode === 'Auto-Merge') {
				select(widget, 'Rebase');
			}
			submit(widget);
			await timeout(0);
			assert.deepStrictEqual({ submissions, created: created() }, {
				submissions: [{
					title: 'My title',
					description: '',
					draft: false,
					agentMerge: mode === 'Agent Merge',
					...(mode === 'Agent Merge' ? { agentMergeOptions } : {}),
					...(mode === 'Auto-Merge' ? { autoMergeMethod: 'REBASE' } : {}),
				}],
				created: 1,
			});
		});
	}

	test('honors repository merge methods and hides unavailable Agent Merge', async () => {
		const { widget } = createWidget({
			prepare: async () => ({ ...details, mergeMethods: ['MERGE'], agentMergeAvailable: false }),
		});
		await widget.ready;
		select(widget, 'Auto-Merge');
		assert.deepStrictEqual(
			[...widget.domNode.querySelectorAll('[role="radio"]')].filter(node => !node.closest('[hidden]')).map(node => ({ label: node.textContent, checked: node.getAttribute('aria-checked') })),
			[
				{ label: 'Merge Manually', checked: 'false' },
				{ label: 'Auto-Merge', checked: 'true' },
				{ label: 'Merge Commit', checked: 'true' },
			],
		);
	});

	function agentMergeState(widget: CreatePullRequestWidget) {
		const section = element(widget, '.create-pr-agent-merge');
		return {
			hidden: section.hidden,
			actions: [...section.querySelectorAll('[role="checkbox"]')].map(checkbox => ({
				label: checkbox.getAttribute('aria-label'),
				checked: checkbox.getAttribute('aria-checked'),
				disabled: checkbox.getAttribute('aria-disabled'),
			})),
			policy: section.querySelector('[role="radio"][aria-checked="true"]')?.textContent,
		};
	}

	test('selecting Agent Merge reveals the effective session configuration', async () => {
		const { widget } = createWidget();
		await widget.ready;
		const initiallyHidden = element(widget, '.create-pr-agent-merge').hidden;
		select(widget, 'Agent Merge');
		assert.deepStrictEqual({ initiallyHidden, state: agentMergeState(widget) }, {
			initiallyHidden: true,
			state: {
				hidden: false,
				actions: [
					{ label: 'Address Reviews', checked: 'false', disabled: 'false' },
					{ label: 'Fix CI Failures', checked: 'true', disabled: 'false' },
					{ label: 'Resolve Conflicts and Behind Branches', checked: 'false', disabled: 'false' },
				],
				policy: 'If Unchanged',
			},
		});
	});

	test('submits the session options shown in the Agent Merge controls', async () => {
		const { widget, submissions } = createWidget();
		await widget.ready;
		select(widget, 'Agent Merge');
		element(widget, '[role="checkbox"][aria-label="Address Reviews"]').click();
		element(widget, '[role="checkbox"][aria-label="Fix CI Failures"]').click();
		element(widget, '[role="checkbox"][aria-label="Resolve Conflicts and Behind Branches"]').click();
		select(widget, 'When Ready');
		submit(widget);
		await timeout(0);
		assert.deepStrictEqual(submissions, [{
			title: details.title,
			description: details.description,
			draft: false,
			agentMerge: true,
			agentMergeOptions: { addressReviews: true, fixCI: false, resolveConflicts: true, mergePullRequest: 'always' },
		}]);
	});

	for (const otherMode of ['Merge Manually', 'Auto-Merge']) {
		test(`switching to ${otherMode} retains edits without submitting Agent Merge options`, async () => {
			const { widget, submissions } = createWidget();
			await widget.ready;
			select(widget, 'Agent Merge');
			element(widget, '[role="checkbox"][aria-label="Address Reviews"]').click();
			select(widget, 'Off');
			select(widget, otherMode);
			const hidden = element(widget, '.create-pr-agent-merge').hidden;
			select(widget, 'Agent Merge');
			const restored = agentMergeState(widget);
			select(widget, otherMode);
			submit(widget);
			await timeout(0);
			assert.deepStrictEqual({
				hidden,
				restoredReview: restored.actions[0].checked,
				restoredPolicy: restored.policy,
				submitted: submissions[0],
			}, {
				hidden: true,
				restoredReview: 'true',
				restoredPolicy: 'Off',
				submitted: {
					title: details.title,
					description: details.description,
					draft: false,
					agentMerge: false,
					...(otherMode === 'Auto-Merge' ? { autoMergeMethod: 'SQUASH' } : {}),
				},
			});
		});
	}

	test('retrying text generation does not reset edited Agent Merge configuration', async () => {
		const { widget, submissions } = createWidget({
			prepare: async () => ({ ...details, generationError: 'Unavailable' }),
		});
		await widget.ready;
		select(widget, 'Agent Merge');
		element(widget, '[role="checkbox"][aria-label="Address Reviews"]').click();
		select(widget, 'When Ready');
		element(widget, '.create-pr-generation > .monaco-button').click();
		await timeout(0);
		submit(widget);
		await timeout(0);
		assert.deepStrictEqual(submissions[0].agentMergeOptions, {
			...agentMergeOptions,
			addressReviews: true,
			mergePullRequest: 'always',
		});
	});

	test('cancelling after editing Agent Merge settings makes no submission', async () => {
		let cancelled = false;
		const { widget, submissions } = createWidget(undefined, () => cancelled = true);
		await widget.ready;
		select(widget, 'Agent Merge');
		select(widget, 'When Ready');
		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, bubbles: true }));
		assert.deepStrictEqual({ submissions, cancelled }, { submissions: [], cancelled: true });
	});

	test('does not send configuration to a host that only supports enabling Agent Merge', async () => {
		const { widget, submissions } = createWidget({ prepare: async () => ({ ...details, agentMergeOptions: undefined }) });
		await widget.ready;
		select(widget, 'Agent Merge');
		submit(widget);
		await timeout(0);
		assert.deepStrictEqual({
			hidden: element(widget, '.create-pr-agent-merge').hidden,
			submitted: submissions[0],
		}, {
			hidden: true,
			submitted: { title: details.title, description: details.description, draft: false, agentMerge: true },
		});
	});

	test('Agent Merge controls support keyboard navigation and disable during submission', async () => {
		const completion = new DeferredPromise<void>();
		const { widget } = createWidget({ create: () => completion.p });
		await widget.ready;
		select(widget, 'Agent Merge');
		const mode = element(widget, '[role="radio"][aria-label="Agent Merge"]');
		mode.focus();
		mode.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9, bubbles: true }));
		const focusedReview = dom.getActiveElement() === element(widget, '[role="checkbox"][aria-label="Address Reviews"]');
		element(widget, '[role="checkbox"][aria-label="Address Reviews"]').dispatchEvent(new KeyboardEvent('keydown', { keyCode: 32, bubbles: true }));
		const checkedByKeyboard = element(widget, '[role="checkbox"][aria-label="Address Reviews"]').getAttribute('aria-checked');
		submit(widget);
		const disabled = agentMergeState(widget).actions.map(action => action.disabled);
		await completion.complete();
		await timeout(0);
		assert.deepStrictEqual({ focusedReview, checkedByKeyboard, disabled }, { focusedReview: true, checkedByKeyboard: 'true', disabled: ['true', 'true', 'true'] });
	});

	test('manual creation remains available after preparation fails', async () => {
		const { widget, submissions } = createWidget({ prepare: async () => { throw new Error('Offline'); } });
		await widget.ready;
		input(widget, 'input', 'Written manually');
		submit(widget);
		await timeout(0);
		assert.deepStrictEqual({
			submissions,
			loading: loadingState(widget),
		}, {
			submissions: [{ title: 'Written manually', description: '', draft: false, agentMerge: false }],
			loading: {
				spinners: [{ hidden: true, decorative: 'true' }, { hidden: true, decorative: 'true' }],
				busy: ['false', 'false'],
				statusHidden: false,
				status: 'Could not load pull request details: Offline Enter your own or retry.',
			},
		});
	});

	test('retry preserves user input while recovering generation', async () => {
		const retried = new DeferredPromise<ISessionPullRequestDetails>();
		let attempts = 0;
		const { widget } = createWidget({
			prepare: () => ++attempts === 1
				? Promise.resolve({ ...details, title: '', description: '', generationError: 'Unavailable' })
				: retried.p,
		});
		await widget.ready;
		input(widget, 'input', 'Keep this title');
		const retry = element(widget, '.create-pr-generation > .monaco-button');
		retry.focus();
		retry.click();
		const duringRetry = loadingState(widget);
		const focusRestored = dom.getActiveElement() === element(widget, 'input');
		await retried.complete(details);
		await timeout(0);
		assert.deepStrictEqual({
			attempts,
			duringRetry,
			focusRestored,
			title: element<HTMLInputElement>(widget, 'input').value,
			description: element<HTMLTextAreaElement>(widget, 'textarea').value,
			loading: loadingState(widget),
		}, {
			attempts: 2,
			duringRetry: {
				spinners: [{ hidden: false, decorative: 'true' }, { hidden: false, decorative: 'true' }],
				busy: ['true', 'true'],
				statusHidden: true,
				status: '',
			},
			focusRestored: true,
			title: 'Keep this title',
			description: details.description,
			loading: {
				spinners: [{ hidden: true, decorative: 'true' }, { hidden: true, decorative: 'true' }],
				busy: ['false', 'false'],
				statusHidden: true,
				status: '',
			},
		});
	});

	test('an empty generation error still offers retry and manual entry', async () => {
		const { widget } = createWidget({ prepare: async () => ({ ...details, title: '', description: '', generationError: '' }) });
		await widget.ready;
		assert.deepStrictEqual({
			status: element(widget, '[role="status"]').textContent,
			retryHidden: element(widget, '.create-pr-generation > .monaco-button').hidden,
		}, { status: 'Could not generate details. Enter your own or retry.', retryHidden: false });
	});

	test('creation errors keep the form editable without losing input', async () => {
		const { widget, created } = createWidget({ create: async () => { throw new Error('Push rejected'); } });
		await widget.ready;
		input(widget, 'input', 'Keep my title');
		submit(widget);
		await timeout(0);
		assert.deepStrictEqual({
			title: element<HTMLInputElement>(widget, 'input').value,
			editable: !element<HTMLInputElement>(widget, 'input').disabled,
			error: element(widget, '[role="alert"]').textContent,
			submitting: widget.isSubmitting,
			created: created(),
		}, {
			title: 'Keep my title',
			editable: true,
			error: 'Could not create the pull request: Push rejected',
			submitting: false,
			created: 0,
		});
	});

	for (const field of ['input', 'textarea'] as const) {
		test(`failed keyboard submission restores ${field} focus and Escape handling`, async () => {
			const completion = new DeferredPromise<void>();
			let cancelled = 0;
			const { widget } = createWidget({ create: () => completion.p }, () => cancelled++);
			await widget.ready;
			const input = element<HTMLInputElement | HTMLTextAreaElement>(widget, field);
			input.focus();
			input.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, ctrlKey: !isMacintosh, metaKey: isMacintosh, bubbles: true }));
			const disabledDuringSubmission = input.disabled;
			await completion.error(new Error('Push rejected'));
			await timeout(0);
			const focused = dom.getActiveElement();
			focused?.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, bubbles: true }));
			assert.deepStrictEqual({
				disabledDuringSubmission, focusRestored: focused === input, editable: !input.disabled,
				submitting: widget.isSubmitting, cancelled,
			}, {
				disabledDuringSubmission: true, focusRestored: true, editable: true,
				submitting: false, cancelled: 1,
			});
		});
	}

	test('a failed submission does not steal focus moved outside the form', async () => {
		const completion = new DeferredPromise<void>();
		const { widget } = createWidget({ create: () => completion.p });
		await widget.ready;
		widget.focus();
		element(widget, 'input').dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, ctrlKey: !isMacintosh, metaKey: isMacintosh, bubbles: true }));
		const outside = dom.append(document.body, dom.$('button', undefined, 'Another action'));
		store.add(toDisposable(() => outside.remove()));
		outside.focus();
		await completion.error(new Error('Push rejected'));
		await timeout(0);
		assert.strictEqual(dom.getActiveElement(), outside);
	});

	for (const group of ['After creation', 'Merge method']) {
		test(`failed keyboard submission restores the rebuilt ${group} radio`, async () => {
			const completion = new DeferredPromise<void>();
			let cancelled = 0;
			const { widget } = createWidget({ create: () => completion.p }, () => cancelled++);
			await widget.ready;
			select(widget, 'Auto-Merge');
			select(widget, 'Rebase');
			const selector = `[role="radiogroup"][aria-label="${group}"] [aria-checked="true"]`;
			const previousRadio = element(widget, selector);
			previousRadio.focus();
			previousRadio.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, ctrlKey: !isMacintosh, metaKey: isMacintosh, bubbles: true }));
			await completion.error(new Error('Push rejected'));
			await timeout(0);
			const currentRadio = element(widget, selector);
			const focused = dom.getActiveElement();
			focused?.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, bubbles: true }));
			assert.deepStrictEqual({
				rebuilt: currentRadio !== previousRadio,
				focused: focused === currentRadio,
				label: currentRadio.textContent,
				submitting: widget.isSubmitting,
				cancelled,
			}, { rebuilt: true, focused: true, label: group === 'After creation' ? 'Auto-Merge' : 'Rebase', submitting: false, cancelled: 1 });
		});
	}

	for (const selector of ['[role="radio"][aria-checked="true"]', '.create-pr-buttons > .monaco-button', '.create-pr-submit', '.monaco-dropdown-button']) {
		test(`Escape from ${selector} cancels before the button consumes the key`, async () => {
			let cancelled = 0;
			const { widget } = createWidget(undefined, () => cancelled++, { sendToChat: async () => { } });
			await widget.ready;
			const control = element(widget, selector);
			control.focus();
			control.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, bubbles: true }));
			assert.strictEqual(cancelled, 1);
		});
	}

	test('prevents duplicate submission while creating', async () => {
		const completion = new DeferredPromise<void>();
		let submissions = 0;
		const { widget } = createWidget({ create: async () => { submissions++; await completion.p; } });
		await widget.ready;
		submit(widget);
		submit(widget);
		const during = { submissions, submitting: widget.isSubmitting, inputDisabled: element<HTMLInputElement>(widget, 'input').disabled };
		await completion.complete();
		await timeout(0);
		assert.deepStrictEqual(during, { submissions: 1, submitting: true, inputDisabled: true });
	});

	test('supports keyboard submission, focus wrapping, and Escape', async () => {
		let cancelled = 0;
		const { widget, submissions } = createWidget(undefined, () => cancelled++);
		await widget.ready;
		widget.focus();
		element(widget, 'input').dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9, shiftKey: true, bubbles: true }));
		const wrapped = dom.getActiveElement() === element(widget, '.create-pr-buttons > .monaco-button:last-child');
		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, ctrlKey: !isMacintosh, metaKey: isMacintosh, bubbles: true }));
		await timeout(0);
		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, bubbles: true }));
		assert.deepStrictEqual({ wrapped, cancelled, submissions: submissions.length }, { wrapped: true, cancelled: 1, submissions: 1 });
	});

	test('disposal cancels preparation and ignores late results', async () => {
		const generation = new DeferredPromise<ISessionPullRequestDetails>();
		let token: CancellationToken | undefined;
		const { widget } = createWidget({ prepare: cancellation => { token = cancellation; return generation.p; } });
		widget.dispose();
		await generation.complete(details);
		await widget.ready;
		assert.deepStrictEqual({ cancelled: token?.isCancellationRequested, title: element<HTMLInputElement>(widget, 'input').value }, { cancelled: true, title: '' });
	});

	test('container relayout keeps the final Agent Merge controls scrollable after shrinking', async () => {
		const { host, anchor, contextView, relayout } = createContextView();
		contextView.show(anchor, {
			operationId: 'create-pr', prepare: async () => details,
			prepareChatRequest: async query => ({ query }), create: async () => { },
		});
		await timeout(0);
		const dialog = host.querySelector<HTMLElement>('.create-pull-request-widget')!;
		dialog.querySelector<HTMLElement>('[role="radio"][aria-label="Agent Merge"]')!.click();
		const body = dialog.querySelector<HTMLElement>('.create-pr-body')!;
		const controls = dialog.querySelectorAll<HTMLElement>('.create-pr-agent-merge [role="radio"]');
		const finalControl = controls[controls.length - 1];
		dialog.style.maxHeight = 'none';
		body.style.maxHeight = 'none';
		relayout();
		const initiallyFits = body.clientHeight === body.scrollHeight;

		body.style.maxHeight = '160px';
		relayout();
		const wheel = new WheelEvent('wheel', { deltaY: 10000, bubbles: true, cancelable: true });
		// Chromium gives synthetic legacy deltas the wrong sign; keep both representations consistent.
		Object.defineProperty(wheel, 'wheelDeltaY', { value: -10000 });
		body.dispatchEvent(wheel);
		const scrolledToEnd = Math.abs(body.scrollTop - (body.scrollHeight - body.clientHeight)) <= 1 && body.scrollTop > 0;
		const controlVisible = finalControl.getBoundingClientRect().top >= body.getBoundingClientRect().top
			&& finalControl.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 1;

		body.style.maxHeight = 'none';
		relayout();
		assert.deepStrictEqual({ initiallyFits, scrolledToEnd, controlVisible, scrollTopAfterGrowing: body.scrollTop }, {
			initiallyFits: true, scrolledToEnd: true, controlVisible: true, scrollTopAfterGrowing: 0,
		});
	});

	test('the real context view opens immediately and restores focus on Escape', async () => {
		const { host, anchor, contextView } = createContextView();
		const generation = new DeferredPromise<ISessionPullRequestDetails>();
		let cancellation: CancellationToken | undefined;
		let created = false;
		anchor.focus();
		contextView.show(anchor, {
			operationId: 'create-pr',
			prepareChatRequest: async query => ({ query }),
			prepare: token => { cancellation = token; return generation.p; },
			create: async () => { created = true; },
		});
		const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
		assert.ok(dialog);
		const focusedInside = dialog.contains(dom.getActiveElement());
		dialog.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, bubbles: true }));
		await generation.complete(details);
		await timeout(0);
		assert.deepStrictEqual({
			focusedInside,
			focusRestored: dom.getActiveElement() === anchor,
			cancelled: cancellation?.isCancellationRequested,
			hidden: !host.querySelector('[role="dialog"]'),
			created,
		}, { focusedInside: true, focusRestored: true, cancelled: true, hidden: true, created: false });
	});

	test('Accessibility Help does not discard the form or edits', async () => {
		const { host, anchor, contextService, contextView } = createContextView();
		contextView.show(anchor, { operationId: 'create-pr', prepare: async () => details, prepareChatRequest: async query => ({ query }), create: async () => { } });
		await timeout(0);
		const title = host.querySelector<HTMLInputElement>('input')!;
		title.value = 'Keep my draft';
		title.dispatchEvent(new Event('input', { bubbles: true }));
		const instantiationService = store.add(new TestInstantiationService());
		const help = store.add(instantiationService.invokeFunction(accessor => new SessionsChangesAccessibilityHelp().getProvider(accessor)));
		const popup = contextService.showContextView({
			getAnchor: () => anchor,
			render: container => {
				const content = dom.append(container, dom.$('div', { tabIndex: 0 }, help.provideContent()));
				content.focus();
				content.click();
				return toDisposable(() => content.remove());
			},
		});
		popup.close();
		help.onClose();
		assert.deepStrictEqual({
			formRetained: title.isConnected,
			title: title.value,
			focused: dom.getActiveElement() === title,
		}, { formRetained: true, title: 'Keep my draft', focused: true });
		contextView.close();
	});

	test('clicking outside dismisses the form without creating or stealing focus', async () => {
		const { host, anchor, contextView } = createContextView();
		let created = false;
		contextView.show(anchor, { operationId: 'create-pr', prepare: async () => details, prepareChatRequest: async query => ({ query }), create: async () => { created = true; } });
		await timeout(0);
		const outside = dom.append(host, dom.$('button', undefined, 'Another action'));
		outside.focus();
		outside.click();
		assert.deepStrictEqual({
			closed: !host.querySelector('[role="dialog"]'),
			focused: dom.getActiveElement() === outside,
			created,
		}, { closed: true, focused: true, created: false });
	});

	for (const outcome of ['success', 'failure'] as const) {
		test(`creation ${outcome} cannot close or steal focus from a newer form after a session switch`, async () => {
			const { host, anchor, contextView, errors } = createContextView();
			const completion = new DeferredPromise<void>();
			contextView.show(anchor, { operationId: 'create-pr', prepare: async () => details, prepareChatRequest: async query => ({ query }), create: () => completion.p });
			await timeout(0);
			const input = host.querySelector<HTMLInputElement>('input')!;
			input.focus();
			input.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, ctrlKey: !isMacintosh, metaKey: isMacintosh, bubbles: true }));
			const outside = dom.append(host, dom.$('button', undefined, 'Another action'));
			outside.click();
			const visibleWhileSubmitting = !!host.querySelector('[role="dialog"]');
			contextView.close();
			contextView.show(anchor, { operationId: 'create-pr', prepare: async () => ({ ...details, title: 'Another session' }), prepareChatRequest: async query => ({ query }), create: async () => { } });
			await timeout(0);
			const newInput = host.querySelector<HTMLInputElement>('input')!;
			newInput.focus();
			const error = new Error('Push rejected');
			if (outcome === 'success') {
				await completion.complete();
			} else {
				await completion.error(error);
			}
			await timeout(0);
			assert.deepStrictEqual({
				visibleWhileSubmitting,
				title: host.querySelector<HTMLInputElement>('input')?.value,
				focusRetained: dom.getActiveElement() === newInput,
				errors,
			}, {
				visibleWhileSubmitting: true, title: 'Another session', focusRetained: true,
				errors: outcome === 'failure' ? [error] : [],
			});
			contextView.close();
		});
	}
});
