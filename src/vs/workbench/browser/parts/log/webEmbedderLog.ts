/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogLevel, LogLevelToString } from 'vs/platform/log/common/log';
import { Registry } from 'vs/platform/registry/common/platform';
import { Disposable } from 'vs/base/common/lifecycle';
import { Extensions, IOutputChannel, IOutputChannelRegistry, IOutputService } from 'vs/workbench/services/output/common/output';

export class WebEmbedderLog extends Disposable {
	private _outputService: IOutputService;

	constructor(@IOutputService outputService: IOutputService) {
		super();
		this._outputService = outputService;
	}

	public async log(id: string, level: LogLevel, message: string) {
		const logger = await this.getEmbedderLogChannel();

		const logMessage = this.getLogMessage(id, level, message);
		logger.append(logMessage);
	}

	public override async dispose() {
		(await this.getEmbedderLogChannel()).dispose();
		super.dispose();
	}

	private async getEmbedderLogChannel(): Promise<IOutputChannel> {
		const id = 'webEmbedderLog';
		const label = 'vscode.dev';

		const channel = this._outputService.getChannel(id);
		if (channel) {
			return Promise.resolve(channel);
		}

		Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).registerChannel({ id, label, log: true });
		return this._outputService.getChannel(id)!;
	}

	private getLogMessage(id: string, level: LogLevel, message: string): string {
		return `[${this.getTimeStamp()}] [${id}] [${LogLevelToString(level)}] ${message}`;
	}

	private getTimeStamp(): string {
		const date = new Date();
		return `${date.getFullYear()}-${this.padZeros(date.getMonth(), 2)}-${this.padZeros(date.getDate(), 2)} ${this.padZeros(date.getHours(), 2)}:${this.padZeros(date.getMinutes(), 2)}:${this.padZeros(
			date.getSeconds(),
			2
		)}.${this.padZeros(date.getMilliseconds(), 3)}`;
	}

	private padZeros(n: number, size: number): string {
		return ('' + n).padStart(size, '0');
	}
}
