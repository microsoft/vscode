/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ExtHostContext, ExtHostNotebookRenderersShape, MainContext, MainThreadNotebookRenderersShape } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { INotebookRendererMessagingService } from 'vs/workbench/contrib/notebook/common/notebookRendererMessagingService';

@extHostNamedCustomer(MainContext.MainThreadNotebookRenderers)
export class MainThreadNotebookRenderers extends Disposable implements MainThreadNotebookRenderersShape {
	private readonly proxy: ExtHostNotebookRenderersShape;

	constructor(
		extHostContext: IExtHostContext,
		@INotebookRendererMessagingService private readonly messaging: INotebookRendererMessagingService,
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookRenderers);
		this._register(messaging.onShouldPostMessage(e => {
			this.proxy.$postRendererMessage(e.editorId, e.rendererId, e.message);
		}));
	}

	$postMessage(editorId: string | undefined, rendererId: string, message: unknown): Promise<boolean> {
		return this.messaging.receiveMessage(editorId, rendererId, message);
	}
}
