/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { localize } from '../../../../nls.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IManagedSettingsService, requiresCopilotAgentHost } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IAccountPolicyGateService, whenAccountPolicySettled } from '../../../services/policies/common/accountPolicyService.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IChatEditReviewSession } from '../../chat/common/editing/chatEditingService.js';
import { IChatModel, IChatModelInputState, IChatRequestModel } from '../../chat/common/model/chatModel.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind, getDefaultNewChatSessionTypeAndReasonFromServices } from '../../chat/common/constants.js';
import { IChatSessionsService, localChatSessionType, ResolvedChatSessionsExtensionPoint } from '../../chat/common/chatSessionsService.js';
import { getChatSessionType, getNewChatSessionResource } from '../../chat/common/model/chatUri.js';


export const IInlineChatSessionService = createDecorator<IInlineChatSessionService>('IInlineChatSessionService');

export type InlineChatSessionTerminationState = string | IMarkdownString;

export interface IInlineChatSession {
	readonly initialPosition: Position;
	readonly initialSelection: Selection;
	readonly uri: URI;
	readonly chatModel: IChatModel;
	readonly editingSession: IChatEditReviewSession;
	readonly lockToAgent: ResolvedChatSessionsExtensionPoint | undefined;
	readonly terminationState: IObservable<InlineChatSessionTerminationState | undefined>;
	setTerminationState(state: InlineChatSessionTerminationState | undefined): void;
	dispose(): void;
}

export interface IInlineChatSessionService {
	_serviceBrand: undefined;

	readonly onWillStartSession: Event<IActiveCodeEditor>;
	readonly onDidChangeSessions: Event<this>;

	createSession(editor: ICodeEditor, isNotebook: boolean, token: CancellationToken): Promise<IInlineChatSession>;
	getSessionByTextModel(uri: URI): IInlineChatSession | undefined;
	getSessionBySessionUri(uri: URI): IInlineChatSession | undefined;
}

async function askInPanelChat(accessor: ServicesAccessor, request: IChatRequestModel, state: IChatModelInputState | undefined, token: CancellationToken, fileContext?: { uri: URI; selection: Selection }) {

	const widgetService = accessor.get(IChatWidgetService);
	const chatService = accessor.get(IChatService);
	const configurationService = accessor.get(IConfigurationService);
	const chatSessionsService = accessor.get(IChatSessionsService);
	const storageService = accessor.get(IStorageService);
	const workspaceContextService = accessor.get(IWorkspaceContextService);
	const agentHostEnablementService = accessor.get(IAgentHostEnablementService);
	const managedSettingsService = accessor.get(IManagedSettingsService);
	const accountPolicyGateService = accessor.get(IAccountPolicyGateService);

	if (!request) {
		return;
	}

	await raceCancellationError(whenAccountPolicySettled(accountPolicyGateService), token);
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const currentSessionType = getChatSessionType(request.session.sessionResource);
	const resolved = getDefaultNewChatSessionTypeAndReasonFromServices(configurationService, chatSessionsService, storageService, workspaceContextService.getWorkspace(), agentHostEnablementService.enabled.get(), { currentSessionType }, agentHostEnablementService.managedSandboxEnforced.get(), requiresCopilotAgentHost(managedSettingsService, configurationService));
	const newModelRef = resolved.sessionType === localChatSessionType
		? chatService.startNewLocalSession(ChatAgentLocation.Chat, { sessionTypeSelectionReason: resolved.selectionReason, debugOwner: 'InlineChat#askInPanelChat' })
		: await chatService.acquireOrLoadSession(getNewChatSessionResource(resolved.sessionType), ChatAgentLocation.Chat, token, 'InlineChat#askInPanelChat', resolved.selectionReason);
	if (token.isCancellationRequested) {
		newModelRef?.dispose();
		throw new CancellationError();
	}
	if (!newModelRef) {
		throw new Error(localize('inlineChat.openChatFailed', "Could not start the selected chat session. Please try again."));
	}
	const newModel = newModelRef.object;

	try {
		const inputState: Partial<IChatModelInputState> = { ...state };
		if (currentSessionType !== resolved.sessionType && inputState.selectedModel?.metadata.targetChatSessionType !== resolved.sessionType) {
			delete inputState.selectedModel;
			delete inputState.modelConfiguration;
			delete inputState.modelConfigurationIsTransient;
			delete inputState.selectedModelReason;
		}
		newModel.inputModel.setState({
			...inputState,
			mode: { id: 'agent', kind: ChatModeKind.Agent }
		});

		const widget = await widgetService.openSession(newModel.sessionResource);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!widget) {
			throw new Error(localize('inlineChat.openChatFailed', "Could not start the selected chat session. Please try again."));
		}
		if (fileContext && !fileContext.selection.isEmpty()) {
			await widget.attachmentModel.addFile(fileContext.uri, fileContext.selection);
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		await widget.acceptInput(request.message.text);
	} finally {
		newModelRef.dispose();
	}
}

export async function continueInPanelChat(accessor: ServicesAccessor, session: IInlineChatSession): Promise<void> {
	const request = session.chatModel.getRequests().at(-1);
	if (!request) {
		return;
	}

	const store = new DisposableStore();
	const cancellation = store.add(new CancellationTokenSource());
	const sessionService = accessor.get(IInlineChatSessionService);
	store.add(sessionService.onDidChangeSessions(() => {
		if (sessionService.getSessionBySessionUri(session.chatModel.sessionResource) !== session) {
			cancellation.cancel();
		}
	}));
	store.add(session.editingSession.onDidDispose(() => cancellation.cancel()));
	try {
		await askInPanelChat(accessor, request, session.chatModel.inputModel.state.get(), cancellation.token, { uri: session.uri, selection: session.initialSelection });
		session.dispose();
	} finally {
		store.dispose();
	}
}

export function rephraseInlineChat(accessor: ServicesAccessor, session: IInlineChatSession): string | undefined {
	const request = session.chatModel.getRequests().at(-1);
	if (!request) {
		return undefined;
	}

	accessor.get(IChatService).removeRequest(session.chatModel.sessionResource, request.id);
	session.chatModel.inputModel.setState({ inputText: request.message.text });
	session.setTerminationState(undefined);
	return request.message.text;
}
