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
import { ILogger, ILoggerService } from 'vs/platform/log/common/log';
import { OutputChannelUpdateMode } from 'vs/workbench/contrib/output/common/output';
import { IExtHostConsumerFileSystem } from 'vs/workbench/api/common/extHostFileSystemConsumer';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IExtHostFileSystemInfo } from 'vs/workbench/api/common/extHostFileSystemInfo';
import { toLocalISOString } from 'vs/base/common/date';
import { VSBuffer } from 'vs/base/common/buffer';

export class ExtHostOutputChannel extends Disposable implements vscode.OutputChannel {

	private offset: number = 0;
	public visible: boolean = false;

	private _disposed: boolean = false;
	get disposed(): boolean { return this._disposed; }

	constructor(
		readonly id: string, readonly name: string,
		private readonly logger: ILogger,
		private readonly proxy: MainThreadOutputServiceShape
	) {
		super();
	}

	appendLine(value: string): void {
		this.append(value + '\n');
	}

	append(value: string): void {
		this.write(value);
		if (this.visible) {
			this.logger.flush();
			this.proxy.$update(this.id, OutputChannelUpdateMode.Append);
		}
	}

	clear(): void {
		const till = this.offset;
		this.logger.flush();
		this.proxy.$update(this.id, OutputChannelUpdateMode.Clear, till);
	}

	replace(value: string): void {
		const till = this.offset;
		this.write(value);
		this.proxy.$update(this.id, OutputChannelUpdateMode.Replace, till);
		if (this.visible) {
			this.logger.flush();
		}
	}

	show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		this.logger.flush();
		this.proxy.$reveal(this.id, !!(typeof columnOrPreserveFocus === 'boolean' ? columnOrPreserveFocus : preserveFocus));
	}

	hide(): void {
		this.proxy.$close(this.id);
	}

	private write(value: string): void {
		this.offset += VSBuffer.fromString(value).byteLength;
		this.logger.info(value);
	}

	override dispose(): void {
		super.dispose();

		if (!this._disposed) {
			this.proxy.$dispose(this.id);
			this._disposed = true;
		}
	}

}

export class ExtHostOutputService implements ExtHostOutputServiceShape {

	readonly _serviceBrand: undefined;

	private readonly proxy: MainThreadOutputServiceShape;

	private readonly outputsLocation: URI;
	private outputDirectoryPromise: Thenable<URI> | undefined;
	private namePool: number = 1;

	private readonly channels: Map<string, ExtHostOutputChannel> = new Map<string, ExtHostOutputChannel>();
	private visibleChannelId: string | null = null;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtHostConsumerFileSystem private readonly extHostFileSystem: IExtHostConsumerFileSystem,
		@IExtHostFileSystemInfo private readonly extHostFileSystemInfo: IExtHostFileSystemInfo,
		@ILoggerService private readonly loggerService: ILoggerService,
	) {
		this.proxy = extHostRpc.getProxy(MainContext.MainThreadOutputService);
		this.outputsLocation = this.extHostFileSystemInfo.extUri.joinPath(initData.logsLocation, `output_logging_${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}`);
	}

	$setVisibleChannel(visibleChannelId: string | null): void {
		this.visibleChannelId = visibleChannelId;
		for (const [id, channel] of this.channels) {
			channel.visible = id === this.visibleChannelId;
		}
	}

	createOutputChannel(name: string, extension: IExtensionDescription): vscode.OutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		}
		const extHostOutputChannel = this.doCreateOutputChannel(name, extension);
		extHostOutputChannel.then(channel => {
			this.channels.set(channel.id, channel);
			channel.visible = channel.id === this.visibleChannelId;
		});
		return this.createExtHostOutputChannel(name, extHostOutputChannel);
	}

	private async doCreateOutputChannel(name: string, extension: IExtensionDescription): Promise<ExtHostOutputChannel> {
		const outputDir = await this.createOutputDirectory();
		const file = this.extHostFileSystemInfo.extUri.joinPath(outputDir, `${this.namePool++}-${name.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
		const logger = this.loggerService.createLogger(file, { always: true, donotRotate: true, donotUseFormatters: true });
		const id = await this.proxy.$register(name, false, file, extension.identifier.value);
		return new ExtHostOutputChannel(id, name, logger, this.proxy);
	}

	private createOutputDirectory(): Thenable<URI> {
		if (!this.outputDirectoryPromise) {
			this.outputDirectoryPromise = this.extHostFileSystem.value.createDirectory(this.outputsLocation).then(() => this.outputsLocation);
		}
		return this.outputDirectoryPromise;
	}

	private createExtHostOutputChannel(name: string, channelPromise: Promise<ExtHostOutputChannel>): vscode.OutputChannel {
		let disposed = false;
		const validate = () => {
			if (disposed) {
				throw new Error('Channel has been closed');
			}
		};
		return {
			get name(): string { return name; },
			append(value: string): void {
				validate();
				channelPromise.then(channel => channel.append(value));
			},
			appendLine(value: string): void {
				validate();
				channelPromise.then(channel => channel.appendLine(value));
			},
			clear(): void {
				validate();
				channelPromise.then(channel => channel.clear());
			},
			replace(value: string): void {
				validate();
				channelPromise.then(channel => channel.replace(value));
			},
			show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
				validate();
				channelPromise.then(channel => channel.show(columnOrPreserveFocus, preserveFocus));
			},
			hide(): void {
				validate();
				channelPromise.then(channel => channel.hide());
			},
			dispose(): void {
				disposed = true;
				channelPromise.then(channel => channel.dispose());
			}
		};
	}
}

export interface IExtHostOutputService extends ExtHostOutputService { }
export const IExtHostOutputService = createDecorator<IExtHostOutputService>('IExtHostOutputService');
