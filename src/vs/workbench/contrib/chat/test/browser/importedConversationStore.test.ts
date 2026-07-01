/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { ImportedConversationStore } from '../../browser/importedConversationStore.js';
import { IImportedConversationTurn } from '../../common/importedConversation.js';

suite('ImportedConversationStore', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const root = URI.file('tests').with({ scheme: 'vscode-tests' });
	const globalStorageHome = joinPath(root, 'globalStorage');

	function createStore(): ImportedConversationStore {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(root.scheme, disposables.add(new InMemoryFileSystemProvider())));
		const userDataProfileService: IUserDataProfileService = {
			_serviceBrand: undefined,
			currentProfile: { globalStorageHome } as IUserDataProfile,
		} as IUserDataProfileService;
		return disposables.add(new ImportedConversationStore(fileService, userDataProfileService, new NullLogService()));
	}

	const turns: IImportedConversationTurn[] = [
		{ prompt: 'first question', response: 'first answer' },
		{ prompt: 'second question', response: '' },
	];

	test('round-trips a stored snapshot and clears it on empty/delete', async () => {
		const store = createStore();
		const a = URI.from({ scheme: 'agent-host-copilot', path: '/a' });
		const b = URI.from({ scheme: 'agent-host-copilot', path: '/b' });

		await store.store(a, turns);
		await store.store(b, turns);
		// Renames the untitled snapshot onto the real resource.
		const c = URI.from({ scheme: 'agent-host-copilot', path: '/c' });
		await store.rename(b, c);
		// Clearing with an empty array removes the snapshot.
		await store.store(a, []);
		// Explicit delete removes the snapshot.
		await store.delete(c);

		assert.deepStrictEqual({
			a: await store.read(a),
			b: await store.read(b),
			c: await store.read(c),
			missing: await store.read(URI.from({ scheme: 'agent-host-copilot', path: '/missing' })),
		}, {
			a: undefined,
			b: undefined,
			c: undefined,
			missing: undefined,
		});
	});

	test('reads back the exact turns that were stored', async () => {
		const store = createStore();
		const resource = URI.from({ scheme: 'agent-host-copilot', path: '/session' });

		await store.store(resource, turns);

		assert.deepStrictEqual(await store.read(resource), turns);
	});
});
