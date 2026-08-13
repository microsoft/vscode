/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { DataWatcherKind as InternalDataWatcherKind } from '../../../platform/dataChannel/common/dataChannel.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { AgentSessionStatus } from './extHostTypes.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtHostDataChannelsShape, MainContext, MainThreadDataChannelsShape } from './extHost.protocol.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';

export interface IExtHostDataChannels extends ExtHostDataChannelsShape {
	readonly _serviceBrand: undefined;
	createDataChannel<T>(extension: IExtensionDescription, channelId: string): vscode.DataChannel<T>;
	createDataWatcher<T extends vscode.DataWatcherParams>(extension: IExtensionDescription, params: T): vscode.DataWatcher<vscode.DataWatcherData<T>>;
}

export const IExtHostDataChannels = createDecorator<IExtHostDataChannels>('IExtHostDataChannels');

export class ExtHostDataChannels implements IExtHostDataChannels {
	declare readonly _serviceBrand: undefined;

	private readonly _channels = new Map<string, DataChannelImpl<any>>();
	private readonly _dataWatchers = new Map<number, { acceptData(data: unknown): void }>();
	private static _dataWatcherHandlePool = 0;
	private readonly _proxy: MainThreadDataChannelsShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadDataChannels);
	}

	createDataChannel<T>(extension: IExtensionDescription, channelId: string): vscode.DataChannel<T> {
		checkProposedApiEnabled(extension, 'dataChannels');

		let channel = this._channels.get(channelId);
		if (!channel) {
			channel = new DataChannelImpl<T>(channelId);
			this._channels.set(channelId, channel);
		}
		return channel;
	}

	createDataWatcher<T extends vscode.DataWatcherParams>(extension: IExtensionDescription, params: T): vscode.DataWatcher<vscode.DataWatcherData<T>> {
		checkProposedApiEnabled(extension, 'dataChannels');

		const handle = ExtHostDataChannels._dataWatcherHandlePool++;
		let watcher: DataWatcherImpl<vscode.AgentSessionData>;
		switch (params.kind) {
			case 0:
				watcher = new DataWatcherImpl(
					handle,
					this._proxy,
					parseAgentSessionData,
					disposedHandle => this._dataWatchers.delete(disposedHandle),
				);
				this._proxy.$createDataWatcher(handle, {
					kind: InternalDataWatcherKind.AgentSession,
					resource: params.resource,
				});
				break;
			default:
				throw new Error('Unknown data watcher kind');
		}
		this._dataWatchers.set(handle, watcher);
		return watcher;
	}

	$onDidReceiveData(channelId: string, data: any): void {
		const channel = this._channels.get(channelId);
		if (channel) {
			channel._fireDidReceiveData(data);
		}
	}

	$acceptDataWatcherData(handle: number, data: unknown): void {
		this._dataWatchers.get(handle)?.acceptData(data);
	}
}

class DataChannelImpl<T> extends Disposable implements vscode.DataChannel<T> {
	private readonly _onDidReceiveData = new Emitter<vscode.DataChannelEvent<T>>();
	public readonly onDidReceiveData: Event<vscode.DataChannelEvent<T>> = this._onDidReceiveData.event;

	constructor(private readonly channelId: string) {
		super();
		this._register(this._onDidReceiveData);
	}

	_fireDidReceiveData(data: T): void {
		this._onDidReceiveData.fire({ data });
	}

	override toString(): string {
		return `DataChannel(${this.channelId})`;
	}
}

function parseAgentSessionData(value: unknown): vscode.AgentSessionData {
	if (!isRecord(value)
		|| typeof value.title !== 'string'
		|| (value.description !== undefined && typeof value.description !== 'string')
	) {
		throw new Error('Invalid agent session data watcher payload');
	}
	const status = parseAgentSessionStatus(value.status);
	return {
		title: value.title,
		...(value.description ? { description: value.description } : {}),
		status,
	};
}

function parseAgentSessionStatus(value: unknown): AgentSessionStatus {
	switch (value) {
		case 'untitled': return AgentSessionStatus.Untitled;
		case 'inProgress': return AgentSessionStatus.InProgress;
		case 'needsInput': return AgentSessionStatus.NeedsInput;
		case 'completed': return AgentSessionStatus.Completed;
		case 'error': return AgentSessionStatus.Error;
		default: throw new Error('Invalid agent session status');
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object';
}

class DataWatcherImpl<T> extends Disposable implements vscode.DataWatcher<T> {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _data: T | undefined;
	get data(): T | undefined {
		return this._data;
	}

	constructor(
		handle: number,
		proxy: MainThreadDataChannelsShape,
		private readonly _parseData: (value: unknown) => T,
		onDispose: (handle: number) => void,
	) {
		super();
		this._register({
			dispose: () => {
				proxy.$disposeDataWatcher(handle);
				onDispose(handle);
			},
		});
	}

	acceptData(data: unknown): void {
		this._data = data === undefined ? undefined : this._parseData(data);
		this._onDidChange.fire();
	}
}
