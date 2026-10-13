/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isHTMLElement } from '../../../../../base/browser/dom.js';
import type { IRenderedMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { Action } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import type { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import type { IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { AGENT_HOST_TERMINAL_MAX_CONTENT_LENGTH } from '../../../../../platform/agentHost/common/terminalConstants.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService, type NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { ChatDropdownPillActionViewItem } from '../../../../browser/chatDropdownPill.js';
import { IDetachedTerminalInstance, IDetachedXtermTerminal, IDetachedXTermOptions, ITerminalService } from '../../../terminal/browser/terminal.js';
import { SessionBackgroundShellsControl, type IChatBackgroundShellsSource } from '../../browser/sessionBackgroundShellsControl.js';
import { sessionBackgroundShellsPillOptions } from '../../browser/sessionChatPillOptions.js';
import type { ChatBackgroundShellOutput, IChatBackgroundShell } from '../../common/sessionChatPills.js';

suite('SessionBackgroundShellsControl', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(INotificationService, new TestNotificationService());
	});

	test('updates elapsed time while observed and stops when the list becomes empty', () => runWithFakedTimers({}, async () => {
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [{
			id: 'running', description: 'Run tests', command: 'npm test',
			startedAt: new Date(0).toISOString(), attachmentMode: 'attached',
		}]);
		const control = store.add(instantiationService.createInstance(SessionBackgroundShellsControl, constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));
		let badge: string | undefined;
		const observer = store.add(autorun(reader => {
			badge = control.sections.read(reader)[0]?.entries[0].badge;
		}));
		const initial = badge;
		const details = control.sections.get()[0].entries[0].hover?.content;
		assert.ok(isHTMLElement(details));
		const initialDetails = details.children[1]?.textContent;
		await timeout(2100);
		const elapsed = badge;
		const elapsedDetails = details.children[1]?.textContent;
		const sameDetails = control.sections.get()[0].entries[0].hover?.content === details;
		shells.set([], undefined);
		await timeout(2000);
		observer.dispose();

		assert.deepStrictEqual({ initial, elapsed, initialDetails, elapsedDetails, sameDetails, empty: badge }, {
			initial: '0ms',
			elapsed: '2s',
			initialDetails: '0ms',
			elapsedDetails: '2s',
			sameDetails: true,
			empty: undefined,
		});
	}));

	test('updates shell rows independently of turns and exposes the full command as plain text', () => {
		const shell: IChatBackgroundShell = {
			id: 'silent', description: 'Run tests', command: 'npm test -- --grep "<script>"',
			startedAt: new Date(0).toISOString(), attachmentMode: 'attached',
		};
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [shell]);
		const control = store.add(instantiationService.createInstance(SessionBackgroundShellsControl, constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));
		const entry = control.sections.get()[0].entries[0];
		const details = entry.hover?.content;
		assert.ok(isHTMLElement(details));
		shells.set([{ ...shell, attachmentMode: 'detached' }], undefined);
		const updated = control.sections.get()[0].entries[0];
		shells.set([], undefined);

		assert.deepStrictEqual({
			entry: { id: entry.id, label: entry.label, detached: entry.badge?.startsWith('Detached, ') },
			updated: updated.badge?.startsWith('Detached, '),
			plainCommand: details.textContent?.includes(shell.command),
			noMarkup: details.querySelector('script') === null,
			title: details.firstElementChild?.textContent,
			liveDetails: details.children[1]?.textContent?.startsWith('Detached, '),
			sameDetails: updated.hover?.content === details,
			expandable: updated.hover?.expandable,
			aboveInput: updated.hover?.alignToParentBottom,
			empty: control.sections.get(),
		}, {
			entry: { id: 'silent', label: 'Run tests', detached: false },
			updated: true,
			plainCommand: true,
			noMarkup: true,
			title: 'Run tests',
			liveDetails: true,
			sameDetails: true,
			expandable: true,
			aboveInput: true,
			empty: [],
		});
	});

	test('titles the details with the full description unless it only repeats the command', () => {
		const startedAt = new Date(0).toISOString();
		const description = 'Stop the non-exiting isolated test process and start it again with a fresh profile';
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [
			{ id: 'described', description: `  ${description} `, command: 'kill -KILL 41810; ./scripts/code.sh', startedAt },
			{ id: 'unlabeled', description: ' ', command: 'npm test', startedAt },
			{ id: 'repeated', description: 'npm run build', command: 'npm run build', startedAt },
		]);
		const control = store.add(instantiationService.createInstance(SessionBackgroundShellsControl, constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));

		assert.deepStrictEqual(control.sections.get()[0].entries.map(entry => {
			const details = entry.hover?.content;
			const title = isHTMLElement(details) ? details.querySelector<HTMLElement>('.chat-background-shell-title') : null;
			return { label: entry.label, title: title?.hidden ? undefined : title?.textContent, first: isHTMLElement(details) && details.firstElementChild === title };
		}), [
			{ label: description, title: description, first: true },
			{ label: 'npm test', title: undefined, first: true },
			{ label: 'npm run build', title: undefined, first: true },
		]);
	});

	test('labels only detached shells, treating an unlabeled shell as attached', () => runWithFakedTimers({}, async () => {
		const startedAt = new Date(0).toISOString();
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [
			{ id: 'attached', description: 'Watch', command: 'npm run watch', startedAt, attachmentMode: 'attached' },
			{ id: 'detached', description: 'Serve', command: 'npm start', startedAt, attachmentMode: 'detached' },
			{ id: 'unknown', description: 'Build', command: 'npm run build', startedAt },
		]);
		const control = store.add(instantiationService.createInstance(SessionBackgroundShellsControl, constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));

		assert.deepStrictEqual(control.sections.get()[0].entries.map(entry => entry.badge), ['0ms', 'Detached, 0ms', '0ms']);
	}));

	test('keys rows by entry id and shows the shell ID only when the agent reports one', () => {
		const startedAt = new Date(0).toISOString();
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [
			{ id: 'shell:3', shellId: '3', description: 'Run tests', command: 'npm test', startedAt },
			{ id: 'build', description: 'Build', command: 'npm run build', startedAt },
		]);
		const control = store.add(instantiationService.createInstance(SessionBackgroundShellsControl, constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));

		assert.deepStrictEqual(control.sections.get()[0].entries.map(entry => {
			const details = entry.hover?.content;
			return {
				id: entry.id,
				described: entry.ariaDescription?.split('\n').filter(line => line.startsWith('Shell ID')),
				shown: isHTMLElement(details) ? details.textContent?.includes('Shell ID') : undefined,
			};
		}), [
			{ id: 'shell:3', described: ['Shell ID: 3'], shown: true },
			{ id: 'build', described: [], shown: false },
		]);
	});

	test('does not show shells from a previously viewed chat or an unsupported provider', () => {
		const createChat = (command: string): IChatBackgroundShellsSource => ({
			backgroundShells: constObservable<readonly IChatBackgroundShell[]>([{
				id: 'shared-id', description: command, command,
				startedAt: new Date(0).toISOString(), attachmentMode: 'attached',
			}]),
		});
		const current = observableValue<IChatBackgroundShellsSource | undefined>('chat', createChat('npm test'));
		const control = store.add(instantiationService.createInstance(SessionBackgroundShellsControl, current));
		const first = control.sections.get()[0].entries.map(entry => entry.label);
		current.set(createChat('npm run build'), undefined);
		const second = control.sections.get()[0].entries.map(entry => entry.label);
		current.set(undefined, undefined);

		assert.deepStrictEqual({ first, second, empty: control.sections.get() }, {
			first: ['npm test'], second: ['npm run build'], empty: [],
		});
	});

	test('shows the description and command above a fixed-height terminal that streams its output while details are shown', async () => {
		const writes: string[] = [];
		const sizes: string[] = [];
		const rawXterm = { options: {} as { reflowCursorLine?: boolean } };
		let scrollback: number | undefined;
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override async createDetachedTerminal(options: IDetachedXTermOptions): Promise<IDetachedTerminalInstance> {
				scrollback = options.scrollback;
				return new class extends mock<IDetachedTerminalInstance>() {
					override readonly xterm = new class extends mock<IDetachedXtermTerminal>() {
						readonly raw = rawXterm;
						override write(data: string | Uint8Array): void { writes.push(String(data)); }
						override resize(cols: number, rows: number): void { sizes.push(`${cols}x${rows}`); }
					}();
					override attachToElement(): void { }
					override dispose(): void { }
				}();
			}
		}());
		instantiationService.stub(IMarkdownRendererService, new class extends mock<IMarkdownRendererService>() {
			override render(markdown: IMarkdownString): IRenderedMarkdown {
				const element = document.createElement('div');
				element.textContent = markdown.value;
				return { element, dispose: () => { } };
			}
		}());
		instantiationService.stub(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
			override getOpenAriaHint(): string | null { return null; }
		}());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		const output = observableValue<ChatBackgroundShellOutput>('output', { status: 'loading' });
		const shells = constObservable<readonly IChatBackgroundShell[]>([{
			id: 'stream', description: 'Stream', command: 'stream.sh', startedAt: new Date(0).toISOString(), output,
		}]);
		const control = store.add(instantiationService.createInstance(SessionBackgroundShellsControl, constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));
		const hover = control.sections.get()[0].entries[0].hover;
		const content = hover?.content;
		assert.ok(typeof content === 'function');
		const details = content();
		const status = () => details.querySelector('.chat-terminal-command-decoration')?.getAttribute('aria-label');
		const loading = { status: status(), empty: details.querySelector('.chat-terminal-output-empty')?.textContent };
		await timeout(0);
		output.set({ status: 'running', text: 'step 1\n' }, undefined);
		output.set({ status: 'running', text: 'step 1\nstep 2\n' }, undefined);
		const running = status();
		// Trimmed or rewritten output is replayed rather than appended.
		output.set({ status: 'running', text: 'step 2\n' }, undefined);
		output.set({ status: 'exited', text: 'step 2\n', exitCode: 0 }, undefined);
		const exited = status();
		const reused = content() === details && details.querySelectorAll('.chat-background-shell-output').length === 1;
		const command = details.querySelector('.chat-terminal-command-block')?.textContent?.includes('stream.sh');
		// The badge, shell ID, and start time stay in the row's description, not the details.
		const shown = Array.from(details.children).filter(child => !(isHTMLElement(child) && child.hidden)).map(child => child.className);
		hover?.disposable?.dispose();

		assert.deepStrictEqual({ loading, running, exited, command, shown, writes, sizes, scrollback, reflowCursorLine: rawXterm.options.reflowCursorLine, reused, released: details.querySelector('.chat-background-shell-output') === null }, {
			loading: { status: 'Running', empty: 'Waiting for output...' },
			running: 'Running',
			exited: 'Exited with code 0',
			command: true,
			shown: ['chat-background-shell-title', 'chat-terminal-content-part chat-background-shell-output'],
			writes: ['\x1b[?25l', 'step 1', '\r\nstep 2', '\x1b[2J\x1b[3J\x1b[Hstep 2'],
			sizes: ['80x10'],
			scrollback: AGENT_HOST_TERMINAL_MAX_CONTENT_LENGTH,
			reflowCursorLine: true,
			reused: true,
			released: true,
		});
	});

	test('keeps the live output shown while the picker refreshes elapsed time', () => runWithFakedTimers({}, async () => {
		let terminals = 0;
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override createDetachedTerminal(): Promise<IDetachedTerminalInstance> {
				terminals++;
				return new Promise(() => { });
			}
		}());
		instantiationService.stub(IMarkdownRendererService, new class extends mock<IMarkdownRendererService>() {
			override render(): IRenderedMarkdown { return { element: document.createElement('div'), dispose: () => { } }; }
		}());
		instantiationService.stub(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
			override getOpenAriaHint(): string | null { return null; }
		}());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		let rows: readonly IActionListItem<unknown>[] = [];
		instantiationService.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() {
			override get isVisible(): boolean { return false; }
			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[]): void { rows = items; }
			override updateItems<T>(items: readonly IActionListItem<T>[]): void { rows = items; }
			override hide(): void { }
		}());
		instantiationService.stub(ILanguageService, {});
		instantiationService.stub(IModelService, {});
		instantiationService.stub(IFileService, {});
		const shells = constObservable<readonly IChatBackgroundShell[]>([{
			id: 'stream', description: 'Stream', command: 'stream.sh', startedAt: new Date(0).toISOString(),
			output: constObservable<ChatBackgroundShellOutput>({ status: 'running', text: 'step 1\n' }),
		}]);
		const control = store.add(instantiationService.createInstance(SessionBackgroundShellsControl, constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));
		const pill = store.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, store.add(new Action('shells', 'Background Shells')), {}, control.sections, sessionBackgroundShellsPillOptions));
		const container = document.createElement('div');
		pill.render(container);
		container.querySelector<HTMLElement>('.chat-pill-button')!.click();
		// The picker asks the open row for its details again each time the list updates.
		const showDetails = () => {
			const content = rows[1].hover?.content;
			return typeof content === 'function' ? content().querySelector('.chat-background-shell-output') : null;
		};
		const view = showDetails();
		const opened = { badge: rows[1].badge, shown: !!view };
		await timeout(2100);
		const refreshed = { badge: rows[1].badge, sameView: showDetails() === view };
		pill.dispose();

		assert.deepStrictEqual({ opened, refreshed, terminals }, {
			opened: { badge: '0ms', shown: true },
			refreshed: { badge: '2s', sameView: true },
			terminals: 1,
		});
	}));

	test('shows Stop beside the command only for shells that can be stopped', () => {
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override createDetachedTerminal(): Promise<IDetachedTerminalInstance> { return new Promise(() => { }); }
		}());
		instantiationService.stub(IMarkdownRendererService, new class extends mock<IMarkdownRendererService>() {
			override render(): IRenderedMarkdown { return { element: document.createElement('div'), dispose: () => { } }; }
		}());
		instantiationService.stub(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
			override getOpenAriaHint(): string | null { return null; }
		}());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		const startedAt = new Date(0).toISOString();
		const stop = async () => true;
		const output = constObservable<ChatBackgroundShellOutput>({ status: 'running', text: '' });
		const shells = constObservable<readonly IChatBackgroundShell[]>([
			{ id: 'silent', description: 'Watch', command: 'npm run watch', startedAt, stop },
			{ id: 'streaming', description: 'Serve', command: 'npm start', startedAt, output, stop },
			{ id: 'unstoppable', description: 'Build', command: 'npm run build', startedAt },
		]);
		const control = store.add(instantiationService.createInstance(SessionBackgroundShellsControl, constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));

		// Without live output the button follows the command line; with it, the output's title holds it.
		assert.deepStrictEqual(control.sections.get()[0].entries.map(entry => {
			const content = entry.hover?.content;
			const details = typeof content === 'function' ? content() : content;
			assert.ok(isHTMLElement(details));
			const beside = typeof content === 'function' ? '.chat-terminal-content-title' : '.chat-background-shell-command';
			return Array.from(details.querySelectorAll(`${beside} .action-label`), label => label.getAttribute('aria-label'));
		}), [['Stop Shell'], ['Stop Shell'], []]);
	});

	test('stops a shell once at a time and offers Stop again when stopping fails', async () => {
		const errors: string[] = [];
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(message: NotificationMessage | NotificationMessage[]): void { errors.push(String(message)); }
		}());
		const attempts: DeferredPromise<boolean>[] = [];
		const shells = constObservable<readonly IChatBackgroundShell[]>([{
			id: 'watch', description: 'Watch', command: 'npm run watch', startedAt: new Date(0).toISOString(),
			stop: () => {
				const attempt = new DeferredPromise<boolean>();
				attempts.push(attempt);
				return attempt.p;
			},
		}]);
		const control = store.add(instantiationService.createInstance(SessionBackgroundShellsControl, constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));
		const details = control.sections.get()[0].entries[0].hover?.content;
		assert.ok(isHTMLElement(details));
		const stop = details.querySelector<HTMLElement>('.chat-background-shell-command .action-label');
		assert.ok(stop);

		stop.click();
		stop.click();
		const whileStopping = { attempts: attempts.length, disabled: stop.classList.contains('disabled') };
		attempts[0].error(new Error('runtime unavailable'));
		await timeout(0);
		const afterFailure = { disabled: stop.classList.contains('disabled'), errors: [...errors] };
		stop.click();
		attempts[1]?.complete(true);
		await timeout(0);

		assert.deepStrictEqual({ whileStopping, afterFailure, attempts: attempts.length, afterStop: stop.classList.contains('disabled') }, {
			whileStopping: { attempts: 1, disabled: true },
			afterFailure: { disabled: false, errors: ['Could not stop Watch: runtime unavailable'] },
			attempts: 2,
			afterStop: true,
		});
	});
});
