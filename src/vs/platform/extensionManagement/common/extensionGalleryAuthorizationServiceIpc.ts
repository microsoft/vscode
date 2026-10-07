/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IChannelServer } from '../../../base/parts/ipc/common/ipc.js';
import { ExtensionGalleryAuthorizationService, IExtensionGalleryAuthorizationService } from './extensionGalleryAuthorization.js';

export class ExtensionGalleryAuthorizationIPCService extends ExtensionGalleryAuthorizationService implements IExtensionGalleryAuthorizationService {

	constructor(server: IChannelServer<unknown>) {
		super();
		server.registerChannel('extensionGalleryAuthorization', {
			listen: () => Event.None,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			call: async (context: any, command: string, args?: any): Promise<any> => {
				switch (command) {
					case 'setAuthorization': return Promise.resolve(this.setAuthorization(args[0], args[1]));
				}
				throw new Error('Invalid call');
			}
		});
	}
}
