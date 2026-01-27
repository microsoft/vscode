/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../chat/browser/chat.js';
import { IChatEditingSession } from '../../chat/common/editing/chatEditingService.js';
import { IChatModel, IChatModelInputState, IChatRequestModel } from '../../chat/common/model/chatModel.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';


export const IInlineChatSessionService = createDecorator<IInlineChatSessionService>('IInlineChatSessionService');

export interface IInlineChatSession2 {
	readonly initialPosition: Position;
	readonly initialSelection: Selection;
	readonly uri: URI;
	readonly chatModel: IChatModel;
	readonly editingSession: IChatEditingSession;
	dispose(): void;
}

export interface IInlineChatSessionService {
	_serviceBrand: undefined;

	readonly onWillStartSession: Event<IActiveCodeEditor>;
	readonly onDidChangeSessions: Event<this>;

	dispose(): void;

	createSession(editor: ICodeEditor): IInlineChatSession2;
	getSessionByTextModel(uri: URI): IInlineChatSession2 | undefined;
	getSessionBySessionUri(uri: URI): IInlineChatSession2 | undefined;
}

export async function moveToPanelChat(accessor: ServicesAccessor, model: IChatModel | undefined, resend: boolean) {

	const chatService = accessor.get(IChatService);
	const widgetService = accessor.get(IChatWidgetService);

	const widget = await widgetService.revealWidget();

	if (widget && widget.viewModel && model) {
		let lastRequest: IChatRequestModel | undefined;
		for (const request of model.getRequests().slice()) {
			await chatService.adoptRequest(widget.viewModel.model.sessionResource, request);
			lastRequest = request;
		}

		if (lastRequest && resend) {
			chatService.resendRequest(lastRequest, { location: widget.location });
		}

		widget.focusResponseItem();
	}
}

export async function askInPanelChat(accessor: ServicesAccessor, request: IChatRequestModel, state: IChatModelInputState | undefined) {

	const widgetService = accessor.get(IChatWidgetService);
	const chatService = accessor.get(IChatService);


	if (!request) {
		return;
	}

	const newModelRef = chatService.startSession(ChatAgentLocation.Chat);
	const newModel = newModelRef.object;

	newModel.inputModel.setState({ ...state });

	const widget = await widgetService.openSession(newModelRef.object.sessionResource, ChatViewPaneTarget);

	newModelRef.dispose(); // can be freed after opening because the widget also holds a reference
	widget?.acceptInput(request.message.text);
}
