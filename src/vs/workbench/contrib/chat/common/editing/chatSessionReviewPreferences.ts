/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableMemento } from '../../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';

export const IChatSessionReviewPreferencesService = createDecorator<IChatSessionReviewPreferencesService>('chatSessionReviewPreferencesService');

export interface IChatSessionReviewPreferencesService {
	readonly _serviceBrand: undefined;
	readonly keepUndoEnabled: IObservable<boolean>;
	setKeepUndoEnabled(enabled: boolean): void;
}

/** Shares the Working Set's review preference with editor review, without changing host review state. */
export class ChatSessionReviewPreferencesService extends Disposable implements IChatSessionReviewPreferencesService {
	declare readonly _serviceBrand: undefined;

	private readonly _keepUndoEnabled;
	readonly keepUndoEnabled: IObservable<boolean>;

	constructor(@IStorageService storageService: IStorageService) {
		super();
		this._keepUndoEnabled = this._register(observableMemento({
			key: 'chat.sessionReview.keepUndoEnabled',
			defaultValue: true,
			toStorage: value => String(value),
			fromStorage: value => value !== 'false',
		})(StorageScope.PROFILE, StorageTarget.USER, storageService));
		this.keepUndoEnabled = this._keepUndoEnabled;
	}

	setKeepUndoEnabled(enabled: boolean): void {
		this._keepUndoEnabled.set(enabled, undefined);
	}
}
