import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../chat/common/constants.js';
export const IInlineChatSessionService = createDecorator('IInlineChatSessionService');
export async function moveToPanelChat(accessor, model, resend) {
    const chatService = accessor.get(IChatService);
    const widgetService = accessor.get(IChatWidgetService);
    const widget = await widgetService.revealWidget();
    if (widget && widget.viewModel && model) {
        let lastRequest;
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
export async function askInPanelChat(accessor, request, state, fileContext) {
    const widgetService = accessor.get(IChatWidgetService);
    const chatService = accessor.get(IChatService);
    if (!request) {
        return;
    }
    const newModelRef = chatService.startNewLocalSession(ChatAgentLocation.Chat);
    const newModel = newModelRef.object;
    newModel.inputModel.setState({
        ...state,
        mode: { id: 'agent', kind: ChatModeKind.Agent }
    });
    const widget = await widgetService.openSession(newModelRef.object.sessionResource);
    newModelRef.dispose(); // can be freed after opening because the widget also holds a reference
    if (widget && fileContext && !fileContext.selection.isEmpty()) {
        await widget.attachmentModel.addFile(fileContext.uri, fileContext.selection);
    }
    widget?.acceptInput(request.message.text);
}
export async function continueInPanelChat(accessor, session) {
    const request = session.chatModel.getRequests().at(-1);
    if (!request) {
        return;
    }
    await askInPanelChat(accessor, request, session.chatModel.inputModel.state.get(), { uri: session.uri, selection: session.initialSelection });
    session.dispose();
}
export function rephraseInlineChat(accessor, session) {
    const request = session.chatModel.getRequests().at(-1);
    if (!request) {
        return undefined;
    }
    accessor.get(IChatService).removeRequest(session.chatModel.sessionResource, request.id);
    session.chatModel.inputModel.setState({ inputText: request.message.text });
    session.setTerminationState(undefined);
    return request.message.text;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvaW5saW5lQ2hhdC9icm93c2VyL2lubGluZUNoYXRTZXNzaW9uU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFXQSxPQUFPLEVBQUUsZUFBZSxFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBR2hFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFHakYsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsZUFBZSxDQUE0QiwyQkFBMkIsQ0FBQyxDQUFDO0FBNEJqSCxNQUFNLENBQUMsS0FBSyxVQUFVLGVBQWUsQ0FBQyxRQUEwQixFQUFFLEtBQTZCLEVBQUUsTUFBZTtJQUUvRyxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQy9DLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUV2RCxNQUFNLE1BQU0sR0FBRyxNQUFNLGFBQWEsQ0FBQyxZQUFZLEVBQUUsQ0FBQztJQUVsRCxJQUFJLE1BQU0sSUFBSSxNQUFNLENBQUMsU0FBUyxJQUFJLEtBQUssRUFBRSxDQUFDO1FBQ3pDLElBQUksV0FBMEMsQ0FBQztRQUMvQyxLQUFLLE1BQU0sT0FBTyxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDO1lBQ25ELE1BQU0sV0FBVyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxlQUFl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