/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadOutputServiceShape, ExtHostOutputServiceShape } from './extHost.protocol.js';
import type * as vscode from 'vscode';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { AbstractMessageLogger, ILogger, ILoggerService, ILogService, log, LogLevel } from '../../../platform/log/common/log.js';
import { OutputChannelUpdateMode } from '../../services/output/common/output.js';
import { IExtHostConsumerFileSystem } from './extHostFileSystemConsumer.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IExtHostFileSystemInfo } from './extHostFileSystemInfo.js';
import { toLocalISOString } from '../../../base/common/date.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { isString } from '../../../base/common/types.js';
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from '../../../platform/files/common/files.js';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';

class ExtHostOutputChannel extends AbstractMessageLogger implements vscode.LogOutputChannel {

	private offset: number = 0;

	public visible: boolean = false;

	constructor(
		readonly id: string,
		readonly name: string,
		protected readonly logger: ILogger,
		protected readonly proxy: MainThreadOutputServiceShape,
		readonly extension: IExtensionDescription,
	) {
		super();
		this.setLevel(logger.getLevel());
		this._register(logger.onDidChangeLogLevel(level => this.setLevel(level)));
		this._register(toDisposable(() => this.proxy.$dispose(this.id)));
	}

	get logLevel(): LogLevel {
		return this.getLevel();
	}

	appendLine(value: string): void {
		this.append(value + '\n');
	}

