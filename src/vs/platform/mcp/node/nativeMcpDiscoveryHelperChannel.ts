/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { homedir } from 'os';
import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { IURITransformer, transformOutgoingURIs } from '../../../base/common/uriIpc.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { INativeMcpDiscoveryData } from '../common/nativeMcpDiscoveryHelper.js';
import { platform } from '../../../base/common/platform.js';

export class NativeMcpDiscoveryHelperChannel implements IServerChannel {

	constructor(private getUriTransformer: undefined | ((requestContext: any) => IURITransformer)) { }

	listen(context: any, event: string): Event<any> {
		throw new Error('Invalid listen');
	}

	async call(context: any, command: string, args?: any): Promise<any> {
		const uriTransformer = this.getUriTransformer?.(context);
		switch (command) {
			case 'load': {
				const result: INativeMcpDiscoveryData = {
					platform,
					homedir: URI.file(homedir()),
					winAppData: this.uriFromEnvVariable('APPDATA'),
					xdgHome: this.uriFromEnvVariable('XDG_CONFIG_HOME'),
				};

				return uriTransformer ? transformOutgoingURIs(result, uriTransformer) : result;
			}
		}
		throw new Error('Invalid call');
	}

	private uriFromEnvVariable(varName: string) {
		const envVar = process.env[varName];
		if (!envVar) {
			return undefined;
		}
		return URI.file(envVar);
	}
}

