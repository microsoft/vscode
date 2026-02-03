/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { isITextModel } from '../../../../../editor/common/model.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatModel } from '../../common/model/chatModel.js';
import { ChatRequestParser } from '../../common/requestParser/chatRequestParser.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsExtensionPoint } from '../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';

export const enum ActionLocation {
	ChatWidget = 'chatWidget',
	Editor = 'editor'
}

const NEW_CHAT_SESSION_ACTION_ID = 'workbench.action.chat.openNewSessionEditor';

export class CreateRemoteAgentJobAction {
	constructor() { }

	private openUntitledEditor(commandService: ICommandService, continuationTarget: IChatSessionsExtensionPoint) {
		commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${continuationTarget.type}`);
	}

	async run(accessor: ServicesAccessor, continuationTarget: IChatSessionsExtensionPoint, _widget?: IChatWidget) {
		const contextKeyService = accessor.get(IContextKeyService);
		const commandService = accessor.get(ICommandService);
		const widgetService = accessor.get(IChatWidgetService);
		const chatAgentService = accessor.get(IChatAgentService);
		const chatService = accessor.get(IChatService);
		const editorService = accessor.get(IEditorService);

		const remoteJobCreatingKey = ChatContextKeys.remoteJobCreating.bindTo(contextKeyService);

		try {
			remoteJobCreatingKey.set(true);

			const widget = _widget ?? widgetService.lastFocusedWidget;
			if (!widget || !widget.viewModel) {
				return this.openUntitledEditor(commandService, continuationTarget);
			}

			// todo@connor4312: remove 'as' cast
			const chatModel = widget.viewModel.model as ChatModel;
			if (!chatModel) {
				return;
			}

			const sessionResource = widget.viewModel.sessionResource;
			const chatRequests = chatModel.getRequests();
			let userPrompt = widget.getInput();
			if (!userPrompt) {
				if (!chatRequests.length) {
					return this.openUntitledEditor(commandService, continuationTarget);
				}
				userPrompt = 'implement this.';
			}

			const attachedContext = widget.input.getAttachedAndImplicitContext(sessionResource);
			widget.input.acceptInput(true);

			// For inline editor mode, add selection or cursor information
			if (widget.location === ChatAgentLocation.EditorInline) {
				const activeEditor = editorService.activeTextEditorControl;
				if (activeEditor) {
					const model = activeEditor.getModel();
					let activeEditorUri: URI | undefined = undefined;
					if (model && isITextModel(model)) {
						activeEditorUri = model.uri as URI;
					}
					const selection = activeEditor.getSelection();
					if (activeEditorUri && selection) {
						attachedContext.add({
							kind: 'file',
							id: 'vscode.implicit.selection',
							name: basename(activeEditorUri),
							value: {
								uri: activeEditorUri,
								range: selection
							},
						});
					}
				}
			}

			const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
			const instantiationService = accessor.get(IInstantiationService);
			const requestParser = instantiationService.createInstance(ChatRequestParser);
			const continuationTargetType = continuationTarget.type;

			// Add the request to the model first
			const parsedRequest = requestParser.parseChatRequest(sessionResource, userPrompt, ChatAgentLocation.Chat);
			const addedRequest = chatModel.addRequest(
				parsedRequest,
				{ variables: attachedContext.asArray() },
				0,
				undefined,
				defaultAgent
			);

			await chatService.removeRequest(sessionResource, addedRequest.id);
			const requestData = await chatService.sendRequest(sessionResource, userPrompt, {
				agentIdSilent: continuationTargetType,
				attachedContext: attachedContext.asArray(),
				userSelectedModelId: widget.input.currentLanguageModel,
				...widget.getModeRequestOptions()
			});

			if (requestData) {
				await widget.handleDelegationExitIfNeeded(defaultAgent, requestData.agent);
			}
		} catch (e) {
			console.error('Error creating remote coding agent job', e);
			throw e;
		} finally {
			remoteJobCreatingKey.set(false);
		}
	}
}
