/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { parseSessionDbUri } from '../../common/sessionDbUri.js';
import { AhpErrorCodes, ContentEncoding, ProtocolError, type ResourceReadResult } from '../../common/state/sessionProtocol.js';
import type { IAgentHostResourceProvider } from '../agentHostResourceProviders.js';

/** Reads before/after file-edit content from a session database. */
export class SessionDbResourceProvider implements IAgentHostResourceProvider {
	constructor(
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) { }

	async read(uri: URI): Promise<ResourceReadResult> {
		const fields = parseSessionDbUri(uri.toString());
		if (!fields) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
		}
		const sessionUri = URI.parse(fields.sessionUri);
		const ref = this._sessionDataService.openDatabase(sessionUri);
		try {
			const content = await ref.object.readFileEditContent(fields.toolCallId, fields.filePath);
			if (!content) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `File edit not found: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
			}
			const bytes = fields.part === 'before' ? content.beforeContent : content.afterContent;
			if (!bytes) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `No ${fields.part} content for: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
			}
			return {
				data: new TextDecoder().decode(bytes),
				encoding: ContentEncoding.Utf8,
				contentType: 'text/plain',
			};
		} finally {
			ref.dispose();
		}
	}
}
