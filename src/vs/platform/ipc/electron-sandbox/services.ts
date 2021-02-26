/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

type ChannelClientCtor<T> = { new(channel: IChannel): T };
type Remote = { getChannel(channelName: string): IChannel; };

abstract class RemoteServiceStub<T> {
	constructor(
		channelName: string,
		options: IRemoteServiceWithChannelClientOptions<T> | IRemoteServiceWithProxyOptions | undefined,
		remote: Remote
	) {
		const channel = remote.getChannel(channelName);

		if (isRemoteServiceWithChannelClientOptions(options)) {
			return new options.channelClientCtor(channel);
		}

		return ProxyChannel.toService(channel, options?.proxyOptions);
	}
}

export interface IBaseRemoteServiceOptions {
	readonly supportsDelayedInstantiation?: boolean;
}

export interface IRemoteServiceWithChannelClientOptions<T> extends IBaseRemoteServiceOptions {
	readonly channelClientCtor: ChannelClientCtor<T>;
}

export interface IRemoteServiceWithProxyOptions extends IBaseRemoteServiceOptions {
	readonly proxyOptions?: ProxyChannel.ICreateProxyServiceOptions;
}

function isRemoteServiceWithChannelClientOptions<T>(obj: unknown): obj is IRemoteServiceWithChannelClientOptions<T> {
	const candidate = obj as IRemoteServiceWithChannelClientOptions<T> | undefined;

	return !!candidate?.channelClientCtor;
}

//#region Main Process

export const IMainProcessService = createDecorator<IMainProcessService>('mainProcessService');

export interface IMainProcessService {
	readonly _serviceBrand: undefined;
	getChannel(channelName: string): IChannel;
	registerChannel(channelName: string, channel: IServerChannel<string>): void;
}

class MainProcessRemoteServiceStub<T> extends RemoteServiceStub<T> {
	constructor(channelName: string, options: IRemoteServiceWithChannelClientOptions<T> | IRemoteServiceWithProxyOptions | undefined, @IMainProcessService ipcService: IMainProcessService) {
		super(channelName, options, ipcService);
	}
}

export function registerMainProcessRemoteService<T>(id: ServiceIdentifier<T>, channelName: string, options?: IRemoteServiceWithChannelClientOptions<T> | IRemoteServiceWithProxyOptions): void {
	registerSingleton(id, new SyncDescriptor(MainProcessRemoteServiceStub, [channelName, options], options?.supportsDelayedInstantiation));
}

//#endregion

//#region Shared Process

export const ISharedProcessService = createDecorator<ISharedProcessService>('sharedProcessService');

export interface ISharedProcessService {
	readonly _serviceBrand: undefined;
	getChannel(channelName: string): IChannel;
	registerChannel(channelName: string, channel: IServerChannel<string>): void;
}

class SharedProcessRemoteServiceStub<T> extends RemoteServiceStub<T> {
	constructor(channelName: string, options: IRemoteServiceWithChannelClientOptions<T> | IRemoteServiceWithProxyOptions | undefined, @ISharedProcessService ipcService: ISharedProcessService) {
		super(channelName, options, ipcService);
	}
}

export function registerSharedProcessRemoteService<T>(id: ServiceIdentifier<T>, channelName: string, options?: IRemoteServiceWithChannelClientOptions<T> | IRemoteServiceWithProxyOptions): void {
	registerSingleton(id, new SyncDescriptor(SharedProcessRemoteServiceStub, [channelName, options], options?.supportsDelayedInstantiation));
}

//#endregion
