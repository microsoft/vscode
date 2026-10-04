/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IFileDialogService, ISaveDialogOptions } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService } from '../../../../../../platform/native/common/native.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { registerChatExportZipAction } from '../../../electron-browser/actions/chatExportZip.js';
import { ISCMService } from '../../../../scm/common/scm.js';

suite('Chat Export Zip', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
