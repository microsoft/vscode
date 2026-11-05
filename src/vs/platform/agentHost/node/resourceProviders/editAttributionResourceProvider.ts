/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IAgentEditAttributionService, parseEditAttributionResource } from '../../common/fileEditAttribution.js';
import { AhpErrorCodes, ContentEncoding, ProtocolError, type ResourceReadResult } from '../../common/state/sessionProtocol.js';
import type { IAgentHostResourceProvider } from '../agentHostResourceProviders.js';

/** Handles resource requests for preparing, committing, and cancelling edit attribution flushes. */
export class EditAttributionResourceProvider implements IAgentHostResourceProvider {
	constructor(
		@IAgentEditAttributionService private readonly _editAttributionService: IAgentEditAttributionService,
	) { }

	async read(uri: URI): Promise<ResourceReadResult> {
		const request = parseEditAttributionResource(uri);
		if (!request) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
		}
		const result = request.kind === 'prepare'
			? await this._editAttributionService.prepareFlush(request.params) ?? null
			: request.kind === 'commit'
				? await this._editAttributionService.commitFlush(request.params)
				: await this._editAttributionService.cancelFlush(request.params);
		return {
			data: JSON.stringify(result),
			encoding: ContentEncoding.Utf8,
			contentType: 'application/json',
		};
	}
}
