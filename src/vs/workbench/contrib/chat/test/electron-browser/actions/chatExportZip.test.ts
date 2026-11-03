/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IFileDialogService, ISaveDialogOptions } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { INativeEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService } from '../../../../../../platform/native/common/native.js';
import { INotificationHandle, INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { registerChatExportZipAction } from '../../../electron-browser/actions/chatExportZip.js';
import { ISCMService } from '../../../../scm/common/scm.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { IChatModel, IExportableChatData } from '../../../common/model/chatModel.js';
import { createTestChatSessionResources } from '../../common/model/chatSessionResourceLocks.js';

suite('Chat Export Zip', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const fail of [false, true]) {
		test(`streams portable binary chat data and cleans up after ${fail ? 'failure' : 'success'}`, async () => {
			const files = store.add(new FileService(new NullLogService()));
			store.add(files.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
			const resources = store.add(createTestChatSessionResources(files));
			const sessionResource = URI.parse('vscode-local-chat-session:/zip');
			const data: IExportableChatData = {
				initialLocation: ChatAgentLocation.Chat,
				responderUsername: 'test',
				requests: [{
					message: 'image', requestId: 'image-request', response: undefined,
					variableData: { variables: [{ kind: 'image', name: 'image.png', id: 'image', value: new Uint8Array([1, 2, 3]) }] },
				}],
			};
			const directory = URI.file('/session.resources');
			const prepared = await resources.prepare(data, directory);
			const restored = resources.restore(prepared.value, directory);
			const instantiation = store.add(new TestInstantiationService());
			instantiation.stub(IFileService, files);
			instantiation.stub(INativeEnvironmentService, { tmpDir: URI.file('/scratch') });
			instantiation.stub(IChatWidgetService, { lastFocusedWidget: upcastPartial<IChatWidget>({ viewModel: upcastPartial<IChatViewModel>({ sessionResource }) }) });
			instantiation.stub(IChatService, { getSession: () => upcastPartial<IChatModel>({ toExport: () => restored, getRequests: () => [] }) });
			instantiation.stub(IFileDialogService, { defaultFilePath: async () => URI.file('/'), showSaveDialog: async () => URI.file('/export.zip') });
			instantiation.stub(ISCMService, { repositories: [] });
			const errors: string[] = [];
			instantiation.stub(INotificationService, {
				notify: notification => {
					if (notification.severity === Severity.Error) {
						errors.push(String(notification.message));
					}
					return upcastPartial<INotificationHandle>({});
				},
			});
			let exported: IExportableChatData | undefined;
			let temporary: URI | undefined;
			instantiation.stub(INativeHostService, {
				createZipFile: async (_target, entries) => {
					const entry = entries[0];
					assert.ok(hasKey(entry, { source: true }));
					temporary = entry.source;
					exported = JSON.parse((await files.readFile(entry.source)).value.toString());
					if (fail) {
						throw new Error('injected zip failure');
					}
					return { skippedFiles: [] };
				},
			});
			store.add(registerChatExportZipAction());
			await instantiation.invokeFunction(CommandsRegistry.getCommand('workbench.action.chat.exportAsZip')!.handler);
			assert.ok(temporary);
			assert.deepStrictEqual({
				value: exported?.requests[0].variableData.variables[0].value,
				temporaryExists: await files.exists(temporary),
				sourceExists: await files.exists(directory),
				errors: errors.length,
			}, { value: { $base64: 'AQID' }, temporaryExists: false, sourceExists: true, errors: fail ? 1 : 0 });
		});
	}

	test('only allows saving to the local file system', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		let defaultFilePathScheme: string | undefined;
		let dialogOptions: ISaveDialogOptions | undefined;
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			lastFocusedWidget: upcastPartial<IChatWidget>({
				viewModel: upcastPartial<IChatViewModel>({}),
			}),
		}));
		instantiationService.stub(IFileDialogService, upcastPartial<IFileDialogService>({
			defaultFilePath: async schemeFilter => {
				defaultFilePathScheme = schemeFilter;
				return URI.file('/local');
			},
			showSaveDialog: async options => {
				dialogOptions = options;
				return undefined;
			},
		}));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({}));
		instantiationService.stub(INativeHostService, upcastPartial<INativeHostService>({}));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({}));
		instantiationService.stub(ISCMService, upcastPartial<ISCMService>({}));
		instantiationService.stub(IFileService, upcastPartial<IFileService>({}));
		instantiationService.stub(INativeEnvironmentService, { tmpDir: URI.file('/scratch') });

		store.add(registerChatExportZipAction());
		await instantiationService.invokeFunction(CommandsRegistry.getCommand('workbench.action.chat.exportAsZip')!.handler);

		assert.deepStrictEqual({
			defaultFilePathScheme,
			dialogOptions,
		}, {
			defaultFilePathScheme: Schemas.file,
			dialogOptions: {
				defaultUri: URI.file('/local/chat.zip'),
				filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
				availableFileSystems: [Schemas.file],
			},
		});
	});
});
