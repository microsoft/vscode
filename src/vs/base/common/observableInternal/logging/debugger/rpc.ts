/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type ChannelFactory = (handler: IChannelHandler) => IChannel;

export interface IChannel {
	sendNotification(data: unknown): void;
	sendRequest(data: unknown): Promise<RpcRequestResult>;
}

export interface IChannelHandler {
	handleNotification(notificationData: unknown): void;
	handleRequest(requestData: unknown): Promise<RpcRequestResult> | RpcRequestResult;
}

export type RpcRequestResult = { type: 'result'; value: unknown } | { type: 'error'; value: unknown };

export type API = {
	host: Side;
	client: Side;
};

export type Side = {
	notifications: Record<string, (...args: any[]) => void>;
	requests: Record<string, (...args: any[]) => Promise<unknown> | unknown>;
};

type MakeAsyncIfNot<TFn> = TFn extends (...args: infer TArgs) => infer TResult ? TResult extends Promise<unknown> ? TFn : (...args: TArgs) => Promise<TResult> : never;

export type MakeSideAsync<T extends Side> = {
	notifications: T['notifications'];
	requests: { [K in keyof T['requests']]: MakeAsyncIfNot<T['requests'][K]> };
};

export class SimpleTypedRpcConnection<T extends Side> {
	public static createHost<T extends API>(channelFactory: ChannelFactory, getHandler: () => T['host']): SimpleTypedRpcConnection<MakeSideAsync<T['client']>> {
		return new SimpleTypedRpcConnection(channelFactory, getHandler);
	}

	public static createClient<T extends API>(channelFactory: ChannelFactory, getHandler: () => T['client']): SimpleTypedRpcConnection<MakeSideAsync<T['host']>> {
		return new SimpleTypedRpcConnection(channelFactory, getHandler);
	}

	public readonly api: T;
	private readonly _channel: IChannel;

	private constructor(
		private readonly _channelFactory: ChannelFactory,
		private readonly _getHandler: () => Side,
	) {
		this._channel = this._channelFactory({
			handleNotification: (notificationData) => {
				const m = notificationData as OutgoingMessage;
				const fn = this._getHandler().notifications[m[0]];
				if (!fn) {
					throw new Error(`Unknown notification "${m[0]}"!`);
				}
				fn(...m[1]);
			},
			handleRequest: (requestData) => {
				const m = requestData as OutgoingMessage;
				try {
					const result = this._getHandler().requests[m[0]](...m[1]);
					return { type: 'result', value: result };
				} catch (e) {
					return { type: 'error', value: e };
				}
			},
		});

		const requests = new Proxy({}, {
			get: (target, key: string) => {
				return async (...args: any[]) => {
					const result = await this._channel.sendRequest([key, args] satisfies OutgoingMessage);
					if (result.type === 'error') {
						throw result.value;
					} else {
						return result.value;
					}
				};
			}
		});

		const notifications = new Proxy({}, {
			get: (target, key: string) => {
				return (...args: any[]) => {
					this._channel.sendNotification([key, args] satisfies OutgoingMessage);
				};
			}
		});

		// eslint-disable-next-line local/code-no-any-casts
		this.api = { notifications: notifications, requests: requests } as any;
	}
}

type OutgoingMessage = [
	method: string,
	args: unknown[],
];
