/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const ERDOS_NOTEBOOK_EDITOR_FOCUSED = new RawContextKey<boolean>('erdosNotebookEditorFocused', false);

export class ErdosNotebookContextKeyManager extends Disposable {
	private _container?: HTMLElement;
	private _scopedContextKeyService?: IContextKeyService;

	erdosEditorFocus?: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
	}

	setContainer(container: HTMLElement) {
		this._container = container;
		this._scopedContextKeyService = this._contextKeyService.createScoped(this._container);

		this.erdosEditorFocus = ERDOS_NOTEBOOK_EDITOR_FOCUSED.bindTo(this._scopedContextKeyService);

		const focusTracker = this._register(DOM.trackFocus(container));
		this._register(focusTracker.onDidFocus(() => {
			this.erdosEditorFocus?.set(true);
		}));

		this._register(focusTracker.onDidBlur(() => {
			this.erdosEditorFocus?.set(false);
		}));
	}
}
