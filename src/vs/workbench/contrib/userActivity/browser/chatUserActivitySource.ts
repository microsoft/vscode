/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IUserActivityEvent, IUserActivitySource, IUserActivityTarget } from '../../../services/userActivity/common/userActivityCapture.js';
import { capText } from '../../../services/userActivity/browser/userActivityCaptureHelpers.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IChatModel } from '../../chat/common/model/chatModel.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';

/** The most of a session's latest exchange a switch to it carries. */
const MAX_EXCHANGE = 1500;
const MAX_PROMPT = 700;

/** A chat session's latest exchange: the last prompt, and the start of its response. */
export function latestExchange(model: IChatModel): string | undefined {
	const last = model.getRequests().at(-1);
	if (!last) {
		return undefined;
	}
	const prompt = `User: ${capText(last.message.text.trim(), MAX_PROMPT)}`;
	const response = last.response?.response.toString().trim();
	return capText(response ? `${prompt}\n\nAssistant: ${response}` : prompt, MAX_EXCHANGE);
}

/**
 * Chat for the user activity capture: switches between chat sessions, and which session the
 * chat input being typed or selected in belongs to.
 */
export class ChatUserActivitySource extends Disposable implements IUserActivitySource {

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();
	}

	start(record: (event: IUserActivityEvent) => void): void {
		let last = this.chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource.toString();
		this._register(this.chatWidgetService.onDidChangeFocusedSession(() => {
			const model = this.chatWidgetService.lastFocusedWidget?.viewModel?.model;
			if (!model || model.sessionResource.toString() === last) {
				return;
			}
			last = model.sessionResource.toString();
			const title = this.titleOf(model);
			const context = latestExchange(model);
			record({
				kind: 'sessionSwitch',
				time: Date.now(),
				target: { area: 'chat', uri: model.sessionResource, ...(title ? { title } : {}) },
				...(context ? { context } : {}),
			});
		}));
	}

	describeResource(resource: URI): Partial<IUserActivityTarget> | undefined {
		if (resource.scheme === Schemas.vscodeChatInput) {
			const model = this.chatWidgetService.getWidgetByInputUri(resource)?.viewModel?.model;
			const title = model && this.titleOf(model);
			return { area: 'chatInput', ...(model ? { uri: model.sessionResource } : {}), ...(title ? { title } : {}) };
		}
		const model = this.chatWidgetService.getWidgetBySessionResource(resource)?.viewModel?.model;
		const title = model && this.titleOf(model);
		return title ? { title } : undefined;
	}

	private titleOf(model: IChatModel): string | undefined {
		return this.chatService.getSessionTitle(model.sessionResource) || model.title || undefined;
	}
}
