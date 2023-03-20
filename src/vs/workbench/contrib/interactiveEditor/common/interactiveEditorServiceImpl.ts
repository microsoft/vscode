/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInteractiveEditorService, IInteractiveEditorSessionProvider, CTX_INTERACTIVE_EDITOR_HAS_PROVIDER } from './interactiveEditor';

export class InteractiveEditorServiceImpl implements IInteractiveEditorService {

	declare _serviceBrand: undefined;

	private readonly _entries = new LinkedList<IInteractiveEditorSessionProvider>();

	private readonly _ctxHasProvider: IContextKey<boolean>;

	constructor(@IContextKeyService contextKeyService: IContextKeyService) {
		this._ctxHasProvider = CTX_INTERACTIVE_EDITOR_HAS_PROVIDER.bindTo(contextKeyService);
	}

	addProvider(provider: IInteractiveEditorSessionProvider): IDisposable {

		const rm = this._entries.push(provider);
		this._ctxHasProvider.set(true);

		return toDisposable(() => {
			rm();
			this._ctxHasProvider.set(this._entries.size > 0);
		});
	}

	getAllProvider() {
		return [...this._entries];
	}
}
