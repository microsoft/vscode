/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelContentProvider } from '../../../../../editor/common/services/resolverService.js';
import { IChatEditingService } from '../../common/editing/chatEditingService.js';

type ChatEditingTextModelContentQueryData = { kind: 'doc'; documentId: string; chatSessionResource: UriComponents };

export class ChatEditingTextModelContentProvider implements ITextModelContentProvider {
	public static readonly scheme = Schemas.chatEditingModel;

	public static getFileURI(chatSessionResource: URI, documentId: string, path: string): URI {
		return URI.from({
			scheme: ChatEditingTextModelContentProvider.scheme,
			path,
			query: JSON.stringify({ kind: 'doc', documentId, chatSessionResource } satisfies ChatEditingTextModelContentQueryData),
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

		const session = this._chatEditingService.getEditingSession(URI.revive(data.chatSessionResource));

		const entry = session?.entries.get().find(candidate => candidate.entryId === data.documentId);
		if (!entry) {
			return null;
		}

		return this._modelService.getModel(entry.originalURI);
	}
}

type ChatEditingSnapshotTextModelContentQueryData = { session: UriComponents; requestId: string | undefined; undoStop: string | undefined; scheme: string | undefined };

export class ChatEditingSnapshotTextModelContentProvider implements ITextModelContentProvider {
	public static getSnapshotFileURI(chatSessionResource: URI, requestId: string | undefined, undoStop: string | undefined, path: string, scheme?: string): URI {
		return URI.from({
			scheme: Schemas.chatEditingSnapshotScheme,
			path,
			query: JSON.stringify({ session: chatSessionResource, requestId: requestId ?? '', undoStop: undoStop ?? '', scheme } satisfies ChatEditingSnapshotTextModelContentQueryData),
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
		const session = this._chatEditingService.getEditingSession(URI.revive(data.session));
		if (!session || !data.requestId) {
			return null;
		}

		return session.getSnapshotModel(data.requestId, data.undoStop || undefined, resource);
	}
}
