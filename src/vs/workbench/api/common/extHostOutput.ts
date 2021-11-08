/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadOutputServiceShape, ExtHostOutputServiceShape } from './extHost.protocol';
import type * as vscode from 'vscode';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { checkProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';

export abstract class AbstractExtHostOutputChannel extends Disposable implements vscode.OutputChannel {

	readonly _id: Promise<string>;
	private readonly _name: string;
	protected readonly _proxy: MainThreadOutputServiceShape;

	private _disposed: boolean;
	get disposed(): boolean { return this._disposed; }

	public visible: boolean = false;

	constructor(name: string, log: boolean, file: URI | undefined, extensionId: string, proxy: MainThreadOutputServiceShape) {
		super();

		this._name = name;
		this._proxy = proxy;
		this._id = proxy.$register(this.name, log, file, extensionId);
		this._disposed = false;
	}

	get name(): string {
		return this._name;
	}

	appendLine(value: string): void {
		this.append(value + '\n');
	}

	show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		this._id.then(id => this._proxy.$reveal(id, !!(typeof columnOrPreserveFocus === 'boolean' ? columnOrPreserveFocus : preserveFocus)));
	}

	hide(): void {
		this._id.then(id => this._proxy.$close(id));
	}

	override dispose(): void {
		super.dispose();

		if (!this._disposed) {
			this._id
				.then(id => this._proxy.$dispose(id))
				.then(() => this._disposed = true);
		}
	}

	abstract append(value: string): void;
	abstract clear(): void;
	abstract replace(value: string): void;
}

export class ExtHostPushOutputChannel extends AbstractExtHostOutputChannel {

	constructor(name: string, extensionId: string, proxy: MainThreadOutputServiceShape) {
		super(name, false, undefined, extensionId, proxy);
	}

	append(value: string): void {
		this._id.then(id => this._proxy.$append(id, value));
	}

	clear(): void {
		this._id.then(id => this._proxy.$clear(id));
	}

	replace(value: string): void {
		this._id.then(id => this._proxy.$replace(id, value));
	}

}

export class ExtHostOutputService implements ExtHostOutputServiceShape {

	readonly _serviceBrand: undefined;

	protected readonly _proxy: MainThreadOutputServiceShape;
	private readonly _channels: Map<string, AbstractExtHostOutputChannel> = new Map<string, AbstractExtHostOutputChannel>();
	private visibleChannelId: string | null = null;

	constructor(@IExtHostRpcService extHostRpc: IExtHostRpcService) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadOutputService);
	}

	$setVisibleChannel(visibleChannelId: string | null): void {
		this.visibleChannelId = visibleChannelId;
		for (const [id, channel] of this._channels) {
			channel.visible = id === this.visibleChannelId;
		}
	}

	createOutputChannel(name: string, extension: IExtensionDescription): vscode.OutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		}
		const extHostOutputChannel = this.doCreateOutChannel(name, extension);
		extHostOutputChannel.then(channel => channel._id.then(id => {
			this._channels.set(id, channel);
			channel.visible = id === this.visibleChannelId;
		}));
		return this.createExtHostOutputChannel(name, extHostOutputChannel, extension);
	}

	protected async doCreateOutChannel(name: string, extension: IExtensionDescription): Promise<AbstractExtHostOutputChannel> {
		return new ExtHostPushOutputChannel(name, extension.identifier.value, this._proxy);
	}

	private createExtHostOutputChannel(name: string, channelPromise: Promise<AbstractExtHostOutputChannel>, extensionDescription: IExtensionDescription): vscode.OutputChannel {
		const validate = (channel: AbstractExtHostOutputChannel, checkProposedApi?: boolean) => {
			if (checkProposedApi) {
				checkProposedApiEnabled(extensionDescription);
			}
			if (channel.disposed) {
				throw new Error('Channel has been closed');
			}
		};
		return {
			get name(): string { return name; },
			append(value: string): void {
				channelPromise.then(channel => {
					validate(channel);
					channel.append(value);
				});
			},
			appendLine(value: string): void {
				channelPromise.then(channel => {
					validate(channel);
					channel.appendLine(value);
				});
			},
			clear(): void {
				channelPromise.then(channel => {
					validate(channel);
					channel.clear();
				});
			},
			replace(value: string): void {
				channelPromise.then(channel => {
					validate(channel, true);
					channel.replace(value);
				});
			},
			show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
				channelPromise.then(channel => {
					validate(channel);
					channel.show(columnOrPreserveFocus, preserveFocus);
				});
			},
			hide(): void {
				channelPromise.then(channel => {
					validate(channel);
					channel.hide();
				});
			},
			dispose(): void {
				channelPromise.then(channel => {
					validate(channel);
					channel.dispose();
				});
			}
		};
	}
}

export interface IExtHostOutputService extends ExtHostOutputService { }
export const IExtHostOutputService = createDecorator<IExtHostOutputService>('IExtHostOutputService');
