/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../editor/common/core/position.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IValidEditOperation } from '../../../../editor/common/model.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { showChatView } from '../../chat/browser/chat.js';
import { IChatEditingSession } from '../../chat/common/chatEditingService.js';
import { IChatModel, IChatRequestModel } from '../../chat/common/chatModel.js';
import { IChatService } from '../../chat/common/chatService.js';
import { Session, StashedSession } from './inlineChatSession.js';

export interface ISessionKeyComputer {
	getComparisonKey(editor: ICodeEditor, uri: URI): string;
}

export const IInlineChatSessionService = createDecorator<IInlineChatSessionService>('IInlineChatSessionService');

export interface IInlineChatSessionEvent {
	readonly editor: ICodeEditor;
	readonly session: Session;
}

export interface IInlineChatSessionEndEvent extends IInlineChatSessionEvent {
	readonly endedByExternalCause: boolean;
}

export interface IInlineChatSession2 {
	readonly initialPosition: Position;
	readonly uri: URI;
	readonly chatModel: IChatModel;
	readonly editingSession: IChatEditingSession;
	dispose(): void;
}

export interface IInlineChatSessionService {
	_serviceBrand: undefined;

	readonly onWillStartSession: Event<IActiveCodeEditor>;
	readonly onDidMoveSession: Event<IInlineChatSessionEvent>;
	readonly onDidStashSession: Event<IInlineChatSessionEvent>;
	readonly onDidEndSession: Event<IInlineChatSessionEndEvent>;

	createSession(editor: IActiveCodeEditor, options: { wholeRange?: IRange; session?: Session; headless?: boolean }, token: CancellationToken): Promise<Session | undefined>;

	moveSession(session: Session, newEditor: ICodeEditor): void;

	getCodeEditor(session: Session): ICodeEditor;

	getSession(editor: ICodeEditor, uri: URI): Session | undefined;

	releaseSession(session: Session): void;

	stashSession(session: Session, editor: ICodeEditor, undoCancelEdits: IValidEditOperation[]): StashedSession;

	registerSessionKeyComputer(scheme: string, value: ISessionKeyComputer): IDisposable;

	dispose(): void;

	createSession2(editor: ICodeEditor, uri: URI, token: CancellationToken): Promise<IInlineChatSession2>;
	getSession2(uri: URI): IInlineChatSession2 | undefined;
	getSession2(sessionId: string): IInlineChatSession2 | undefined;
	readonly onDidChangeSessions: Event<this>;
}

export async function moveToPanelChat(accessor: ServicesAccessor, model: IChatModel | undefined, resend: boolean) {

	const viewsService = accessor.get(IViewsService);
	const chatService = accessor.get(IChatService);
	const layoutService = accessor.get(IWorkbenchLayoutService);

	const widget = await showChatView(viewsService, layoutService);

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

export async function askInPanelChat(accessor: ServicesAccessor, model: IChatRequestModel) {

	const viewsService = accessor.get(IViewsService);
	const layoutService = accessor.get(IWorkbenchLayoutService);

	const widget = await showChatView(viewsService, layoutService);

	if (!widget) {
		return;
	}

	if (!widget.viewModel) {
		await raceTimeout(Event.toPromise(widget.onDidChangeViewModel), 1000);
	}

	if (model.attachedContext) {
		widget.attachmentModel.addContext(...model.attachedContext);
	}

	widget.acceptInput(model.message.text, {
		enableImplicitContext: true,
		isVoiceInput: false,
		noCommandDetection: true
	});
}
