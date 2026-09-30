/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../instantiation/common/descriptors.js';
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { createFetchRequest, IFetchService } from '../common/fetch.js';

export class BrowserFetchService implements IFetchService {

	declare readonly _serviceBrand: undefined;

	constructor(private readonly fetchImpl: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init)) { }

	async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
		const request = createFetchRequest(input, init);
		request.signal.throwIfAborted();
		return this.fetchImpl(request);
	}
}

registerSingleton(IFetchService, new SyncDescriptor(BrowserFetchService, [], true));
