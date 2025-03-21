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
		private getUriTransformer: undefined | ((requestContext: any) => IURITransformer),
		@INativeMcpDiscoveryHelperService private nativeMcpDiscoveryHelperService: INativeMcpDiscoveryHelperService
	) { }

	listen(context: any, event: string): Event<any> {
		throw new Error('Invalid listen');
	}

	async call(context: any, command: string, args?: any): Promise<any> {
		const uriTransformer = this.getUriTransformer?.(context);
		switch (command) {
			case 'load': {
				const result = await this.nativeMcpDiscoveryHelperService.load();
				return uriTransformer ? transformOutgoingURIs(result, uriTransformer) : result;
			}
		}
		throw new Error('Invalid call');
	}
}

