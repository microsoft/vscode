/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
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

	function createPart(servers: readonly IChatMcpStartingServer[]) {
		const servers$ = observableValue<readonly IChatMcpStartingServer[]>('servers', servers);
		const data: IChatMcpServersStartingSlow = {
			kind: 'mcpServersStartingSlow',
			sessionResource: URI.parse('chat-session://test/session1'),
			servers: servers$,
		};
		const part = disposables.add(instantiationService.createInstance(ChatMcpServersStartingContentPart, data));
		return { part, servers$ };
	}

	test('reflects the starting servers and hides when empty as the observable updates', () => {
		const { part, servers$ } = createPart([{ id: 'a', name: 'alpha' }, { id: 'b', name: 'beta' }]);

		const snapshot = () => ({ hidden: part.domNode.style.display === 'none', text: part.domNode.textContent ?? '' });

		const initial = snapshot();

		servers$.set([{ id: 'a', name: 'alpha' }], undefined);
		const afterOneFinished = snapshot();

		servers$.set([], undefined);
		const afterAllFinished = snapshot();

		assert.deepStrictEqual({ initial, afterOneFinished, afterAllFinished }, {
			initial: { hidden: false, text: 'Starting MCP servers alpha, beta...' },
			afterOneFinished: { hidden: false, text: 'Starting MCP servers alpha...' },
			afterAllFinished: { hidden: true, text: '' },
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
