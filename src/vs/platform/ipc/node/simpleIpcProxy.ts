/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';

//
// Use both `SimpleServiceProxyChannel` and `createSimpleChannelProxy`
// for a very basic process <=> process communication over methods.
//

export class SimpleServiceProxyChannel implements IServerChannel {

	private service: { [key: string]: unknown };

	constructor(service: unknown) {
		this.service = service as { [key: string]: unknown };
	}

	listen<T>(_: unknown, event: string): Event<T> {
		throw new Error(`Events are currently unsupported by SimpleServiceProxyChannel: ${event}`);
	}

	call(_: unknown, command: string, args: any[]): Promise<any> {
		const target = this.service[command];
		if (typeof target === 'function') {
			return target.apply(this.service, args);
		}

		throw new Error(`Method not found: ${command}`);
	}
}

export function createSimpleChannelProxy<T>(channel: IChannel): T {
	return new Proxy({}, {
		get(_target, propKey, _receiver) {
			if (typeof propKey === 'string') {
				return function (...args: any[]) {
					return channel.call(propKey, args);
				};
			}

			throw new Error(`Unable to provide main channel proxy implementation for: ${String(propKey)}`);
		}
	}) as T;
}
