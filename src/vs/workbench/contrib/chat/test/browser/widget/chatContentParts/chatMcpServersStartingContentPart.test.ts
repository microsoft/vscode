/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatMcpServersStartingContentPart } from '../../../../browser/widget/chatContentParts/chatMcpServersStartingContentPart.js';
import { IChatMcpServersStartingSlow, IChatMcpStartingServer } from '../../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../../common/model/chatViewModel.js';

suite('ChatMcpServersStartingContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, disposables);
	});

	function createPart(servers: readonly IChatMcpStartingServer[], showSpinner = true, onDidRemoveFocusedAction?: () => void) {
		const servers$ = observableValue<readonly IChatMcpStartingServer[]>('servers', servers);
		const data: IChatMcpServersStartingSlow = {
			kind: 'mcpServersStartingSlow',
			sessionResource: URI.parse('chat-session://test/session1'),
			servers: servers$,
		};
		let disposedSpinners = 0;
		const createSpinner = (parent?: HTMLElement) => {
			const spinner = document.createElement('span');
			spinner.classList.add('monaco-pixel-spinner');
			parent?.appendChild(spinner);
			return { element: spinner, dispose: () => disposedSpinners++ };
		};
		let finishedCount = 0;
		const part = disposables.add(instantiationService.createInstance(ChatMcpServersStartingContentPart, data, {
			createSpinner,
			showSpinner,
			onDidFinishStarting: () => finishedCount++,
			onDidRemoveFocusedAction,
		}));
		return { part, servers$, getFinishedCount: () => finishedCount, getDisposedSpinners: () => disposedSpinners };
	}

	function attach(element: HTMLElement): void {
		document.body.appendChild(element);
		disposables.add(toDisposable(() => element.remove()));
	}

	test('preserves Skip focus when remaining servers still block startup', () => {
		const server = { id: 'a', name: 'alpha', blocking: true, background: async () => { } };
		const { part, servers$ } = createPart([server, { ...server, id: 'b', name: 'beta' }]);
		attach(part.domNode);
		const link = part.domNode.querySelector<HTMLAnchorElement>('a[data-href="#skip"]');
		assert.ok(link);
		link.focus();

		servers$.set([server], undefined);

		assert.strictEqual(document.activeElement, part.domNode.querySelector('a[data-href="#skip"]'));
	});

	for (const allFinished of [false, true]) {
		test(`returns focus to the input when ${allFinished ? 'all servers finish' : 'startup is no longer blocking'}`, () => {
			const input = document.createElement('input');
			attach(input);
			let fallbackCount = 0;
			const server = { id: 'a', name: 'alpha', blocking: true, background: async () => { } };
			const { part, servers$ } = createPart([server], true, () => {
				fallbackCount++;
				input.focus();
			});
			attach(part.domNode);
			const link = part.domNode.querySelector<HTMLAnchorElement>('a[data-href="#skip"]');
			assert.ok(link);
			link.focus();

			servers$.set(allFinished ? [] : [{ ...server, blocking: false }], undefined);

			assert.deepStrictEqual({ inputFocused: document.activeElement === input, fallbackCount }, { inputFocused: true, fallbackCount: 1 });
		});
	}

	test('does not move focus from outside the part when servers change or finish', () => {
		const input = document.createElement('input');
		attach(input);
		let fallbackCount = 0;
		const server = { id: 'a', name: 'alpha', blocking: true, background: async () => { } };
		const { part, servers$ } = createPart([server], true, () => fallbackCount++);
		attach(part.domNode);
		input.focus();

		servers$.set([{ ...server, name: 'beta' }], undefined);
		servers$.set([], undefined);

		assert.deepStrictEqual({ inputFocused: document.activeElement === input, fallbackCount }, { inputFocused: true, fallbackCount: 0 });
	});

	test('reflects the starting servers and hides when empty as the observable updates', () => {
		const { part, servers$, getFinishedCount, getDisposedSpinners } = createPart([{ id: 'a', name: 'alpha' }, { id: 'b', name: 'beta' }]);

		const snapshot = () => ({
			hidden: part.domNode.style.display === 'none',
			text: part.domNode.textContent ?? '',
			hasPixelSpinner: !!part.domNode.querySelector('.monaco-pixel-spinner'),
			disposedSpinners: getDisposedSpinners(),
			finishedCount: getFinishedCount(),
		});

		const initial = snapshot();

		servers$.set([{ id: 'a', name: 'alpha' }], undefined);
		const afterOneFinished = snapshot();

		servers$.set([], undefined);
		const afterAllFinished = snapshot();

		assert.deepStrictEqual({ initial, afterOneFinished, afterAllFinished }, {
			initial: { hidden: false, text: 'Starting MCP servers alpha, beta...', hasPixelSpinner: true, disposedSpinners: 0, finishedCount: 0 },
			afterOneFinished: { hidden: false, text: 'Starting MCP servers alpha...', hasPixelSpinner: true, disposedSpinners: 1, finishedCount: 0 },
			afterAllFinished: { hidden: true, text: '', hasPixelSpinner: false, disposedSpinners: 2, finishedCount: 1 },
		});
	});

	test('preserves server status without creating a competing spinner', () => {
		const { part, servers$, getFinishedCount, getDisposedSpinners } = createPart([{ id: 'a', name: 'alpha' }], false);
		const initial = {
			text: part.domNode.textContent,
			hasPixelSpinner: !!part.domNode.querySelector('.monaco-pixel-spinner'),
			hasSkipLink: !!part.domNode.querySelector('a[data-href="#skip"]'),
		};
		servers$.set([{ id: 'b', name: 'beta' }], undefined);
		const updatedText = part.domNode.textContent;
		servers$.set([], undefined);
		assert.deepStrictEqual({
			initial,
			updatedText,
			hidden: part.domNode.style.display === 'none',
			disposedSpinners: getDisposedSpinners(),
			finishedCount: getFinishedCount(),
		}, {
			initial: { text: 'Starting MCP servers alpha...', hasPixelSpinner: false, hasSkipLink: false },
			updatedText: 'Starting MCP servers beta...',
			hidden: true,
			disposedSpinners: 0,
			finishedCount: 1,
		});
	});

	test('reflects a blocking server becoming nonblocking', () => {
		const { part, servers$ } = createPart([{
			id: 'a',
			name: 'alpha',
			blocking: true,
			background: async () => { },
		}]);

		const initial = {
			text: part.domNode.textContent,
			hasSkipLink: !!part.domNode.querySelector('a[data-href="#skip"]'),
		};
		servers$.set([{ id: 'a', name: 'alpha', blocking: false }], undefined);

		assert.deepStrictEqual({
			initial,
			updated: {
				text: part.domNode.textContent,
				hasSkipLink: !!part.domNode.querySelector('a[data-href="#skip"]'),
			},
		}, {
			initial: { text: 'Waiting for MCP servers alpha... Skip', hasSkipLink: true },
			updated: { text: 'Starting MCP servers alpha...', hasSkipLink: false },
		});
	});

	test('offers to continue all blocking server startups in the background', async () => {
		const requests: string[] = [];
		const { part } = createPart([
			{
				id: 'a',
				name: 'alpha',
				blocking: true,
				background: async () => {
					requests.push('alpha');
				},
			},
			{
				id: 'b',
				name: 'beta',
				blocking: true,
				background: async () => {
					requests.push('beta');
				},
			},
			{
				id: 'c',
				name: 'gamma',
				blocking: false,
				background: async () => {
					requests.push('gamma');
				},
			},
		]);

		const link = part.domNode.querySelector<HTMLAnchorElement>('a[data-href="#skip"]');
		link?.click();
		await timeout(0);

		assert.deepStrictEqual({
			text: part.domNode.textContent,
			requests,
		}, {
			text: 'Waiting for MCP servers alpha, beta... Skip',
			requests: ['alpha', 'beta'],
		});
	});

	test('reports background failures and keeps the action retryable', async () => {
		const reported: unknown[] = [];
		const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => reported.push(error));
		try {
			let requests = 0;
			const { part } = createPart([{
				id: 'a',
				name: 'alpha',
				blocking: true,
				background: async () => {
					requests++;
					throw new Error('background failed');
				},
			}]);

			const link = part.domNode.querySelector<HTMLAnchorElement>('a[data-href="#skip"]');
			link?.click();
			await timeout(0);
			link?.click();
			await timeout(0);

			assert.deepStrictEqual({
				requests,
				reported: reported.map(error => (error as Error).message),
			}, {
				requests: 2,
				reported: ['background failed', 'background failed'],
			});
		} finally {
			setUnexpectedErrorHandler(originalErrorHandler);
		}
	});

	test('supports keyboard activation without duplicate requests while skipping', async () => {
		const accepted = new DeferredPromise<void>();
		let requests = 0;
		const { part } = createPart([{
			id: 'a',
			name: 'alpha',
			blocking: true,
			background: async () => {
				requests++;
				await accepted.p;
			},
		}]);
		const link = part.domNode.querySelector<HTMLAnchorElement>('a[data-href="#skip"]');
		link?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		link?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		await timeout(0);
		await accepted.complete();

		assert.deepStrictEqual({ requests, tabIndex: link?.tabIndex, text: link?.textContent }, { requests: 1, tabIndex: 0, text: 'Skip' });
	});

	test('shows blocked loading without an unavailable background action', () => {
		const { part } = createPart([{ id: 'a', name: 'alpha', blocking: true }]);

		assert.deepStrictEqual({
			text: part.domNode.textContent,
			hasSkipLink: !!part.domNode.querySelector('a[data-href="#skip"]'),
		}, {
			text: 'Waiting for MCP servers alpha...',
			hasSkipLink: false,
		});
	});

	test('disposes controls from the previous render', async () => {
		let staleRequests = 0;
		let currentRequests = 0;
		const { part, servers$ } = createPart([{
			id: 'a',
			name: 'alpha',
			blocking: true,
			background: async () => {
				staleRequests++;
			},
		}]);

		const staleLink = part.domNode.querySelector<HTMLAnchorElement>('a[data-href="#skip"]');
		servers$.set([{
			id: 'b',
			name: 'beta',
			blocking: true,
			background: async () => {
				currentRequests++;
			},
		}], undefined);
		staleLink?.click();
		part.domNode.querySelector<HTMLAnchorElement>('a[data-href="#skip"]')?.click();
		await timeout(0);

		assert.deepStrictEqual({ staleRequests, currentRequests }, { staleRequests: 0, currentRequests: 1 });
	});

	test('hasSameContent matches only the same kind', () => {
		const { part } = createPart([{ id: 'a', name: 'alpha' }]);

		assert.deepStrictEqual(
			[
				part.hasSameContent({ kind: 'mcpServersStartingSlow' } as IChatRendererContent, [], null!),
				part.hasSameContent({ kind: 'mcpAuthenticationRequired' } as IChatRendererContent, [], null!),
			],
			[true, false],
		);
	});
});
