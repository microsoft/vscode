/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainThreadOutputServiceShape } from '../common/extHost.protocol';
import type * as vscode from 'vscode';
import { URI } from 'vs/base/common/uri';
import { join } from 'vs/base/common/path';
import { toLocalISOString } from 'vs/base/common/date';
import { Promises, SymlinkSupport } from 'vs/base/node/pfs';
import { AbstractExtHostOutputChannel, ExtHostPushOutputChannel, ExtHostOutputService, LazyOutputChannel } from 'vs/workbench/api/common/extHostOutput';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { MutableDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { createRotatingLogger } from 'vs/platform/log/node/spdlogLog';
import { Logger } from 'spdlog';
import { ByteSize } from 'vs/platform/files/common/files';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';

class OutputAppender {

	static async create(name: string, file: string): Promise<OutputAppender> {
		const appender = await createRotatingLogger(name, file, 30 * ByteSize.MB, 1);
		appender.clearFormatters();

		return new OutputAppender(name, file, appender);
	}

	private constructor(readonly name: string, readonly file: string, private readonly appender: Logger) { }

	append(content: string): void {
		this.appender.critical(content);
	}

	flush(): void {
		this.appender.flush();
	}
}


class ExtHostOutputChannelBackedByFile extends AbstractExtHostOutputChannel {

	private _appender: OutputAppender;

	constructor(name: string, appender: OutputAppender, extensionId: string, proxy: MainThreadOutputServiceShape) {
		super(name, false, URI.file(appender.file), extensionId, proxy);
		this._appender = appender;
	}

	override append(value: string): void {
		super.append(value);
		this._appender.append(value);
		this._onDidAppend.fire();
	}

	override update(): void {
		this._appender.flush();
		super.update();
	}

	override show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		this._appender.flush();
		super.show(columnOrPreserveFocus, preserveFocus);
	}

	override clear(): void {
		this._appender.flush();
		super.clear();
	}
}

export class ExtHostOutputService2 extends ExtHostOutputService {

	private _logsLocation: URI;
	private _namePool: number = 1;
	private readonly _channels: Map<string, AbstractExtHostOutputChannel> = new Map<string, AbstractExtHostOutputChannel>();
	private readonly _visibleChannelDisposable = new MutableDisposable();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@ILogService private readonly logService: ILogService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
	) {
		super(extHostRpc);
		this._logsLocation = initData.logsLocation;
	}

	override $setVisibleChannel(channelId: string): void {
		if (channelId) {
			const channel = this._channels.get(channelId);
			if (channel) {
				this._visibleChannelDisposable.value = channel.onDidAppend(() => channel.update());
			}
		}
	}

	override createOutputChannel(name: string, extension: IExtensionDescription): vscode.OutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		}
		const extHostOutputChannel = this._doCreateOutChannel(name, extension);
		extHostOutputChannel.then(channel => channel._id.then(id => this._channels.set(id, channel)));
		return new LazyOutputChannel(name, extHostOutputChannel);
	}

	private async _doCreateOutChannel(name: string, extension: IExtensionDescription): Promise<AbstractExtHostOutputChannel> {
		try {
			const outputDirPath = join(this._logsLocation.fsPath, `output_logging_${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}`);
			const exists = await SymlinkSupport.existsDirectory(outputDirPath);
			if (!exists) {
				await Promises.mkdir(outputDirPath, { recursive: true });
			}
			const fileName = `${this._namePool++}-${name.replace(/[\\/:\*\?"<>\|]/g, '')}`;
			const file = URI.file(join(outputDirPath, `${fileName}.log`));
			const appender = await OutputAppender.create(fileName, file.fsPath);
			return new ExtHostOutputChannelBackedByFile(name, appender, extension.identifier.value, this._proxy);
		} catch (error) {
			// Do not crash if logger cannot be created
			this.logService.error(error);
			return new ExtHostPushOutputChannel(name, extension.identifier.value, this._proxy);
		}
	}
}
