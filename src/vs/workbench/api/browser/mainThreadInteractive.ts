/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../editor/common/languages/modesRegistry.js';
import { ExtHostContext, ExtHostInteractiveShape, MainContext, MainThreadInteractiveShape } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IInteractiveDocumentService } from '../../contrib/interactive/browser/interactiveDocumentService.js';

@extHostNamedCustomer(MainContext.MainThreadInteractive)
export class MainThreadInteractive implements MainThreadInteractiveShape {
	private readonly _proxy: ExtHostInteractiveShape;

	private readonly _disposables = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@IInteractiveDocumentService interactiveDocumentService: IInteractiveDocumentService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostInteractive);

		this._disposables.add(interactiveDocumentService.onWillAddInteractiveDocument((e) => {
			this._proxy.$willAddInteractiveDocument(e.inputUri, '\n', PLAINTEXT_LANGUAGE_ID, e.notebookUri);
		}));

		this._disposables.add(interactiveDocumentService.onWillRemoveInteractiveDocument((e) => {
			this._proxy.$willRemoveInteractiveDocument(e.inputUri, e.notebookUri);
		}));
	}

	dispose(): void {
		this._disposables.dispose();

	}
}
