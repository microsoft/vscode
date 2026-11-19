/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IAgentsViewProvidersService } from '../agentsView/agentsViewProviders.js';
import { SessionWorktreeCleanupEditorInput } from '../sessionInputBanners/sessionWorktreeCleanupEditorInput.js';
import { ISessionWorktreeCleanupService } from '../sessionInputBanners/sessionWorktreeCleanupService.js';

export class EditorWindowWorktreeCleanup extends Disposable {
	static readonly ID = 'workbench.contrib.editorWindowWorktreeCleanup';

	private readonly providers = this._register(new MutableDisposable());

	constructor(
		@IEditorService editorService: IEditorService,
		@IAgentsViewProvidersService providersService: IAgentsViewProvidersService,
		@ISessionWorktreeCleanupService cleanupService: ISessionWorktreeCleanupService,
	) {
		super();
		const cleanupOpen = observableFromEvent(this, editorService.onDidEditorsChange, () => editorService.editors.some(editor => editor instanceof SessionWorktreeCleanupEditorInput));
		this._register(autorun(reader => {
			const isOpen = cleanupOpen.read(reader);
			const isScheduling = cleanupService.isSchedulingCleanup.read(reader);
			if (isOpen || isScheduling) {
				this.providers.value ??= providersService.acquire();
			} else {
				this.providers.clear();
			}
		}));
	}
}
