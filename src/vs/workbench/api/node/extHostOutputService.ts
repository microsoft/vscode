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
import { AbstractExtHostOutputChannel, ExtHostOutputService as BaseExtHostOutputService } from 'vs/workbench/api/common/extHostOutput';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { ILogService } from 'vs/platform/log/common/log';
import { createRotatingLogger } from 'vs/platform/log/node/spdlogLog';
import { Logger } from 'spdlog';
import { ByteSize } from 'vs/platform/files/common/files';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { OutputChannelUpdateMode } from 'vs/workbench/contrib/output/common/output';
import { VSBuffer } from 'vs/base/common/buffer';

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

	private _offset: number;
	private readonly _appender: OutputAppender;

	constructor(name: string, appender: OutputAppender, extensionId: string, proxy: MainThreadOutputServiceShape) {
		super(name, false, URI.file(appender.file), extensionId, proxy);
		this._offset = 0;
		this._appender = appender;
	}

	append(value: string): void {
		this.incrementOffset(value);
		this._appender.append(value);
		if (this.visible) {
			this._appender.flush();
			this._id.then(id => this._proxy.$update(id, OutputChannelUpdateMode.Append));
		}
	}

	clear(): void {
		const till = this._offset;
		this._appender.flush();
		this._id.then(id => this._proxy.$update(id, OutputChannelUpdateMode.Clear, till));
	}

	replace(value: string): void {
		const till = this._offset;
		this.incrementOffset(value);
		this._id.then(id => this._proxy.$update(id, OutputChannelUpdateMode.Replace, till));
		this._appender.append(value);
		if (this.visible) {
			this._appender.flush();
		}
	}

	override show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		this._appender.flush();
		super.show(columnOrPreserveFocus, preserveFocus);
	}

	private incrementOffset(value: string) {
		this._offset += VSBuffer.fromString(value).byteLength;
	}

}

export class ExtHostOutputService extends BaseExtHostOutputService {

	private _logsLocation: URI;
	private _namePool: number = 1;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@ILogService private readonly logService: ILogService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
	) {
		super(extHostRpc);
		this._logsLocation = initData.logsLocation;
	}

	protected override async doCreateOutChannel(name: string, extension: IExtensionDescription): Promise<AbstractExtHostOutputChannel> {
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
		}
		return super.doCreateOutChannel(name, extension);
	}
}
