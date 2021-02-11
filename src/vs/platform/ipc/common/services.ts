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
		channelClientCtor: ChannelClientCtor<T> | undefined,
		remote: Remote
	) {
		const channel = remote.getChannel(channelName);

		if (channelClientCtor) {
			return new channelClientCtor(channel);
		} else {
			return ProxyChannel.toService(channel);
		}
	}
}

export interface IRemoteServiceOptions<T> {
	readonly channelClientCtor?: ChannelClientCtor<T>;
	readonly supportsDelayedInstantiation?: boolean;
}

//#region Main Process

export const IMainProcessService = createDecorator<IMainProcessService>('mainProcessService');

export interface IMainProcessService {
	readonly _serviceBrand: undefined;
	getChannel(channelName: string): IChannel;
	registerChannel(channelName: string, channel: IServerChannel<string>): void;
}

class MainProcessRemoteServiceStub<T> extends RemoteServiceStub<T> {
	constructor(channelName: string, channelClientCtor: ChannelClientCtor<T> | undefined, @IMainProcessService ipcService: IMainProcessService) {
		super(channelName, channelClientCtor, ipcService);
	}
}

export function registerMainProcessRemoteService<T>(id: ServiceIdentifier<T>, channelName: string, options: IRemoteServiceOptions<T> = {}): void {
	registerSingleton(id, new SyncDescriptor(MainProcessRemoteServiceStub, [channelName, options.channelClientCtor], options.supportsDelayedInstantiation));
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
	constructor(channelName: string, channelClientCtor: ChannelClientCtor<T> | undefined, @ISharedProcessService ipcService: ISharedProcessService) {
		super(channelName, channelClientCtor, ipcService);
	}
}

export function registerSharedProcessRemoteService<T>(id: ServiceIdentifier<T>, channelName: string, options: IRemoteServiceOptions<T> = {}): void {
	registerSingleton(id, new SyncDescriptor(SharedProcessRemoteServiceStub, [channelName, options.channelClientCtor], options.supportsDelayedInstantiation));
}

//#endregion
