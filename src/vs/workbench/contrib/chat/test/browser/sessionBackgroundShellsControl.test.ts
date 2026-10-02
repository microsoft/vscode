/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isHTMLElement } from '../../../../../base/browser/dom.js';
import type { IRenderedMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { timeout } from '../../../../../base/common/async.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import type { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IDetachedTerminalInstance, IDetachedXtermTerminal, ITerminalService } from '../../../terminal/browser/terminal.js';
import { SessionBackgroundShellsControl, type IChatBackgroundShellsSource } from '../../browser/sessionBackgroundShellsControl.js';
import type { ChatBackgroundShellOutput, IChatBackgroundShell } from '../../common/sessionChatPills.js';

suite('SessionBackgroundShellsControl', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
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
		const initialDetails = details.firstElementChild?.textContent;
		await timeout(2100);
		const elapsed = badge;
		const elapsedDetails = details.firstElementChild?.textContent;
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
			liveDetails: details.firstElementChild?.textContent?.startsWith('Detached, '),
			sameDetails: updated.hover?.content === details,
			expandable: updated.hover?.expandable,
			aboveInput: updated.hover?.alignToParentBottom,
			empty: control.sections.get(),
		}, {
			entry: { id: 'silent', label: 'Run tests', detached: false },
			updated: true,
			plainCommand: true,
			noMarkup: true,
			liveDetails: true,
			sameDetails: true,
			expandable: true,
			aboveInput: true,
			empty: [],
		});
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

	test('presents the command above a terminal that streams its output while details are shown', async () => {
		const writes: string[] = [];
		const sizes: string[] = [];
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override async createDetachedTerminal(): Promise<IDetachedTerminalInstance> {
				return new class extends mock<IDetachedTerminalInstance>() {
					override readonly xterm = new class extends mock<IDetachedXtermTerminal>() {
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
		const commandLineHidden = Array.from(details.children).some(child => isHTMLElement(child) && child.hidden && child.textContent === 'Command: stream.sh');
		hover?.disposable?.dispose();

		assert.deepStrictEqual({ loading, running, exited, command, commandLineHidden, writes, sizes, reused, released: details.querySelector('.chat-background-shell-output') === null }, {
			loading: { status: 'Running', empty: 'Waiting for output...' },
			running: 'Running',
			exited: 'Exited with code 0',
			command: true,
			commandLineHidden: true,
			writes: ['\x1b[?25l', 'step 1', '\r\nstep 2', '\x1b[2J\x1b[3J\x1b[Hstep 2'],
			sizes: ['80x1', '80x2', '80x1'],
			reused: true,
			released: true,
		});
	});
});