	append(value: string): void {
		this.info(value);
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
		if (this.visible) {
			this.logger.flush();
			this.proxy.$update(this.id, OutputChannelUpdateMode.Append);
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
	private readonly extensionLogDirectoryCreationPromise = new ResourceMap<Thenable<void>>();
	private readonly logOutputChannels = new ResourceMap<vscode.OutputChannel>();
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
		const languageId = isString(options) ? options : undefined;
		if (isString(languageId) && !languageId.trim()) {
			throw new Error('illegal argument `languageId`. must not be empty');
		}

		const channelDisposables = new DisposableStore();
		let extHostOutputChannelPromise;
		let logLevel = this.initData.environment.extensionLogLevel?.find(([identifier]) => ExtensionIdentifier.equals(extension.identifier, identifier))?.[1];
		let logFile: URI | undefined;
		if (log) {
			const extensionLogDirectory = this.extHostFileSystemInfo.extUri.joinPath(this.initData.logsLocation, extension.identifier.value);
			logFile = this.extHostFileSystemInfo.extUri.joinPath(extensionLogDirectory, `${name.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
			const existingOutputChannel = this.logOutputChannels.get(logFile);
			if (existingOutputChannel) {
				return existingOutputChannel;
			}
			logLevel = this.loggerService.getLogLevel(logFile) ?? logLevel;
			extHostOutputChannelPromise = this.doCreateLogOutputChannel(name, logFile, logLevel, extension, channelDisposables);
		} else {
			extHostOutputChannelPromise = this.doCreateOutputChannel(name, languageId, extension, channelDisposables);
		}

		extHostOutputChannelPromise.then(channel => {
			this.channels.set(channel.id, channel);
			channel.visible = channel.id === this.visibleChannelId;
			channelDisposables.add(toDisposable(() => {
				this.channels.delete(channel.id);
				if (logFile) {
					this.logOutputChannels.delete(logFile);
				}
			}));
		});

		if (logFile) {
			const logOutputChannel = this.createExtHostLogOutputChannel(name, logLevel ?? this.logService.getLevel(), <Promise<ExtHostOutputChannel>>extHostOutputChannelPromise, channelDisposables);
			this.logOutputChannels.set(logFile, logOutputChannel);
			return logOutputChannel;
		}
		return this.createExtHostOutputChannel(name, <Promise<ExtHostOutputChannel>>extHostOutputChannelPromise, channelDisposables);
	}

	private async doCreateOutputChannel(name: string, languageId: string | undefined, extension: IExtensionDescription, channelDisposables: DisposableStore): Promise<ExtHostOutputChannel> {
		if (!this.outputDirectoryPromise) {
			this.outputDirectoryPromise = this.extHostFileSystem.value.createDirectory(this.outputsLocation).then(() => this.outputsLocation);
		}
		const outputDir = await this.outputDirectoryPromise;
		const file = this.extHostFileSystemInfo.extUri.joinPath(outputDir, `${this.namePool++}-${name.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
		const logger = channelDisposables.add(this.loggerService.createLogger(file, { logLevel: 'always', donotRotate: true, donotUseFormatters: true, hidden: true }));
		const id = await this.proxy.$register(name, file, languageId, extension.identifier.value);
		channelDisposables.add(toDisposable(() => this.loggerService.deregisterLogger(file)));
		return new ExtHostOutputChannel(id, name, logger, this.proxy, extension);
	}

	private async doCreateLogOutputChannel(name: string, file: URI, logLevel: LogLevel | undefined, extension: IExtensionDescription, channelDisposables: DisposableStore): Promise<ExtHostLogOutputChannel> {
		await this.createExtensionLogDirectory(file);
		const id = `${extension.identifier.value}.${this.extHostFileSystemInfo.extUri.basename(file)}`;
		const logger = channelDisposables.add(this.loggerService.createLogger(file, { id, name, logLevel, extensionId: extension.identifier.value }));
		channelDisposables.add(toDisposable(() => this.loggerService.deregisterLogger(file)));
		return new ExtHostLogOutputChannel(id, name, logger, this.proxy, extension);
	}

	private createExtensionLogDirectory(file: URI): Thenable<void> {
		const extensionLogDirectory = this.extHostFileSystemInfo.extUri.dirname(file);
		let extensionLogDirectoryPromise = this.extensionLogDirectoryCreationPromise.get(extensionLogDirectory);
		if (!extensionLogDirectoryPromise) {
			this.extensionLogDirectoryCreationPromise.set(extensionLogDirectory, extensionLogDirectoryPromise = (async () => {
				try {
					await this.extHostFileSystem.value.createDirectory(extensionLogDirectory);
				} catch (err) {
					if (toFileSystemProviderErrorCode(err) !== FileSystemProviderErrorCode.FileExists) {
						throw err;
					}
				}
			})());
		}
		return extensionLogDirectoryPromise;
	}

	private createExtHostOutputChannel(name: string, channelPromise: Promise<ExtHostOutputChannel>, channelDisposables: DisposableStore): vscode.OutputChannel {
		const validate = () => {
			if (channelDisposables.isDisposed) {
				throw new Error('Channel has been closed');
			}
		};
		channelPromise.then(channel => channelDisposables.add(channel));
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
				channelDisposables.dispose();
			}
		};
	}

	private createExtHostLogOutputChannel(name: string, logLevel: LogLevel, channelPromise: Promise<ExtHostOutputChannel>, channelDisposables: DisposableStore): vscode.LogOutputChannel {
		const validate = () => {
			if (channelDisposables.isDisposed) {
				throw new Error('Channel has been closed');
			}
		};
		const onDidChangeLogLevel = channelDisposables.add(new Emitter<LogLevel>());
		function setLogLevel(newLogLevel: LogLevel): void {
			logLevel = newLogLevel;
			onDidChangeLogLevel.fire(newLogLevel);
		}
		channelPromise.then(channel => {
			if (channel.logLevel !== logLevel) {
				setLogLevel(channel.logLevel);
			}
			channelDisposables.add(channel.onDidChangeLogLevel(e => setLogLevel(e)));
		});
		return {
			...this.createExtHostOutputChannel(name, channelPromise, channelDisposables),
			get logLevel() { return logLevel; },
			onDidChangeLogLevel: onDidChangeLogLevel.event,
			trace(value: string, ...args: unknown[]): void {
				validate();
				channelPromise.then(channel => channel.trace(value, ...args));
			},
			debug(value: string, ...args: unknown[]): void {
				validate();
				channelPromise.then(channel => channel.debug(value, ...args));
			},
			info(value: string, ...args: unknown[]): void {
				validate();
				channelPromise.then(channel => channel.info(value, ...args));
			},
			warn(value: string, ...args: unknown[]): void {
				validate();
				channelPromise.then(channel => channel.warn(value, ...args));
			},
			error(value: Error | string, ...args: unknown[]): void {
				validate();
				channelPromise.then(channel => channel.error(value, ...args));
			}
		};
	}
}

export interface IExtHostOutputService extends ExtHostOutputService { }
export const IExtHostOutputService = createDecorator<IExtHostOutputService>('IExtHostOutputService');
