/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IAgentsViewProvidersService } from '../agentsView/agentsViewProviders.js';
import { SessionWorktreeCleanupEditorInput } from '../sessionInputBanners/sessionWorktreeCleanupEditorInput.js';

export class EditorWindowWorktreeCleanup extends Disposable {
	static readonly ID = 'workbench.contrib.editorWindowWorktreeCleanup';

	private readonly providers = this._register(new MutableDisposable());

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IAgentsViewProvidersService private readonly providersService: IAgentsViewProvidersService,
	) {
		super();
		this._register(this.editorService.onDidEditorsChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (this.editorService.editors.some(editor => editor instanceof SessionWorktreeCleanupEditorInput)) {
			this.providers.value ??= this.providersService.acquire();
		} else {
			this.providers.clear();
		}
	}
}
