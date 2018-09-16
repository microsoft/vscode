/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IRPCProtocol, ProxyIdentifier } from 'vs/workbench/services/extensions/node/proxyIdentifier';
import { IChannelServer, IChannelClient, IChannel } from 'vs/base/parts/ipc/node/ipc';
import { CharCode } from 'vs/base/common/charCode';
import { Event } from 'vs/base/common/event';

declare var Proxy: any; // TODO@TypeScript

export class RPCProtocol implements IRPCProtocol {

	private identifiers = new Set<number>();
	private proxies = new Map<number, any>();

	constructor(private client: IChannelClient, private server: IChannelServer) { }

	getProxy<T>(identifier: ProxyIdentifier<T>): T {
		let result = this.proxies.get(identifier.nid);

		if (!result) {
			const channel = this.client.getChannel(`rpc${identifier.nid}`);

			result = new Proxy(Object.create(null), {
				get: (target: any, name: string) => {
					if (!target[name] && name.charCodeAt(0) === CharCode.DollarSign) {
						target[name] = (...myArgs: any[]) => {
							return channel.call(name, myArgs);
						};
					}
					return target[name];
				}
			});

			this.proxies.set(identifier.nid, result);
		}

		return result;
	}

	set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R {
		const channel = new class implements IChannel {
			call<T>(command: string, arg?: any): Thenable<T> {
				return Promise.resolve(instance[command].apply(instance, arg));
			}

			listen<T>(): Event<T> {
				throw new Error('Method not implemented.');
			}
		};

		this.server.registerChannel(`rpc${identifier.nid}`, channel);
		this.identifiers.add(identifier.nid);
		return instance;
	}

	assertRegistered(identifiers: ProxyIdentifier<any>[]): void {
		for (let i = 0, len = identifiers.length; i < len; i++) {
			const identifier = identifiers[i];

			if (!this.identifiers.has(identifier.nid)) {
				throw new Error(`Missing actor ${identifier.sid} (isMain: ${identifier.isMain})`);
			}
		}
	}
}