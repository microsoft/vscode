/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelContentProvider } from '../../../../../editor/common/services/resolverService.js';
import { chatEditingSnapshotScheme, IChatEditingService } from '../../common/chatEditingService.js';
import { ChatEditingSession } from './chatEditingSession.js';

type ChatEditingTextModelContentQueryData = { kind: 'doc'; documentId: string; chatSessionId: string };

export class ChatEditingTextModelContentProvider implements ITextModelContentProvider {
	public static readonly scheme = 'chat-editing-text-model';

	public static getFileURI(chatSessionId: string, documentId: string, path: string): URI {
		return URI.from({
			scheme: ChatEditingTextModelContentProvider.scheme,
			path,
			query: JSON.stringify({ kind: 'doc', documentId, chatSessionId } satisfies ChatEditingTextModelContentQueryData),
		});
	}

	constructor(
		private readonly _chatEditingService: IChatEditingService,
		@IModelService private readonly _modelService: IModelService,
	) { }

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		const data: ChatEditingTextModelContentQueryData = JSON.parse(resource.query);

		const session = this._chatEditingService.getEditingSession(data.chatSessionId);

		const entry = session?.entries.get().find(candidate => candidate.entryId === data.documentId);
		if (!entry) {
			return null;
		}

		return this._modelService.getModel(entry.originalURI);
	}
}

type ChatEditingSnapshotTextModelContentQueryData = { sessionId: string; requestId: string | undefined; undoStop: string | undefined };

export class ChatEditingSnapshotTextModelContentProvider implements ITextModelContentProvider {
	public static getSnapshotFileURI(chatSessionId: string, requestId: string | undefined, undoStop: string | undefined, path: string): URI {
		return URI.from({
			scheme: chatEditingSnapshotScheme,
			path,
			query: JSON.stringify({ sessionId: chatSessionId, requestId: requestId ?? '', undoStop: undoStop ?? '' } satisfies ChatEditingSnapshotTextModelContentQueryData),
		});
	}

	constructor(
		private readonly _chatEditingService: IChatEditingService,
		@IModelService private readonly _modelService: IModelService,
	) { }

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		const data: ChatEditingSnapshotTextModelContentQueryData = JSON.parse(resource.query);

		const session = this._chatEditingService.getEditingSession(data.sessionId);
		if (!(session instanceof ChatEditingSession) || !data.requestId) {
			return null;
		}

		return session.getSnapshotModel(data.requestId, data.undoStop || undefined, resource);
	}
}
