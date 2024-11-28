/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelContentProvider } from '../../../../../editor/common/services/resolverService.js';
import { ChatEditingSession } from './chatEditingSession.js';

type ChatEditingTextModelContentQueryData = { kind: 'empty' } | { kind: 'doc'; documentId: string };

export class ChatEditingTextModelContentProvider implements ITextModelContentProvider {
	public static readonly scheme = 'chat-editing-text-model';

	public static getEmptyFileURI(): URI {
		return URI.from({
			scheme: ChatEditingTextModelContentProvider.scheme,
			query: JSON.stringify({ kind: 'empty' }),
		});
	}

	public static getFileURI(documentId: string, path: string): URI {
		return URI.from({
			scheme: ChatEditingTextModelContentProvider.scheme,
			path,
			query: JSON.stringify({ kind: 'doc', documentId }),
		});
	}

	constructor(
		private readonly _currentSessionObs: IObservable<ChatEditingSession | null>,
		@IModelService private readonly _modelService: IModelService
	) { }

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		const data: ChatEditingTextModelContentQueryData = JSON.parse(resource.query);
		if (data.kind === 'empty') {
			return this._modelService.createModel('', null, resource, false);
		}

		const session = this._currentSessionObs.get();
		if (!session) {
			return null;
		}

		return session.getVirtualModel(data.documentId);
	}
}

type ChatEditingSnapshotTextModelContentQueryData = { requestId: string | undefined };

export class ChatEditingSnapshotTextModelContentProvider implements ITextModelContentProvider {
	public static readonly scheme = 'chat-editing-snapshot-text-model';

	public static getSnapshotFileURI(requestId: string | undefined, path: string): URI {
		return URI.from({
			scheme: ChatEditingSnapshotTextModelContentProvider.scheme,
			path,
			query: JSON.stringify({ requestId: requestId ?? '' }),
		});
	}

	constructor(
		private readonly _currentSessionObs: IObservable<ChatEditingSession | null>,
		@IModelService private readonly _modelService: IModelService
	) { }

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		const data: ChatEditingSnapshotTextModelContentQueryData = JSON.parse(resource.query);

		const session = this._currentSessionObs.get();
		if (!session || !data.requestId) {
			return null;
		}

		return session.getSnapshotModel(data.requestId, resource);
	}
}
