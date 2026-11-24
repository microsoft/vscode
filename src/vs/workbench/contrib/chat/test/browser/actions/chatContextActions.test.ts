/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { registerChatContextActions } from '../../../browser/actions/chatContextActions.js';
import { IChatExecuteActionContext } from '../../../browser/actions/chatExecuteActions.js';
import { ChatAttachmentModel } from '../../../browser/attachments/chatAttachmentModel.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { CHAT_ATTACH_CONTEXT_ACTION_ID } from '../../../common/constants.js';

suite('ChatContextActions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Add File to Chat attaches the given file, and replaces any open quick input with the context picker when there is no file to attach', async () => {
		store.add(registerChatContextActions());

		const log: string[] = [];
		const widget = upcastPartial<IChatWidget>({
			focusInput: () => { },
			attachmentModel: upcastPartial<ChatAttachmentModel>({
				addFile: async uri => { log.push(`attach ${uri.path}`); },
			}),
		});

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			lastFocusedWidget: undefined,
			revealWidget: async () => widget,
		}));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			activeTextEditorControl: undefined,
			activeEditor: undefined,
		}));
		instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({
			cancel: async () => { log.push('cancel the open quick input'); },
		}));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (id: string, context: IChatExecuteActionContext) => {
				log.push(`run ${id} for ${context.widget === widget ? 'the revealed widget' : 'another widget'}`);
				return undefined;
			},
		}));

		const attachFile = CommandsRegistry.getCommand('workbench.action.chat.attachFile')!.handler;
		await instantiationService.invokeFunction(attachFile, URI.file('/workspace/file.ts'));
		await instantiationService.invokeFunction(attachFile);

		assert.deepStrictEqual(log, [
			'attach /workspace/file.ts',
			'cancel the open quick input',
			`run ${CHAT_ATTACH_CONTEXT_ACTION_ID} for the revealed widget`,
		]);
	});
});
