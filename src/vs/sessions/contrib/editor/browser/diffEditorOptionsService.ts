/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { DiffEditorViewMode } from '../../../../editor/common/config/editorOptions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IDiffEditorOptionsService, SessionsDiffViewModeContext } from '../common/diffEditorOptionsService.js';

const VIEW_MODE_STORAGE_KEY = 'sessions.diffEditor.viewMode';
const LEGACY_RENDER_SIDE_BY_SIDE_STORAGE_KEY = 'sessions.diffEditor.renderSideBySide';

export class DiffEditorOptionsService extends Disposable implements IDiffEditorOptionsService {

	declare readonly _serviceBrand: undefined;

	readonly viewMode;
	readonly renderSideBySide;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const storedViewMode = storageService.get(VIEW_MODE_STORAGE_KEY, StorageScope.PROFILE);
		const legacyRenderSideBySide = storageService.getBoolean(LEGACY_RENDER_SIDE_BY_SIDE_STORAGE_KEY, StorageScope.PROFILE);
		this.viewMode = observableValue<DiffEditorViewMode>(this, isDiffEditorViewMode(storedViewMode)
			? storedViewMode
			: legacyRenderSideBySide === false ? 'inline' : 'automatic');
		this.renderSideBySide = this.viewMode.map(this, mode => mode !== 'inline');
		this._register(bindContextKey(SessionsDiffViewModeContext, contextKeyService, reader => this.viewMode.read(reader)));
	}

	setViewMode(mode: DiffEditorViewMode): void {
		this.viewMode.set(mode, undefined);
		this.storageService.store(VIEW_MODE_STORAGE_KEY, mode, StorageScope.PROFILE, StorageTarget.USER);
	}

	toggleRenderSideBySide(): void {
		this.setViewMode(this.viewMode.get() === 'inline' ? 'automatic' : 'inline');
	}
}

function isDiffEditorViewMode(value: string | undefined): value is DiffEditorViewMode {
	return value === 'inline' || value === 'sideBySide' || value === 'automatic';
}
