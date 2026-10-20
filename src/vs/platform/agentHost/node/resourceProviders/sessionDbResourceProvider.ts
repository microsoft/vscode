/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { ISessionDataService, type ISessionDatabase } from '../../common/sessionDataService.js';
import { parseSessionDbUri, type ISessionDbUriFields } from '../../common/sessionDbUri.js';
import { AhpErrorCodes, ContentEncoding, ProtocolError, type ResourceReadResult } from '../../common/state/sessionProtocol.js';
import type { IAgentHostResourceProvider } from '../agentHostResourceProviders.js';
import { isFileEditAcceptRecord } from '../fileEditAccept.js';
import { computeWorkingSetFileContents } from '../workingSetFileContents.js';

/** Reads before/after file-edit content, and Working Set baselines, from a session database. */
export class SessionDbResourceProvider implements IAgentHostResourceProvider {
	constructor(
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IDiffComputeService private readonly _diffComputeService: IDiffComputeService,
	) { }

	async read(uri: URI): Promise<ResourceReadResult> {
		const fields = parseSessionDbUri(uri.toString());
		if (!fields) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
		}
		const sessionUri = URI.parse(fields.sessionUri);
		const ref = this._sessionDataService.openDatabase(sessionUri);
		try {
			const bytes = fields.part === 'workingSetBaseline'
				? await this._readWorkingSetBaseline(ref.object, fields)
				: await this._readFileEditContent(ref.object, fields);
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

	private async _readFileEditContent(db: ISessionDatabase, fields: ISessionDbUriFields): Promise<Uint8Array | undefined> {
		const content = await db.readFileEditContent(fields.toolCallId, fields.filePath);
		if (!content) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `File edit not found: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
		}
		return fields.part === 'before' ? content.beforeContent : content.afterContent;
	}

	/** Computes the Working Set baseline from the file's records up to and including the addressed one. */
	private async _readWorkingSetBaseline(db: ISessionDatabase, fields: ISessionDbUriFields): Promise<Uint8Array | undefined> {
		const records = (await db.getAllFileEdits()).filter(record => record.filePath === fields.filePath);
		const end = records.findIndex(record => record.toolCallId === fields.toolCallId);
		if (end < 0) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `File edit not found: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
		}
		const recordsUpToEnd = records.slice(0, end + 1);
		const start = Math.max(recordsUpToEnd.findLastIndex(isFileEditAcceptRecord), 0);
		return (await computeWorkingSetFileContents(db, recordsUpToEnd.slice(start), this._diffComputeService)).baseline;
	}
}
