/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IURITransformer, transformOutgoingURIs } from '../../../base/common/uriIpc.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { INativeMcpDiscoveryHelperService } from '../common/nativeMcpDiscoveryHelper.js';

export class NativeMcpDiscoveryHelperChannel implements IServerChannel {

	constructor(
		private getUriTransformer: undefined | ((requestContext: unknown) => IURITransformer),
		@INativeMcpDiscoveryHelperService private nativeMcpDiscoveryHelperService: INativeMcpDiscoveryHelperService
	) { }

	listen<T>(context: unknown, event: string): Event<T> {
		throw new Error('Invalid listen');
	}

	async call<T>(context: unknown, command: string, args?: unknown): Promise<T> {
		const uriTransformer = this.getUriTransformer?.(context);
		switch (command) {
			case 'load': {
				const result = await this.nativeMcpDiscoveryHelperService.load();
				return (uriTransformer ? transformOutgoingURIs(result, uriTransformer) : result) as T;
			}
		}
		throw new Error('Invalid call');
	}
}

