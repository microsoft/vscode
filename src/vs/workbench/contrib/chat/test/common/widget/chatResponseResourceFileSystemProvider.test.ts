/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileSystemProviderErrorCode, IFileService } from '../../../../../../platform/files/common/files.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatResponseResource } from '../../../common/model/chatModel.js';
import { ChatResponseResourceFileSystemProvider } from '../../../common/widget/chatResponseResourceFileSystemProvider.js';

suite('ChatResponseResourceFileSystemProvider', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('vscode-chat-session://test/session');

	let onDidDisposeSession: Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' }>;
	let provider: ChatResponseResourceFileSystemProvider;

	setup(() => {
		onDidDisposeSession = testDisposables.add(new Emitter());
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidDisposeSession = onDidDisposeSession.event;
		};
		provider = testDisposables.add(new ChatResponseResourceFileSystemProvider(
			chatService,
			new class extends mock<IFileService>() { },
		));
	});

	/** Reads the associated data, or `undefined` once it has been released. */
	async function read(resource: URI): Promise<string | undefined> {
		try {
			return new TextDecoder().decode(await provider.readFile(resource));
		} catch {
			return undefined;
		}
	}

	test('a stable id shares data until every association is disposed', async () => {
		const first = provider.associate(VSBuffer.fromString('artifact').buffer, { id: 'paste-1' });
		const second = provider.associate(VSBuffer.fromString('artifact').buffer, { id: 'paste-1' });

		first.dispose();
		first.dispose();
		const afterFirstDisposed = await read(second.resource);

		second.dispose();
		const afterSecondDisposed = await read(second.resource);

		assert.deepStrictEqual({
			sharesResource: first.resource.toString() === second.resource.toString(),
			afterFirstDisposed,
			afterSecondDisposed,
		}, {
			sharesResource: true,
			afterFirstDisposed: 'artifact',
			afterSecondDisposed: undefined,
		});
	});

	test('tool I/O resources only resolve from chats that are already loaded', async () => {
		let loadRequests = 0;
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidDisposeSession = onDidDisposeSession.event;
			override getSession() {
				return undefined;
			}
			override async acquireOrLoadSession() {
				loadRequests++;
				return undefined;
			}
		};
		const toolProvider = testDisposables.add(new ChatResponseResourceFileSystemProvider(
			chatService,
			new class extends mock<IFileService>() { },
		));

		await assert.rejects(() => toolProvider.readFile(ChatResponseResource.createUri(sessionResource, 'tool-1', 0)), { code: FileSystemProviderErrorCode.FileNotFound });
		assert.strictEqual(loadRequests, 0);
	});

	test('session-scoped data is released with the session', async () => {
		const association = provider.associate(VSBuffer.fromString('artifact').buffer, { sessionResource });

		onDidDisposeSession.fire({ sessionResources: [sessionResource], reason: 'cleared' });
		const afterSessionDisposed = await read(association.resource);

		association.dispose();
		const afterAssociationDisposed = await read(association.resource);

		assert.deepStrictEqual({ afterSessionDisposed, afterAssociationDisposed }, { afterSessionDisposed: undefined, afterAssociationDisposed: undefined });
	});
});
