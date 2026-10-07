/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ActionListItemKind } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { IRepositoryPickResult } from '../../../../../workbench/contrib/chat/browser/agentSessions/repositoryPicker.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { CustomViewVisibleContext, SessionWorktreeCleanupEditorFocusedContext } from '../../../../common/contextkeys.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_GITHUB } from '../../../../services/sessions/common/session.js';
import { showMobileWorkspacePickerSheet } from '../../../chat/browser/mobile/mobileWorkspacePickerSheet.js';
import { SessionsChatAccessibilityHelp } from '../../../chat/browser/sessionsChatAccessibilityHelp.js';
import { MobileRepositoryPicker } from '../../browser/mobileRepositoryPicker.js';

suite('MobileRepositoryPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;

	setup(() => {
		clock = sinon.useFakeTimers();
	});

	teardown(() => sinon.restore());

	function createPicker() {
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const trigger = dom.append(container, dom.$<HTMLButtonElement>('button', { type: 'button' }));
		trigger.textContent = 'Choose repository';
		trigger.focus();
		const errors: { message: string | Error; error?: Error }[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILayoutService, { mainContainer: container });
		instantiationService.stub(ILogService, new class extends NullLogService {
			override error(message: string | Error, error?: Error): void {
				errors.push({ message, error });
			}
		}());
		const picker = store.add(instantiationService.createInstance(MobileRepositoryPicker));
		return { picker, container, trigger, errors };
	}

	function getInput(container: HTMLElement): HTMLInputElement {
		return container.querySelector<HTMLInputElement>('.mobile-picker-sheet-search-input')!;
	}

	function getRows(container: HTMLElement): HTMLButtonElement[] {
		return [...container.querySelectorAll<HTMLButtonElement>('.mobile-picker-sheet-list button')];
	}

	function query(input: HTMLInputElement, value: string): void {
		input.value = value;
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
	}

	function key(target: HTMLElement, value: string, shiftKey = false): void {
		target.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true }));
	}

	(isWeb ? test : test.skip)('workspace GitHub header opens the mobile repository sheet without quick input', async () => {
		const { picker, container, trigger, errors } = createPicker();
		container.classList.add('phone-layout');
		const layoutService = upcastPartial<IWorkbenchLayoutService>({ mainContainer: container });
		const queries: string[] = [];
		let browseCalls = 0;
		const selected = new DeferredPromise<IRepositoryPickResult | undefined>();
		const browseAction: ISessionWorkspaceBrowseAction = {
			label: 'GitHub', icon: Codicon.github, providerId: 'test-github', group: SESSION_WORKSPACE_GROUP_GITHUB,
			run: async () => {
				browseCalls++;
				await selected.complete(await picker.pickRepository(async query => {
					queries.push(query);
					return query === 'some-repo' ? ['Mixed.Owner/Some-Repo'] : ['Example/another'];
				}));
				return undefined;
			},
		};
		const workspaceSheet = showMobileWorkspacePickerSheet(layoutService, trigger, [
			{
				kind: ActionListItemKind.Action,
				label: 'Example/recent',
				item: {
					folderUri: URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/Example/recent/HEAD' }),
					providerId: browseAction.providerId,
				},
			},
			{
				kind: ActionListItemKind.Action,
				label: browseAction.label,
				group: { title: '', icon: browseAction.icon },
				item: { browseActionIndex: 0 },
			},
		], item => {
			assert.strictEqual(item.browseActionIndex, 0);
			void browseAction.run().catch(error => selected.error(error));
		}, [browseAction]);
		store.add(toDisposable(() => container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')?.click()));
		const recentRow = getRows(container)[0];
		const workspaceState = {
			title: container.querySelector('[role="dialog"]')?.ariaLabel,
			rows: getRows(container).map(row => row.textContent),
			recentVisible: recentRow.getBoundingClientRect().height > 0,
			expanded: trigger.getAttribute('aria-expanded'),
			browseCalls,
			quickInputs: mainWindow.document.querySelectorAll('.quick-input-widget').length,
		};
		container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-header-action[aria-label="GitHub"]')!.click();
		await clock.tickAsync(181);
		await workspaceSheet;
		const input = getInput(container);
		const repositoryState = {
			title: container.querySelector('[role="dialog"]')?.ariaLabel,
			dialogs: container.querySelectorAll('[role="dialog"]').length,
			expanded: trigger.getAttribute('aria-expanded'),
			focused: dom.getActiveElement() === input,
			quickInputs: mainWindow.document.querySelectorAll('.quick-input-widget').length,
		};

		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const contextKeys = store.add(new ContextKeyService(configuration));
		IsSessionsWindowContext.bindTo(contextKeys).set(true);
		CustomViewVisibleContext.bindTo(contextKeys).set(false);
		SessionWorktreeCleanupEditorFocusedContext.bindTo(contextKeys).set(false);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IContextKeyService, contextKeys);
		instantiationService.stub(IEnvironmentService, { isBuilt: true });
		instantiationService.stub(IAgentHostFilterService, { selectedHost: undefined });
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
		const help = new SessionsChatAccessibilityHelp();
		const helpProvider = store.add(help.getProvider(instantiationService));
		const helpContent = helpProvider.provideContent();
		trigger.focus();
		helpProvider.onClose();
		const accessibilityHelp = {
			applies: contextKeys.contextMatchesRules(help.when),
			search: helpContent.includes('When choosing a GitHub repository in the browser, search or enter a GitHub URL or owner/repository.'),
			keyboard: helpContent.includes('Use the arrow keys to navigate results, Enter to select, and Escape to cancel.'),
			verbosity: helpProvider.verbositySettingKey,
			restoresSearchFocus: dom.getActiveElement() === input,
		};

		query(input, 'some-repo');
		await clock.tickAsync(300);
		const searchState = {
			rows: getRows(container).map(row => row.textContent),
			quickInputs: mainWindow.document.querySelectorAll('.quick-input-widget').length,
		};
		getRows(container)[0].click();
		await clock.tickAsync(180);
		assert.deepStrictEqual({
			workspaceState, repositoryState, accessibilityHelp, searchState, queries, browseCalls, errors,
			selection: await selected.p,
			dialogs: container.querySelectorAll('[role="dialog"]').length,
			focusRestored: dom.getActiveElement() === trigger,
			quickInputs: mainWindow.document.querySelectorAll('.quick-input-widget').length,
		}, {
			workspaceState: { title: 'Choose Workspace', rows: ['Example/recent'], recentVisible: true, expanded: 'true', browseCalls: 0, quickInputs: 0 },
			repositoryState: { title: 'Choose repository', dialogs: 1, expanded: 'false', focused: true, quickInputs: 0 },
			accessibilityHelp: { applies: true, search: true, keyboard: true, verbosity: 'accessibility.verbosity.sessionsChat', restoresSearchFocus: true },
			searchState: { rows: ['Mixed.Owner/Some-Repo'], quickInputs: 0 },
			queries: ['', 'some-repo'], browseCalls: 1, errors: [],
			selection: { repository: 'Mixed.Owner/Some-Repo' }, dialogs: 0, focusRestored: true, quickInputs: 0,
		});
	});

	test('shows loading and returns the original repository value from a touch selection', async () => {
		const { picker, container, trigger } = createPicker();
		const repositories = new DeferredPromise<readonly string[]>();
		const result = picker.pickRepository(() => repositories.p);
		const initial = {
			message: container.querySelector('[role="status"]')?.textContent,
			busy: container.querySelector('[role="list"]')?.getAttribute('aria-busy'),
			focused: dom.getActiveElement() === getInput(container),
		};
		await repositories.complete(['Zebra/Repo.Two', 'Mixed.Owner/Some-Repo']);
		await clock.tickAsync(0);
		const rows = getRows(container);
		const labels = rows.map(row => row.textContent);
		rows[0].dispatchEvent(new mainWindow.PointerEvent('click', { pointerType: 'touch', bubbles: true, cancelable: true }));
		rows[1].click();
		await clock.tickAsync(180);

		assert.deepStrictEqual({
			initial, labels, selection: await result,
			open: !!container.querySelector('.mobile-picker-sheet'),
			focusRestored: dom.getActiveElement() === trigger,
		}, {
			initial: { message: 'Loading repositories…', busy: 'true', focused: true },
			labels: ['Mixed.Owner/Some-Repo', 'Zebra/Repo.Two'],
			selection: { repository: 'Mixed.Owner/Some-Repo' },
			open: false,
			focusRestored: true,
		});
	});

	test('supports arrow navigation, keyboard selection and focus containment', async () => {
		const { picker, container, trigger } = createPicker();
		const result = picker.pickRepository(async () => ['owner/first', 'owner/last']);
		await clock.tickAsync(0);
		const input = getInput(container);
		const rows = getRows(container);
		const close = container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!;
		const dialog = container.querySelector('[role="dialog"]')!;
		const accessible = { title: dialog.ariaLabel, modal: dialog.ariaModal, inputLabel: input.ariaLabel };
		const focus: boolean[] = [];
		key(input, 'ArrowDown');
		focus.push(dom.getActiveElement() === rows[0]);
		key(rows[0], 'End');
		focus.push(dom.getActiveElement() === rows[1]);
		key(rows[1], 'Tab');
		focus.push(dom.getActiveElement() === close);
		key(close, 'Tab', true);
		focus.push(dom.getActiveElement() === rows[1]);
		key(rows[1], 'Home');
		focus.push(dom.getActiveElement() === rows[0]);
		key(rows[0], 'ArrowUp');
		focus.push(dom.getActiveElement() === input);
		key(input, 'ArrowUp');
		focus.push(dom.getActiveElement() === rows[1]);
		key(rows[1], 'Enter');
		await clock.tickAsync(180);

		assert.deepStrictEqual({ accessible, focus, selection: await result, focusRestored: dom.getActiveElement() === trigger }, {
			accessible: { title: 'Choose repository', modal: 'true', inputLabel: 'Search repositories' },
			focus: [true, true, true, true, true, true, true],
			selection: { repository: 'owner/last' },
			focusRestored: true,
		});
	});

	test('shows an empty state without accepting a nonexistent result', async () => {
		const { picker, container } = createPicker();
		const result = picker.pickRepository(async () => []);
		await clock.tickAsync(0);
		key(getInput(container), 'Enter');
		const state = {
			message: container.querySelector('[role="status"]')?.textContent,
			busy: container.querySelector('[role="list"]')?.getAttribute('aria-busy'),
			rows: getRows(container).length,
			open: !!container.querySelector('.mobile-picker-sheet:not(.closing)'),
		};
		container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click();
		await clock.tickAsync(180);
		assert.deepStrictEqual({ state, selection: await result }, {
			state: { message: 'No repositories found. Try a different search.', busy: 'false', rows: 0, open: true },
			selection: undefined,
		});
	});

	test('cancels on each keystroke and ignores stale results before and after the debounce', async () => {
		const { picker, container, errors } = createPicker();
		const requests: { query: string; token: CancellationToken; result: DeferredPromise<readonly string[]> }[] = [];
		const result = picker.pickRepository((query, token) => {
			const result = new DeferredPromise<readonly string[]>();
			requests.push({ query, token, result });
			return result.p;
		});
		await clock.tickAsync(0);
		const input = getInput(container);
		query(input, 'old');
		const initiallyCancelled = requests[0].token.isCancellationRequested;
		await requests[0].result.complete(['stale/initial']);
		await clock.tickAsync(300);
		query(input, 'latest');
		const oldCancelled = requests[1].token.isCancellationRequested;
		await requests[1].result.complete(['stale/search']);
		await clock.tickAsync(299);
		const beforeDebounce = { queries: requests.map(request => request.query), rows: getRows(container).length };
		await clock.tickAsync(1);
		await requests[2].result.complete(['current/result']);
		await clock.tickAsync(0);
		const labels = getRows(container).map(row => row.textContent);
		key(input, 'Enter');
		await clock.tickAsync(180);

		assert.deepStrictEqual({
			initiallyCancelled, oldCancelled, beforeDebounce, labels,
			queries: requests.map(request => request.query), errors, selection: await result,
		}, {
			initiallyCancelled: true, oldCancelled: true,
			beforeDebounce: { queries: ['', 'old'], rows: 0 },
			labels: ['current/result'], queries: ['', 'old', 'latest'], errors: [],
			selection: { repository: 'current/result' },
		});
	});

	test('removes stale row handlers immediately when the query changes', async () => {
		const { picker, container } = createPicker();
		const next = new DeferredPromise<readonly string[]>();
		const result = picker.pickRepository(query => query ? next.p : Promise.resolve(['previous/repository']));
		await clock.tickAsync(0);
		const previous = getRows(container)[0];
		const input = getInput(container);
		query(input, 'new');
		previous.click();
		key(input, 'Enter');
		const remainedOpen = !!container.querySelector('.mobile-picker-sheet:not(.closing)');
		await clock.tickAsync(300);
		await next.complete(['new/repository']);
		await clock.tickAsync(0);
		getRows(container)[0].click();
		await clock.tickAsync(180);
		assert.deepStrictEqual({ remainedOpen, selection: await result }, { remainedOpen: true, selection: { repository: 'new/repository' } });
	});

	test('does not open a sheet or start a request when already cancelled or disposed', async () => {
		const { picker, container } = createPicker();
		let loads = 0;
		const load = async () => { loads++; return ['owner/repo']; };
		const cancelled = await picker.pickRepository(load, CancellationToken.Cancelled);
		picker.dispose();
		const disposed = await picker.pickRepository(load);
		assert.deepStrictEqual({ cancelled, disposed, loads, open: !!container.querySelector('.mobile-picker-sheet') }, {
			cancelled: undefined, disposed: undefined, loads: 0, open: false,
		});
	});

	test('cancellation before the initial request runs cancels the scheduled load', async () => {
		const { picker, container } = createPicker();
		const cancellation = store.add(new CancellationTokenSource());
		let loads = 0;
		const result = picker.pickRepository(async () => { loads++; return []; }, cancellation.token);
		cancellation.cancel();
		await clock.tickAsync(180);
		assert.deepStrictEqual({ selection: await result, loads, open: !!container.querySelector('.mobile-picker-sheet') }, {
			selection: undefined, loads: 0, open: false,
		});
	});

	for (const dismissal of ['token', 'dispose', 'escape', 'backdrop', 'cancel'] as const) {
		test(`${dismissal} cancels an unresolved load and removes input handlers`, async () => {
			const { picker, container, trigger, errors } = createPicker();
			const cancellation = store.add(new CancellationTokenSource());
			const pending = new DeferredPromise<readonly string[]>();
			let loads = 0;
			let requestToken = CancellationToken.None;
			const result = picker.pickRepository((_query, token) => {
				loads++;
				requestToken = token;
				return pending.p;
			}, cancellation.token);
			await clock.tickAsync(0);
			const input = getInput(container);
			switch (dismissal) {
				case 'token': cancellation.cancel(); break;
				case 'dispose': picker.dispose(); break;
				case 'escape': key(input, 'Escape'); break;
				case 'backdrop': container.querySelector<HTMLElement>('.mobile-picker-sheet-backdrop')!.click(); break;
				case 'cancel': container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click(); break;
			}
			const immediatelyCancelled = requestToken.isCancellationRequested;
			query(input, 'must not load');
			await clock.tickAsync(500);
			const selection = await result;
			await pending.complete(['late/repository']);
			await clock.tickAsync(0);

			assert.deepStrictEqual({
				immediatelyCancelled, selection, loads, errors,
				open: !!container.querySelector('.mobile-picker-sheet'),
				focusRestored: dom.getActiveElement() === trigger,
			}, { immediatelyCancelled: true, selection: undefined, loads: 1, errors: [], open: false, focusRestored: true });
		});
	}

	test('dismissal cancels the pending search debounce', async () => {
		const { picker, container } = createPicker();
		const queries: string[] = [];
		const result = picker.pickRepository(async query => { queries.push(query); return []; });
		await clock.tickAsync(0);
		query(getInput(container), 'never searched');
		container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click();
		await clock.tickAsync(500);
		assert.deepStrictEqual({ queries, selection: await result }, { queries: [''], selection: undefined });
	});

	test('shows and logs load failures, then clears the error when retrying', async () => {
		const { picker, container, errors } = createPicker();
		const failure = new Error('Repository request failed');
		let attempts = 0;
		const result = picker.pickRepository(async () => {
			if (++attempts === 1) {
				throw failure;
			}
			return ['owner/recovered'];
		});
		await clock.tickAsync(0);
		const failedState = {
			message: container.querySelector('[role="alert"]')?.textContent,
			busy: container.querySelector('[role="list"]')?.getAttribute('aria-busy'),
			rows: getRows(container).map(row => row.textContent),
		};
		getRows(container)[0].click();
		await clock.tickAsync(0);
		const recoveredState = { errors: container.querySelectorAll('[role="alert"]').length, rows: getRows(container).map(row => row.textContent) };
		getRows(container)[0].click();
		await clock.tickAsync(180);

		assert.deepStrictEqual({ failedState, errors, attempts, recoveredState, selection: await result }, {
			failedState: {
				message: 'Could not load repositories. Check your GitHub sign-in and connection, then try again.',
				busy: 'false', rows: ['Try again'],
			},
			errors: [{ message: 'Error fetching repositories', error: failure }],
			attempts: 2, recoveredState: { errors: 0, rows: ['owner/recovered'] },
			selection: { repository: 'owner/recovered' },
		});
	});

	test('a cancelled request rejection dismisses rather than leaving a loading sheet', async () => {
		const { picker, container, errors } = createPicker();
		const result = picker.pickRepository(async () => { throw new CancellationError(); });
		await clock.tickAsync(180);
		assert.deepStrictEqual({ selection: await result, errors, open: !!container.querySelector('.mobile-picker-sheet') }, {
			selection: undefined, errors: [], open: false,
		});
	});

	test('a stale failed request cannot replace current results or report an error', async () => {
		const { picker, container, errors } = createPicker();
		const initial = new DeferredPromise<readonly string[]>();
		const result = picker.pickRepository(query => query ? Promise.resolve(['current/repository']) : initial.p);
		await clock.tickAsync(0);
		query(getInput(container), 'current');
		await clock.tickAsync(300);
		await initial.error(new Error('Stale failure'));
		await clock.tickAsync(0);
		const rows = getRows(container).map(row => row.textContent);
		getRows(container)[0].click();
		await clock.tickAsync(180);
		assert.deepStrictEqual({ rows, errors, selection: await result }, {
			rows: ['current/repository'], errors: [], selection: { repository: 'current/repository' },
		});
	});

	test('synchronous cancellation inside the loader disposes all sheet handlers', async () => {
		const { picker, container } = createPicker();
		const cancellation = store.add(new CancellationTokenSource());
		let loads = 0;
		let requestToken = CancellationToken.None;
		const result = picker.pickRepository((_query, token) => {
			loads++;
			requestToken = token;
			cancellation.cancel();
			return Promise.resolve([]);
		}, cancellation.token);
		const input = getInput(container);
		await clock.tickAsync(0);
		query(input, 'must not load');
		await clock.tickAsync(500);
		assert.deepStrictEqual({
			selection: await result, loads, cancelled: requestToken.isCancellationRequested,
			open: !!container.querySelector('.mobile-picker-sheet'),
		}, { selection: undefined, loads: 1, cancelled: true, open: false });
	});

	test('replacement keeps the new sheet focused and restores the original trigger', async () => {
		const { picker, container, trigger } = createPicker();
		const first = new DeferredPromise<readonly string[]>();
		let firstToken = CancellationToken.None;
		const firstPick = picker.pickRepository((_query, token) => { firstToken = token; return first.p; });
		await clock.tickAsync(0);
		const secondPick = picker.pickRepository(async () => ['owner/second']);
		await clock.tickAsync(180);
		const firstSelection = await firstPick;
		const secondFocused = dom.getActiveElement() === getInput(container);
		getRows(container)[0].click();
		await clock.tickAsync(180);
		await first.complete(['owner/first']);
		assert.deepStrictEqual({
			firstSelection, firstCancelled: firstToken.isCancellationRequested, secondFocused,
			secondSelection: await secondPick, focusRestored: dom.getActiveElement() === trigger,
		}, {
			firstSelection: undefined, firstCancelled: true, secondFocused: true,
			secondSelection: { repository: 'owner/second' }, focusRestored: true,
		});
	});

	test('Enter while composing search text does not accept a repository', async () => {
		const { picker, container } = createPicker();
		const result = picker.pickRepository(async () => ['owner/repository']);
		await clock.tickAsync(0);
		const input = getInput(container);
		input.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
		const remainedOpen = !!container.querySelector('.mobile-picker-sheet:not(.closing)');
		key(input, 'Enter');
		await clock.tickAsync(180);
		assert.deepStrictEqual({ remainedOpen, selection: await result }, { remainedOpen: true, selection: { repository: 'owner/repository' } });
	});
});
