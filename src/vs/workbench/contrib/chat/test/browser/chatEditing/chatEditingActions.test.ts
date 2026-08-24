/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService, IConfirmationResult } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatAttachmentModel } from '../../../browser/attachments/chatAttachmentModel.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { RestoreCheckpointActionId, StartOverActionId } from '../../../browser/chatEditing/chatEditingActions.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { IChatRequestFileEntry, IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatEditingSession, IModifiedFileEntry } from '../../../common/editing/chatEditingService.js';
import { IChatModel, IChatRequestModel } from '../../../common/model/chatModel.js';
import { IChatRequestViewModel, IChatViewModel } from '../../../common/model/chatViewModel.js';
import { IParsedChatRequest } from '../../../common/requestParser/chatParserTypes.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
import { MockChatWidgetService } from '../widget/mockChatWidget.js';

suite('Chat editing actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function runCheckpointAction(actionId: string, initialInput: string, confirmRestore?: boolean) {
		const instantiationService = store.add(new TestInstantiationService());
		const sessionResource = URI.parse('test://session');
		const requestId = 'request-1';
		const attachment: IChatRequestFileEntry = {
			id: 'attachment-1',
			kind: 'file',
			name: 'file.ts',
			value: URI.parse('test://file.ts'),
		};
		const requestItem = new class extends mock<IChatRequestViewModel>() {
			override readonly id = requestId;
			override readonly sessionResource = sessionResource;
			override readonly message = new class extends mock<IParsedChatRequest>() { };
			override readonly messageText = 'original request';
			override readonly attachedContext = [attachment];
		};
		const requestModel = new class extends mock<IChatRequestModel>() {
			override readonly id = requestId;
		};

		let checkpoint: string | undefined;
		let restoredSnapshot: string | undefined;
		let inputValue = initialInput;
		let mainInputFocusCount = 0;
		let activeInputSetCount = 0;
		let restoredAttachmentIds: string[] = [];

		const modifiedEntry = new class extends mock<IModifiedFileEntry>() {
			override readonly modifiedURI = URI.parse('test://file.ts');
			override readonly lastModifyingRequestId = requestId;
		};
		const editingSession = new class extends mock<IChatEditingSession>() {
			override readonly entries = observableValue<readonly IModifiedFileEntry[]>('entries', confirmRestore === undefined ? [] : [modifiedEntry]);
			override async restoreSnapshot(snapshotRequestId: string, _stopId: string | undefined): Promise<void> {
				restoredSnapshot = snapshotRequestId;
			}
		};
		const chatModel = new class extends mock<IChatModel>() {
			override readonly editingSession = editingSession;
			override getRequests() {
				return [requestModel];
			}
			override setCheckpoint(value: string | undefined): void {
				checkpoint = value;
			}
		};
		const inputEditor = new class extends mock<CodeEditorWidget>() {
			override getValue(): string {
				return inputValue;
			}
		};
		const attachmentModel = new class extends mock<ChatAttachmentModel>() {
			override get attachments(): readonly IChatRequestVariableEntry[] {
				return [];
			}
		};
		const mainInput = new class extends mock<ChatInputPart>() {
			override get inputEditor(): CodeEditorWidget {
				return inputEditor;
			}
			override get attachmentModel(): ChatAttachmentModel {
				return attachmentModel;
			}
			override focus(): void {
				mainInputFocusCount++;
			}
			override setValue(value: string, _transient: boolean): void {
				inputValue = value;
			}
			override async restoreAttachments(attachments: readonly IChatRequestVariableEntry[]): Promise<void> {
				restoredAttachmentIds = attachments.map(attachment => attachment.id);
			}
		};
		const activeInput = new class extends mock<ChatInputPart>() {
			override setValue(_value: string, _transient: boolean): void {
				activeInputSetCount++;
			}
		};
		const viewModel = new class extends mock<IChatViewModel>() {
			override readonly model = chatModel;
		};
		const widget = new class extends mock<IChatWidget>() {
			override readonly viewModel = viewModel;
			override readonly input = activeInput;
			override readonly inputPart = mainInput;
		};

		instantiationService.set(IChatWidgetService, new class extends MockChatWidgetService {
			override getWidgetBySessionResource() {
				return widget;
			}
		});
		instantiationService.set(IChatService, new class extends MockChatService {
			override getSession() {
				return chatModel;
			}
		});
		const configurationService = new TestConfigurationService();
		if (confirmRestore !== undefined) {
			await configurationService.setUserConfiguration('chat.editing.confirmEditRequestRemoval', true);
		}
		instantiationService.set(IConfigurationService, configurationService);
		instantiationService.set(IDialogService, new class extends mock<IDialogService>() {
			override async confirm(): Promise<IConfirmationResult> {
				return { confirmed: confirmRestore ?? true };
			}
		});

		const commandHandler = CommandsRegistry.getCommand(actionId)?.handler;
		assert.ok(commandHandler);
		await commandHandler(instantiationService, requestItem);

		return {
			inputValue,
			mainInputFocusCount,
			activeInputSetCount,
			checkpoint,
			restoredSnapshot,
			restoredAttachmentIds,
		};
	}

	test('Start Over restores the first request to an empty main input', async () => {
		assert.deepStrictEqual(await runCheckpointAction(StartOverActionId, ''), {
			inputValue: 'original request',
			mainInputFocusCount: 1,
			activeInputSetCount: 0,
			checkpoint: 'request-1',
			restoredSnapshot: 'request-1',
			restoredAttachmentIds: ['attachment-1'],
		});
	});

	test('Start Over preserves existing main input content', async () => {
		assert.deepStrictEqual(await runCheckpointAction(StartOverActionId, 'existing draft'), {
			inputValue: 'existing draft',
			mainInputFocusCount: 0,
			activeInputSetCount: 0,
			checkpoint: 'request-1',
			restoredSnapshot: 'request-1',
			restoredAttachmentIds: [],
		});
	});

	test('checkpoint actions do not change the input when restore is canceled', async () => {
		const expected = {
			inputValue: '',
			mainInputFocusCount: 0,
			activeInputSetCount: 0,
			checkpoint: undefined,
			restoredSnapshot: undefined,
			restoredAttachmentIds: [],
		};
		assert.deepStrictEqual({
			restoreCheckpoint: await runCheckpointAction(RestoreCheckpointActionId, '', false),
			startOver: await runCheckpointAction(StartOverActionId, '', false),
		}, {
			restoreCheckpoint: expected,
			startOver: expected,
		});
	});
});
