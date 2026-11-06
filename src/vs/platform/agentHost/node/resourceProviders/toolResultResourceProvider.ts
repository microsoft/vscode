/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { parseToolResultResourceUri } from '../../common/mcpResourceUri.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { AhpErrorCodes, ContentEncoding, ProtocolError, type ResourceReadResult } from '../../common/state/sessionProtocol.js';
import type { IAgentHostResourceProvider } from '../agentHostResourceProviders.js';

/** Reads embedded tool result content from a session database. */
export class ToolResultResourceProvider implements IAgentHostResourceProvider {
	constructor(
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) { }

	async read(uri: URI, encoding: ContentEncoding): Promise<ResourceReadResult> {
		const fields = parseToolResultResourceUri(uri);
		if (!fields) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
		}
		const ref = this._sessionDataService.openDatabase(URI.parse(fields.sessionUri));
		try {
			const resource = await ref.object.readToolResultResourceContent(fields.toolCallId, fields.ordinal);
			if (!resource) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `Tool result resource not found: toolCallId=${fields.toolCallId}, ordinal=${fields.ordinal}`);
			}
			const bytes = VSBuffer.wrap(resource.content);
			return {
				data: encoding === ContentEncoding.Base64 ? encodeBase64(bytes) : bytes.toString(),
				encoding,
				contentType: resource.mimeType ?? 'application/octet-stream',
			};
		} finally {
			ref.dispose();
		}
	}
}
