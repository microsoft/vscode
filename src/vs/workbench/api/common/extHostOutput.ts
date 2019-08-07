/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadOutputServiceShape, IMainContext, ExtHostOutputServiceShape } from './extHost.protocol';
import * as vscode from 'vscode';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { VSBuffer } from 'vs/base/common/buffer';

export abstract class AbstractExtHostOutputChannel extends Disposable implements vscode.OutputChannel {

	readonly _id: Promise<string>;
	private readonly _name: string;
	protected readonly _proxy: MainThreadOutputServiceShape;
	private _disposed: boolean;
	private _offset: number;

	protected readonly _onDidAppend: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidAppend: Event<void> = this._onDidAppend.event;

	constructor(name: string, log: boolean, file: URI | undefined, proxy: MainThreadOutputServiceShape) {
		super();

		this._name = name;
		this._proxy = proxy;
		this._id = proxy.$register(this.name, log, file);
		this._disposed = false;
		this._offset = 0;
	}

	get name(): string {
		return this._name;
	}

	append(value: string): void {
		this.validate();
		this._offset += value ? VSBuffer.fromString(value).byteLength : 0;
	}

	update(): void {
		this._id.then(id => this._proxy.$update(id));
	}

	appendLine(value: string): void {
		this.validate();
		this.append(value + '\n');
	}

	clear(): void {
		this.validate();
		const till = this._offset;
		this._id.then(id => this._proxy.$clear(id, till));
	}

	show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		this.validate();
		this._id.then(id => this._proxy.$reveal(id, !!(typeof columnOrPreserveFocus === 'boolean' ? columnOrPreserveFocus : preserveFocus)));
	}

	hide(): void {
		this.validate();
		this._id.then(id => this._proxy.$close(id));
	}

	protected validate(): void {
		if (this._disposed) {
			throw new Error('Channel has been closed');
		}
	}

	dispose(): void {
		super.dispose();

		if (!this._disposed) {
			this._id
				.then(id => this._proxy.$dispose(id))
				.then(() => this._disposed = true);
		}
	}
}

export class ExtHostPushOutputChannel extends AbstractExtHostOutputChannel {

	constructor(name: string, proxy: MainThreadOutputServiceShape) {
		super(name, false, undefined, proxy);
	}

	append(value: string): void {
		super.append(value);
		this._id.then(id => this._proxy.$append(id, value));
		this._onDidAppend.fire();
	}
}

class ExtHostLogFileOutputChannel extends AbstractExtHostOutputChannel {

	constructor(name: string, file: URI, proxy: MainThreadOutputServiceShape) {
		super(name, true, file, proxy);
	}

	append(value: string): void {
		throw new Error('Not supported');
	}
}

export interface IOutputChannelFactory {
	createOutputChannel(name: string, logsLocation: URI, proxy: MainThreadOutputServiceShape): Promise<AbstractExtHostOutputChannel>;
}

export const PushOutputChannelFactory = new class implements IOutputChannelFactory {
	async createOutputChannel(name: string, _logsLocation: URI, proxy: MainThreadOutputServiceShape): Promise<AbstractExtHostOutputChannel> {
		return new ExtHostPushOutputChannel(name, proxy);
	}
};

export class ExtHostOutputService implements ExtHostOutputServiceShape {

	private readonly _factory: IOutputChannelFactory;
	private readonly _logsLocation: URI;
	private readonly _proxy: MainThreadOutputServiceShape;
	private readonly _channels: Map<string, AbstractExtHostOutputChannel> = new Map<string, AbstractExtHostOutputChannel>();
	private _visibleChannelDisposable?: IDisposable;

	constructor(factory: IOutputChannelFactory, logsLocation: URI, mainContext: IMainContext) {
		this._factory = factory;
		this._logsLocation = logsLocation;
		this._proxy = mainContext.getProxy(MainContext.MainThreadOutputService);
	}

	$setVisibleChannel(channelId: string): void {
		if (this._visibleChannelDisposable) {
			this._visibleChannelDisposable = dispose(this._visibleChannelDisposable);
		}
		if (channelId) {
			const channel = this._channels.get(channelId);
			if (channel) {
				this._visibleChannelDisposable = channel.onDidAppend(() => channel.update());
			}
		}
	}

	createOutputChannel(name: string): vscode.OutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		} else {
			const extHostOutputChannel = this._factory.createOutputChannel(name, this._logsLocation, this._proxy);
			extHostOutputChannel.then(channel => channel._id.then(id => this._channels.set(id, channel)));
			return {
				get name(): string {
					return name;
				},
				append(value: string): void {
					extHostOutputChannel.then(channel => channel.append(value));
				},
				appendLine(value: string): void {
					extHostOutputChannel.then(channel => channel.appendLine(value));
				},
				clear(): void {
					extHostOutputChannel.then(channel => channel.clear());
				},
				show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
					extHostOutputChannel.then(channel => channel.show(columnOrPreserveFocus, preserveFocus));
				},
				hide(): void {
					extHostOutputChannel.then(channel => channel.hide());
				},
				dispose(): void {
					extHostOutputChannel.then(channel => channel.dispose());
				}
			};
		}
	}

	createOutputChannelFromLogFile(name: string, file: URI): vscode.OutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		}
		if (!file) {
			throw new Error('illegal argument `file`. must not be falsy');
		}
		return new ExtHostLogFileOutputChannel(name, file, this._proxy);
	}
}
