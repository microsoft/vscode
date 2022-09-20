/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadOutputServiceShape, ExtHostOutputServiceShape } from './extHost.protocol';
import type * as vscode from 'vscode';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { AbstractMessageLogger, ILogger, ILoggerService, log, LogLevel } from 'vs/platform/log/common/log';
import { OutputChannelUpdateMode } from 'vs/workbench/services/output/common/output';
import { IExtHostConsumerFileSystem } from 'vs/workbench/api/common/extHostFileSystemConsumer';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IExtHostFileSystemInfo } from 'vs/workbench/api/common/extHostFileSystemInfo';
import { toLocalISOString } from 'vs/base/common/date';
import { VSBuffer } from 'vs/base/common/buffer';
import { isString } from 'vs/base/common/types';

export class ExtHostLogOutputChannel extends AbstractMessageLogger implements vscode.LogOutputChannel {

	private _disposed: boolean = false;
	get disposed(): boolean { return this._disposed; }

	public visible: boolean = false;

	constructor(
		readonly id: string, readonly name: string,
		protected readonly logger: ILogger,
		protected readonly proxy: MainThreadOutputServiceShape,
		readonly extension: IExtensionDescription,
	) {
		super();
	}

	appendLine(value: string): void {
		this.info(value);
	}

	show(preserveFocus?: boolean): void {
		this.proxy.$reveal(this.id, !!preserveFocus);
	}

	hide(): void {
		this.proxy.$close(this.id);
	}

	protected log(level: LogLevel, message: string): void {
		log(this.logger, level, message);
	}

	override dispose(): void {
		super.dispose();

		if (!this._disposed) {
			this.proxy.$dispose(this.id);
			this._disposed = true;
		}
	}

}

export class ExtHostOutputChannel extends ExtHostLogOutputChannel implements vscode.OutputChannel {

	private offset: number = 0;

	constructor(
		id: string, name: string,
		logger: ILogger,
		proxy: MainThreadOutputServiceShape,
		extension: IExtensionDescription
	) {
		super(id, name, logger, proxy, extension);
	}

	override appendLine(value: string): void {
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

	override show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		this.logger.flush();
		super.show(!!(typeof columnOrPreserveFocus === 'boolean' ? columnOrPreserveFocus : preserveFocus));
	}

	private write(value: string): void {
		this.offset += VSBuffer.fromString(value).byteLength;
		this.logger.info(value);
	}

}

export class ExtHostOutputService implements ExtHostOutputServiceShape {

	readonly _serviceBrand: undefined;

	private readonly proxy: MainThreadOutputServiceShape;

	private readonly outputsLocation: URI;
	private outputDirectoryPromise: Thenable<URI> | undefined;
	private namePool: number = 1;

	private readonly channels = new Map<string, ExtHostLogOutputChannel | ExtHostOutputChannel>();
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

	createOutputChannel(name: string, options: string | { log: true } | undefined, extension: IExtensionDescription): vscode.OutputChannel | vscode.LogOutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		}
		const log = typeof options === 'object' && options.log;
		const languageId = isString(options) ? options : undefined;
		if (isString(languageId) && !languageId.trim()) {
			throw new Error('illegal argument `languageId`. must not be empty');
		}
		const extHostOutputChannel = log ? this.doCreateLogOutputChannel(name, extension) : this.doCreateOutputChannel(name, languageId, extension);
		extHostOutputChannel.then(channel => {
			this.channels.set(channel.id, channel);
			channel.visible = channel.id === this.visibleChannelId;
		});
		return log ? this.createExtHostLogOutputChannel(name, <Promise<ExtHostOutputChannel>>extHostOutputChannel) : this.createExtHostOutputChannel(name, <Promise<ExtHostOutputChannel>>extHostOutputChannel);
	}

	private async doCreateOutputChannel(name: string, languageId: string | undefined, extension: IExtensionDescription): Promise<ExtHostOutputChannel> {
		const file = await this.createLogFile(name);
		const logger = this.loggerService.createLogger(file, { always: true, donotRotate: true, donotUseFormatters: true });
		const id = await this.proxy.$register(name, file, false, languageId, extension.identifier.value);
		return new ExtHostOutputChannel(id, name, logger, this.proxy, extension);
	}

	private async doCreateLogOutputChannel(name: string, extension: IExtensionDescription): Promise<ExtHostLogOutputChannel> {
		const file = await this.createLogFile(name);
		const logger = this.loggerService.createLogger(file, { name });
		const id = await this.proxy.$register(name, file, true, undefined, extension.identifier.value);
		return new ExtHostLogOutputChannel(id, name, logger, this.proxy, extension);
	}

	private async createLogFile(name: string): Promise<URI> {
		if (!this.outputDirectoryPromise) {
			this.outputDirectoryPromise = this.extHostFileSystem.value.createDirectory(this.outputsLocation).then(() => this.outputsLocation);
		}
		const outputDir = await this.outputDirectoryPromise;
		return this.extHostFileSystemInfo.extUri.joinPath(outputDir, `${this.namePool++}-${name.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
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

	private createExtHostLogOutputChannel(name: string, channelPromise: Promise<ExtHostOutputChannel>): vscode.LogOutputChannel {
		let disposed = false;
		const validate = () => {
			if (disposed) {
				throw new Error('Channel has been closed');
			}
		};
		return {
			get name(): string { return name; },
			appendLine(value: string): void {
				validate();
				channelPromise.then(channel => channel.appendLine(value));
			},
			trace(value: string): void {
				validate();
				channelPromise.then(channel => channel.info(value));
			},
			debug(value: string): void {
				validate();
				channelPromise.then(channel => channel.debug(value));
			},
			info(value: string): void {
				validate();
				channelPromise.then(channel => channel.info(value));
			},
			warn(value: string): void {
				validate();
				channelPromise.then(channel => channel.warn(value));
			},
			error(value: Error | string): void {
				validate();
				channelPromise.then(channel => channel.error(value));
			},
			show(preserveFocus?: boolean): void {
				validate();
				channelPromise.then(channel => channel.show(preserveFocus));
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
