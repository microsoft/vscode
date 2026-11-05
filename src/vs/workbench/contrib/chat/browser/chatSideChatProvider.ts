/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EditorsOrder } from '../../../common/editor.js';
import { IEditorGroupsService, preferredSideBySideGroupDirection } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IChatService } from '../common/chatService/chatService.js';
import { IChatSessionsService } from '../common/chatSessionsService.js';
import { IChatSideChatOrigin, IChatSideChatProvider, IChatSideChatRequestOptions, IChatSideChatSelection, IChatSideChatService } from '../common/chatSideChatService.js';
import { ChatAgentLocation } from '../common/constants.js';
import { isRequestVM } from '../common/model/chatViewModel.js';
import { getChatSessionType } from '../common/model/chatUri.js';
import { IChatWidgetService } from './chat.js';
import { ChatEditorInput } from './widgetHosts/editor/chatEditorInput.js';

export class EditorSideChatProviderContribution extends Disposable implements IChatSideChatProvider {

	static readonly ID = 'workbench.contrib.editorSideChatProvider';

	constructor(
		@IChatSideChatService sideChatService: IChatSideChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		if (!environmentService.isSessionsWindow) {
			this._register(sideChatService.registerProvider(this));
		}
	}

	canAskInSideChat(sessionResource: URI): boolean {
		return !!this._resolveSourceTurn(sessionResource);
	}

	async askInSideChat(sessionResource: URI, query: string, selection?: IChatSideChatSelection, options?: IChatSideChatRequestOptions): Promise<void> {
		const turn = this._resolveSourceTurn(sessionResource, options?.sourceTurnId);
		if (!turn) {
			throw new Error(localize('sideChat.unsupported', "This conversation does not support side chats."));
		}
		const sourceEditor = this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).find(
			({ editor }) => editor instanceof ChatEditorInput && isEqual(editor.sessionResource, sessionResource),
		);
		const sourceGroup = this.editorGroupsService.getGroup(sourceEditor?.groupId ?? this.editorGroupsService.activeGroup.id);
		const sideChat = await this.chatSessionsService.createSideChat(sessionResource, turn.id, options?.token ?? CancellationToken.None, selection);
		const direction = preferredSideBySideGroupDirection(this.configurationService);
		const target = sourceGroup && sourceGroup.id !== this.editorGroupsService.activeGroup.id
			? this.editorGroupsService.findGroup({ direction }, sourceGroup) ?? this.editorGroupsService.addGroup(sourceGroup, direction)
			: SIDE_GROUP;
		const widget = await this.chatWidgetService.openSession(sideChat.resource, target, { pinned: true });
		if (!widget) {
			throw new Error(localize('sideChat.openFailed', "The side chat could not be opened."));
		}
		const result = await this.chatService.sendRequest(sideChat.resource, query, {
			...widget.getSelectedModelRequestOptions(),
			...widget.getModeRequestOptions(),
			location: ChatAgentLocation.Chat,
			agentIdSilent: getChatSessionType(sideChat.resource),
			attachedContext: options?.attachedContext,
		});
		if (result.kind === 'rejected') {
			throw new Error(result.reason);
		}
		widget.focusInput();
	}

	observeSideChatOrigin(sessionResource: URI): IObservable<IChatSideChatOrigin | undefined> {
		return this.chatSessionsService.observeSideChatOrigin(sessionResource);
	}

	async revealSideChatSource(sessionResource: URI): Promise<void> {
		const origin = this.observeSideChatOrigin(sessionResource).get();
		if (!origin) {
			return;
		}
		const widget = await this.chatWidgetService.openSession(origin.sourceSessionResource);
		if (!widget) {
			throw new Error(localize('sideChat.sourceOpenFailed', "The source conversation could not be opened."));
		}
		const item = widget.viewModel?.getItems().find(item => item.id === origin.sourceTurnId);
		if (item && isRequestVM(item)) {
			widget.reveal(item);
		}
	}

	private _resolveSourceTurn(sessionResource: URI, sourceTurnId?: string) {
		const model = this.chatService.getSession(sessionResource);
		return model && !model.isReadOnly.get() && this.chatSessionsService.sessionSupportsSideChat(sessionResource)
			? sourceTurnId === undefined ? model.getRequests().at(-1) : model.getRequests().find(request => request.id === sourceTurnId)
			: undefined;
	}
}
