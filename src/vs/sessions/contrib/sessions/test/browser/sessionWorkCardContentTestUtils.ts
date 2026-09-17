/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { IChatModelReference, IChatProgress, IChatQuestionAnswers } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatModel, IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatRequestTextPart } from '../../../../../workbench/contrib/chat/common/requestParser/chatParserTypes.js';
import { MockChatService } from '../../../../../workbench/contrib/chat/test/common/chatService/mockChatService.js';

export class SessionWorkCardTestChatService extends MockChatService {
	readonly acquisitions: { readonly resource: URI; readonly token: CancellationToken }[] = [];
	readonly releases: URI[] = [];
	readonly references = new ResourceMap<number>();
	readonly answers: { readonly requestId: string; readonly resolveId: string; readonly answers: IChatQuestionAnswers | undefined }[] = [];
	load: ((resource: URI, token: CancellationToken) => Promise<IChatModelReference | undefined>) | undefined;
	private readonly answerEmitter;
	override readonly onDidReceiveQuestionCarouselAnswer;

	constructor(store: DisposableStore) {
		super();
		this.answerEmitter = store.add(new Emitter<{ requestId: string; resolveId: string; answers: IChatQuestionAnswers | undefined }>());
		this.onDidReceiveQuestionCarouselAnswer = this.answerEmitter.event;
	}

	override async acquireOrLoadSession(resource: URI, _location: ChatAgentLocation, token: CancellationToken): Promise<IChatModelReference | undefined> {
		this.acquisitions.push({ resource, token });
		return this.load ? this.load(resource, token) : this.reference(this.getSession(resource));
	}

	reference(model: IChatModel | undefined): IChatModelReference | undefined {
		if (!model) {
			return undefined;
		}
		const resource = model.sessionResource;
		this.references.set(resource, (this.references.get(resource) ?? 0) + 1);
		return Object.assign(toDisposable(() => {
			this.releases.push(resource);
			this.references.set(resource, (this.references.get(resource) ?? 1) - 1);
		}), { object: model });
	}

	override notifyQuestionCarouselAnswer(requestId: string, resolveId: string, answers: IChatQuestionAnswers | undefined): void {
		const answer = { requestId, resolveId, answers };
		this.answers.push(answer);
		this.answerEmitter.fire(answer);
	}
}

export function addWorkCardRequest(model: ChatModel, text: string, progress: readonly IChatProgress[] = [], timestamp = 1705320000000) {
	const request = model.addRequest({
		text,
		parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)],
	}, { variables: [] }, 0, { kind: ChatModeKind.Agent, isBuiltin: true, modeInstructions: undefined, telemetryModeId: 'agent', applyCodeBlockSuggestionId: undefined },
		undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
		undefined, undefined, undefined, undefined, timestamp);
	for (const part of progress) {
		model.acceptResponseProgress(request, part);
	}
	return request;
}
