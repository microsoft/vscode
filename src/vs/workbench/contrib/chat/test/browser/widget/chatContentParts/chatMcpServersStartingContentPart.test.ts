/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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

	function createPart(servers: readonly IChatMcpStartingServer[], showSpinner = true, serversNeedingMigration: readonly IChatMcpStartingServer[] = []) {
		const servers$ = observableValue<readonly IChatMcpStartingServer[]>('servers', servers);
		const serversNeedingMigration$ = observableValue<readonly IChatMcpStartingServer[]>('serversNeedingMigration', serversNeedingMigration);
		const data: IChatMcpServersStartingSlow = {
			kind: 'mcpServersStartingSlow',
			sessionResource: URI.parse('chat-session://test/session1'),
			servers: servers$,
			serversNeedingMigration: serversNeedingMigration$,
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
		}));
		return { part, servers$, serversNeedingMigration$, getFinishedCount: () => finishedCount, getDisposedSpinners: () => disposedSpinners };
	}

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
			initial: { text: 'Starting MCP servers alpha...', hasPixelSpinner: false },
			updatedText: 'Starting MCP servers beta...',
			hidden: true,
			disposedSpinners: 0,
			finishedCount: 1,
		});
	});

	test('shows servers needing migration with a review link', () => {
		const { part, servers$ } = createPart(
			[{ id: 'a', name: 'alpha' }, { id: 'b', name: 'beta' }],
			true,
			[{ id: 'a', name: 'alpha' }],
		);
		part.domNode.ownerDocument.body.appendChild(part.domNode);
		disposables.add(toDisposable(() => part.domNode.remove()));
		const initialReviewLink = part.domNode.querySelector<HTMLAnchorElement>('a');
		initialReviewLink?.focus();
		const initial = {
			text: part.domNode.textContent,
			reviewLink: initialReviewLink?.getAttribute('data-href'),
		};

		servers$.set([{ id: 'a', name: 'alpha' }], undefined);
		const updatedReviewLink = part.domNode.querySelector<HTMLAnchorElement>('a');

		assert.deepStrictEqual({
			initial,
			updatedText: part.domNode.textContent,
			reviewLinkFocused: updatedReviewLink?.ownerDocument.activeElement === updatedReviewLink,
		}, {
			initial: {
				text: 'Starting MCP servers alpha, beta... Some servers need migration. Review migrations',
				reviewLink: 'command:aiCustomization.openManagementEditor?%255B%257B%2522migration%2522%253Atrue%252C%2522migrationCategory%2522%253A%2522mcpServers%2522%257D%255D',
			},
			updatedText: 'Starting MCP servers alpha... Some servers need migration. Review migrations',
			reviewLinkFocused: true,
		});
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
