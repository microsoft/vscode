/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { ExtHostContext, ExtHostInteractiveShape, MainContext, MainThreadInteractiveShape } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IInteractiveDocumentService } from 'vs/workbench/contrib/interactive/browser/interactiveDocumentService';

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
