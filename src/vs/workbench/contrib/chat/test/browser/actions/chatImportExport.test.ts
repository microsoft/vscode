/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { registerChatExportActions } from '../../../browser/actions/chatImportExport.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatModel, IExportableChatData } from '../../../common/model/chatModel.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { createTestChatSessionResources } from '../../common/model/chatSessionResourceLocks.js';

suite('Portable chat export', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	setup(() => {
		if (!CommandsRegistry.getCommand('workbench.action.chat.export')) {
			disposables.add(registerChatExportActions());
		}
	});

	test('a late missing resource preserves the existing destination and removes staged output', async () => {
		const files = disposables.add(new FileService(new NullLogService()));
		disposables.add(files.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resources = disposables.add(createTestChatSessionResources(files));
		const directory = URI.file('/session.resources');
		const data: IExportableChatData = {
			initialLocation: undefined, responderUsername: 'test',
			requests: [{ message: 'image', requestId: 'image', variableData: { variables: [{ kind: 'image', id: 'image', name: 'image.png', value: new Uint8Array([1, 2, 3]) }] }, response: undefined }],
		};
		const prepared = await resources.prepare(data, directory);
		const restored = resources.restore(prepared.value, directory);
		await files.del(directory, { recursive: true });
		const target = URI.file('/exports/session.json');
		await files.writeFile(target, VSBuffer.fromString('previous export'));
		const sessionResource = URI.parse('vscode-local-chat-session:/export');
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IFileService, files);
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(IChatWidgetService, { lastFocusedWidget: upcastPartial<IChatWidget>({ viewModel: upcastPartial<IChatViewModel>({ sessionResource }) }) });
		instantiation.stub(IChatService, { getSession: () => upcastPartial<IChatModel>({ toExport: () => restored }) });
		const command = CommandsRegistry.getCommand('workbench.action.chat.export')!;
		await assert.rejects(async () => instantiation.invokeFunction(accessor => command.handler(accessor, target)), /unavailable/);
		assert.deepStrictEqual({
			content: (await files.readFile(target)).value.toString(),
			files: (await files.resolve(URI.file('/exports'))).children?.map(child => child.name),
		}, { content: 'previous export', files: ['session.json'] });
	});
});
