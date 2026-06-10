/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { AgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';

suite('AgentHostNewSessionFolderService', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let service: AgentHostNewSessionFolderService;
	let cleanup: DisposableStore;
	let onDidDisposeSession: Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' }>;

	setup(() => {
		onDidDisposeSession = ds.add(new Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' }>());
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidDisposeSession = onDidDisposeSession.event;
		};
		service = ds.add(new AgentHostNewSessionFolderService(chatService));
		cleanup = ds.add(new DisposableStore());
	});

	const sessionA = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-a' });
	const folderA = URI.file('/repoA');
	const folderB = URI.file('/repoB');

	test('set/get/clear round-trips and fires onDidChange on real changes only', () => {
		const changes: string[] = [];
		cleanup.add(service.onDidChangeFolder(uri => changes.push(uri.toString())));

		assert.strictEqual(service.getFolder(sessionA), undefined, 'unknown resource is undefined');

		service.setFolder(sessionA, folderA);
		service.setFolder(sessionA, folderA); // same value: no event
		service.setFolder(sessionA, folderB);
		const afterSet = service.getFolder(sessionA)?.toString();

		service.clear(sessionA);
		const afterClear = service.getFolder(sessionA);
		service.clear(sessionA); // already cleared: no event

		assert.deepStrictEqual({
			afterSet,
			afterClear,
			changes,
		}, {
			afterSet: folderB.toString(),
			afterClear: undefined,
			changes: [sessionA.toString(), sessionA.toString(), sessionA.toString()],
		});
	});

	test('clears the chosen folder when its session is disposed', () => {
		const changes: string[] = [];
		cleanup.add(service.onDidChangeFolder(uri => changes.push(uri.toString())));

		service.setFolder(sessionA, folderA);
		onDidDisposeSession.fire({ sessionResources: [sessionA], reason: 'cleared' });

		assert.deepStrictEqual({
			afterDispose: service.getFolder(sessionA),
			changes,
		}, {
			afterDispose: undefined,
			changes: [sessionA.toString(), sessionA.toString()],
		});
	});
});
