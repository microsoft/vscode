/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadOutputServiceShape, ExtHostOutputServiceShape } from './extHost.protocol';
import type * as vscode from 'vscode';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { AbstractMessageLogger, ILogger, ILoggerService, ILogService, log, LogLevel, parseLogLevel } from 'vs/platform/log/common/log';
import { OutputChannelUpdateMode } from 'vs/workbench/services/output/common/output';
import { IExtHostConsumerFileSystem } from 'vs/workbench/api/common/extHostFileSystemConsumer';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IExtHostFileSystemInfo } from 'vs/workbench/api/common/extHostFileSystemInfo';
import { toLocalISOString } from 'vs/base/common/date';
import { VSBuffer } from 'vs/base/common/buffer';
import { isString } from 'vs/base/common/types';
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from 'vs/platform/files/common/files';
import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { checkProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';

class ExtHostOutputChannel extends AbstractMessageLogger implements vscode.LogOutputChannel {

	private offset: number = 0;

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
		this._register(logger.onDidChangeLogLevel(level => this.setLevel(level)));
	}

	get logLevel(): LogLevel {
		return this.logger.getLevel();
	}

	appendLine(value: string): void {
		this.append(value + '\n');
	}

	append(value: string): void {
		this.info(value);
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
		this.info(value);
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

	protected log(level: LogLevel, message: string): void {
		this.offset += VSBuffer.fromString(message).byteLength;
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

class ExtHostLogOutputChannel extends ExtHostOutputChannel {

	override appendLine(value: string): void {
		this.append(value);
	}

}

export class ExtHostOutputService implements ExtHostOutputServiceShape {

	readonly _serviceBrand: undefined;

	private readonly proxy: MainThreadOutputServiceShape;

	private readonly outputsLocation: URI;
	private outputDirectoryPromise: Thenable<URI> | undefined;
	private readonly extensionLogDirectoryPromise = new Map<string, Thenable<URI>>();
	private namePool: number = 1;

	private readonly channels = new Map<string, ExtHostLogOutputChannel | ExtHostOutputChannel>();
	private visibleChannelId: string | null = null;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService private readonly initData: IExtHostInitDataService,
		@IExtHostConsumerFileSystem private readonly extHostFileSystem: IExtHostConsumerFileSystem,
		@IExtHostFileSystemInfo private readonly extHostFileSystemInfo: IExtHostFileSystemInfo,
		@ILoggerService private readonly loggerService: ILoggerService,
		@ILogService private readonly logService: ILogService,
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
		if (log) {
			checkProposedApiEnabled(extension, 'extensionLog');
		}
		const languageId = isString(options) ? options : undefined;
		if (isString(languageId) && !languageId.trim()) {
			throw new Error('illegal argument `languageId`. must not be empty');
		}
		const logLevel = this.getDefaultLogLevel(extension);
		const extHostOutputChannel = log ? this.doCreateLogOutputChannel(name, logLevel, extension) : this.doCreateOutputChannel(name, languageId, extension);
		extHostOutputChannel.then(channel => {
			this.channels.set(channel.id, channel);
			channel.visible = channel.id === this.visibleChannelId;
		});
		return log ? this.createExtHostLogOutputChannel(name, logLevel, <Promise<ExtHostOutputChannel>>extHostOutputChannel) : this.createExtHostOutputChannel(name, <Promise<ExtHostOutputChannel>>extHostOutputChannel);
	}

	private async doCreateOutputChannel(name: string, languageId: string | undefined, extension: IExtensionDescription): Promise<ExtHostOutputChannel> {
		if (!this.outputDirectoryPromise) {
			this.outputDirectoryPromise = this.extHostFileSystem.value.createDirectory(this.outputsLocation).then(() => this.outputsLocation);
		}
		const outputDir = await this.outputDirectoryPromise;
		const file = this.extHostFileSystemInfo.extUri.joinPath(outputDir, `${this.namePool++}-${name.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
		const logger = this.loggerService.createLogger(file, { always: true, donotRotate: true, donotUseFormatters: true });
		const id = await this.proxy.$register(name, file, false, languageId, extension.identifier.value);
		return new ExtHostOutputChannel(id, name, logger, this.proxy, extension);
	}

	private async doCreateLogOutputChannel(name: string, logLevel: LogLevel, extension: IExtensionDescription): Promise<ExtHostLogOutputChannel> {
		const extensionLogDir = await this.createExtensionLogDirectory(extension);
		const file = this.extHostFileSystemInfo.extUri.joinPath(extensionLogDir, `${name.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
		const logger = this.loggerService.createLogger(file, { name }, logLevel);
		const id = await this.proxy.$register(name, file, true, undefined, extension.identifier.value);
		return new ExtHostLogOutputChannel(id, name, logger, this.proxy, extension);
	}

	private getDefaultLogLevel(extension: IExtensionDescription): LogLevel {
		let logLevel: LogLevel | undefined;
		const logLevelValue = this.initData.environment.extensionLogLevel?.find(([identifier]) => ExtensionIdentifier.equals(extension.identifier, identifier))?.[1];
		if (logLevelValue) {
			logLevel = parseLogLevel(logLevelValue);
		}
		return logLevel ?? this.logService.getLevel();
	}

	private createExtensionLogDirectory(extension: IExtensionDescription): Thenable<URI> {
		let extensionLogDirectoryPromise = this.extensionLogDirectoryPromise.get(extension.identifier.value);
		if (!extensionLogDirectoryPromise) {
			const extensionLogDirectory = this.extHostFileSystemInfo.extUri.joinPath(this.initData.logsLocation, extension.identifier.value);
			this.extensionLogDirectoryPromise.set(extension.identifier.value, extensionLogDirectoryPromise = (async () => {
				try {
					await this.extHostFileSystem.value.createDirectory(extensionLogDirectory);
				} catch (err) {
					if (toFileSystemProviderErrorCode(err) !== FileSystemProviderErrorCode.FileExists) {
						throw err;
					}
				}
				return extensionLogDirectory;
			})());
		}
		return extensionLogDirectoryPromise;
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

	private createExtHostLogOutputChannel(name: string, logLevel: LogLevel, channelPromise: Promise<ExtHostOutputChannel>): vscode.LogOutputChannel {
		const disposables = new DisposableStore();
		const validate = () => {
			if (disposables.isDisposed) {
				throw new Error('Channel has been closed');
			}
		};
		const onDidChangeLogLevel = disposables.add(new Emitter<LogLevel>());
		channelPromise.then(channel => {
			disposables.add(channel);
			disposables.add(channel.onDidChangeLogLevel(e => {
				logLevel = e;
				onDidChangeLogLevel.fire(e);
			}));
		});
		return {
			...this.createExtHostOutputChannel(name, channelPromise),
			get logLevel() { return logLevel; },
			onDidChangeLogLevel: onDidChangeLogLevel.event,
			trace(value: string, ...args: any[]): void {
				validate();
				channelPromise.then(channel => channel.trace(value, ...args));
			},
			debug(value: string, ...args: any[]): void {
				validate();
				channelPromise.then(channel => channel.debug(value, ...args));
			},
			info(value: string, ...args: any[]): void {
				validate();
				channelPromise.then(channel => channel.info(value, ...args));
			},
			warn(value: string, ...args: any[]): void {
				validate();
				channelPromise.then(channel => channel.warn(value, ...args));
			},
			error(value: Error | string, ...args: any[]): void {
				validate();
				channelPromise.then(channel => channel.error(value, ...args));
			},
			dispose(): void {
				disposables.dispose();
			}
		};
	}
}

export interface IExtHostOutputService extends ExtHostOutputService { }
export const IExtHostOutputService = createDecorator<IExtHostOutputService>('IExtHostOutputService');
