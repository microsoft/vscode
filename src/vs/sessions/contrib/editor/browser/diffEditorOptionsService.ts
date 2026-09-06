/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IDiffEditorOptionsService, SessionsDiffRenderSideBySideContext } from '../common/diffEditorOptionsService.js';

const PREFERRED_RENDER_SIDE_BY_SIDE_STORAGE_KEY = 'sessions.diffEditor.renderSideBySide';

export class DiffEditorOptionsService extends Disposable implements IDiffEditorOptionsService {

	declare readonly _serviceBrand: undefined;

	readonly renderSideBySide;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.renderSideBySide = observableValue(this, storageService.getBoolean(PREFERRED_RENDER_SIDE_BY_SIDE_STORAGE_KEY, StorageScope.PROFILE, true));
		this._register(bindContextKey(SessionsDiffRenderSideBySideContext, contextKeyService, reader => this.renderSideBySide.read(reader)));
	}

	toggleRenderSideBySide(): void {
		const renderSideBySide = !this.renderSideBySide.get();
		this.renderSideBySide.set(renderSideBySide, undefined);
		this.storageService.store(PREFERRED_RENDER_SIDE_BY_SIDE_STORAGE_KEY, renderSideBySide, StorageScope.PROFILE, StorageTarget.USER);
	}
}
