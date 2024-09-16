/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ICodeMapperRequest, ICodeMapperResult } from '../../contrib/chat/common/chatCodeMapperService.js';
import * as extHostProtocol from './extHost.protocol.js';


export class ExtHostCodeMapper implements extHostProtocol.ExtHostCodeMapperShape {

	private static _providerHandlePool: number = 0;
	private readonly _proxy: extHostProtocol.MainThreadCodeMapperShape;
	private readonly providers = new Map<number, vscode.MappedEditsProvider2>();

	constructor(
		mainContext: extHostProtocol.IMainContext
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadCodeMapper);
	}

	async $mapCode(handle: number, request: ICodeMapperRequest, token: CancellationToken): Promise<ICodeMapperResult | null> {
		// Received request to map code from the main thread
		const provider = this.providers.get(handle);
		if (!provider) {
			throw new Error(`Received request to map code for unknown provider handle ${handle}`);
		}

		// Construct a response object to pass to the provider
		const responseObject = {
			textEdit: (textEdit: vscode.TextEdit, resource: vscode.Uri) => {
				this._proxy.$handleProgress(requestId, {
					kind: 'textEdit',
					data: textEdit,
					resource: resource.toJSON()
				});
			}
		};

		await provider.provideMappedEdits(request, responseObject, token);
	}

	registerMappedEditsProvider(extension: IExtensionDescription, provider: vscode.MappedEditsProvider2): vscode.Disposable {
		const handle = ExtHostCodeMapper._providerHandlePool++;
		this._proxy.$registerCodeMapperProvider(handle);
		this.providers.set(handle, provider);
		return {
			dispose: () => {
				return this._proxy.$unregisterCodeMapperProvider(handle);
			}
		};
	}

}
