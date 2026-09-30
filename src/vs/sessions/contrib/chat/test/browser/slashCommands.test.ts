/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { CompletionTriggerKind } from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { withTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { AICustomizationManagementCommands } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { IChatPetService } from '../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { IChatSubmitRequestHandlerService } from '../../../../../workbench/contrib/chat/browser/chatSubmitRequestHandlerService.js';
import { SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ISessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { INewChatModelPickerService } from '../../browser/newChatModelPicker.js';
import { SlashCommandHandler } from '../../browser/slashCommands.js';

suite('SlashCommandHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not intercept customization commands for Agent Host submissions', async () => {
		const commandCalls: string[] = [];
		const session = observableValue<IActiveSession | undefined>('session', new class extends mock<IActiveSession>() {
			override readonly resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' });
		});
		const commandService = new class extends mock<ICommandService>() {
			override readonly onWillExecuteCommand = Event.None;
			override readonly onDidExecuteCommand = Event.None;
			override async executeCommand<R>(commandId: string): Promise<R | undefined> {
				commandCalls.push(commandId);
				return undefined;
			}
		};
		const services = new ServiceCollection(
			[ICommandService, commandService],
			[ISessionContext, { _serviceBrand: undefined, session }],
			[ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
				override readonly onDidChangeSlashCommands = Event.None;
				override async getSlashCommands() { return []; }
			}],
			[INewChatModelPickerService, new class extends mock<INewChatModelPickerService>() { }],
			[IChatPetService, new class extends mock<IChatPetService>() { }],
			[IChatSubmitRequestHandlerService, new class extends mock<IChatSubmitRequestHandlerService>() {
				override register() { return Disposable.None; }
			}],
		);
		const model = store.add(createTextModel('', null, undefined, URI.from({ scheme: Schemas.sessionsChatInput, path: '/input' })));

		await withTestCodeEditor(model, { serviceCollection: services }, async (editor, _viewModel, instantiationService) => {
			const handler = store.add(instantiationService.createInstance(SlashCommandHandler, editor));
			const agentHostHandled = await handler.tryHandle({
				sessionResource: session.get()!.resource,
				providerId: 'copilot',
				sessionId: 'session',
				input: '/skills',
			});

			const localResource = URI.from({ scheme: Schemas.vscodeLocalChatSession, path: '/session' });
			session.set(new class extends mock<IActiveSession>() {
				override readonly resource = localResource;
			}, undefined);
			const localHandled = await handler.tryHandle({
				sessionResource: localResource,
				providerId: 'local',
				sessionId: 'session',
				input: '/skills',
			});

			model.setValue('/');
			const foreignModel = store.add(createTextModel('/', null, undefined, URI.from({ scheme: Schemas.sessionsChatInput, path: '/foreign-input' })));
			const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
			const staticProvider = languageFeaturesService.completionProvider.ordered(model).find(provider => provider._debugDisplayName === 'sessionsSlashCommands')!;
			const completionContext = { triggerKind: CompletionTriggerKind.Invoke } as const;
			const ownCompletions = await staticProvider.provideCompletionItems(model, new Position(1, 2), completionContext, CancellationToken.None);
			const foreignCompletions = await staticProvider.provideCompletionItems(foreignModel, new Position(1, 2), completionContext, CancellationToken.None);

			assert.deepStrictEqual({
				agentHostHandled,
				localHandled,
				commandCalls,
				ownCommands: ownCompletions?.suggestions.map(item => typeof item.label === 'string' ? item.label : item.label.label),
				foreignCommands: foreignCompletions?.suggestions,
			}, {
				agentHostHandled: false,
				localHandled: true,
				commandCalls: [AICustomizationManagementCommands.OpenEditor],
				ownCommands: ['/vscode-pet', '/agents', '/skills', '/instructions', '/hooks', '/models'],
				foreignCommands: undefined,
			});
		});
	});
});
