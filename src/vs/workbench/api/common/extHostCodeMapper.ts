/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ICodeMapperResult } from '../../contrib/chat/common/chatCodeMapperService.js';
import * as extHostProtocol from './extHost.protocol.js';
import { ChatAgentResult, DocumentContextItem, TextEdit } from './extHostTypeConverters.js';
import { URI } from '../../../base/common/uri.js';

export class ExtHostCodeMapper implements extHostProtocol.ExtHostCodeMapperShape {

	private static _providerHandlePool: number = 0;
	private readonly _proxy: extHostProtocol.MainThreadCodeMapperShape;
	private readonly providers = new Map<number, vscode.MappedEditsProvider2>();

	constructor(
		mainContext: extHostProtocol.IMainContext
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadCodeMapper);
	}

	async $mapCode(handle: number, internalRequest: extHostProtocol.ICodeMapperRequestDto, token: CancellationToken): Promise<ICodeMapperResult | null> {
		// Received request to map code from the main thread
		const provider = this.providers.get(handle);
		if (!provider) {
			throw new Error(`Received request to map code for unknown provider handle ${handle}`);
		}

		// Construct a response object to pass to the provider
		const stream: vscode.MappedEditsResponseStream = {
			textEdit: (target: vscode.Uri, edits: vscode.TextEdit | vscode.TextEdit[]) => {
				edits = (Array.isArray(edits) ? edits : [edits]);
				this._proxy.$handleProgress(internalRequest.requestId, {
					uri: target,
					edits: edits.map(TextEdit.from)
				});
			}
		};

		const request: vscode.MappedEditsRequest = {
			codeBlocks: internalRequest.codeBlocks.map(block => {
				return {
					code: block.code,
					resource: URI.revive(block.resource),
					markdownBeforeBlock: block.markdownBeforeBlock
				};
			}),
			conversation: internalRequest.conversation.map(item => {
				if (item.type === 'request') {
					return {
						type: 'request',
						message: item.message
					} satisfies vscode.ConversationRequest;
				} else {
					return {
						type: 'response',
						message: item.message,
						result: item.result ? ChatAgentResult.to(item.result) : undefined,
						references: item.references?.map(DocumentContextItem.to)
					} satisfies vscode.ConversationResponse;
				}
			})
		};

		const result = await provider.provideMappedEdits(request, stream, token);
		return result ?? null;
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
