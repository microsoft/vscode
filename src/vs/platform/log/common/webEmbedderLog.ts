/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogLevel, LogLevelToString } from 'vs/platform/log/common/log';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as OutputExt, IOutputChannel, IOutputChannelRegistry, IOutputService } from 'vs/workbench/services/output/common/output';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEmbedderApi, IEmbedderApiRegistry, Extensions as EmbedderExt } from 'vs/platform/embedder/common/embedderRegistry';

// Needed to ensure that this logger is registered soon enough before the getter is called.
// Fixes: Attempted to get API for logger before it was registered to EmbedderApiRegistry
export const EmbedderLoggerApiKey = 'logger';
export interface IEmbedderLoggerApi extends IEmbedderApi {
	logger: {
		log(id: string, level: LogLevel, message: string): Promise<void>;
	};
}
export class EmbedderLoggerApi implements IEmbedderLoggerApi {
	logger;
	constructor(@IOutputService _outputService: IOutputService) {
		this.logger = {
			async getEmbedderLogChannel(): Promise<IOutputChannel> {
				const id = 'webEmbedderLog';
				const label = 'vscode.dev';

				const channel = _outputService.getChannel(id);
				if (channel) {
					return Promise.resolve(channel);
				}

				Registry.as<IOutputChannelRegistry>(OutputExt.OutputChannels).registerChannel({ id, label, log: true });
				return _outputService.getChannel(id)!;
			},

			getLogMessage(id: string, level: LogLevel, message: string): string {
				return `[${this.getTimeStamp()}] [${id}] [${LogLevelToString(level)}] ${message}`;
			},

			getTimeStamp(): string {
				const date = new Date();
				return `${date.getFullYear()}-${this.padZeros((date.getMonth() + 1), 2)}-${this.padZeros(date.getDate(), 2)} ${this.padZeros(date.getHours(), 2)}:${this.padZeros(date.getMinutes(), 2)}:${this.padZeros(
					date.getSeconds(),
					2
				)}.${this.padZeros(date.getMilliseconds(), 3)}`;
			},

			padZeros(n: number, size: number): string {
				return ('' + n).padStart(size, '0');
			},

			async log(id: string, level: LogLevel, message: string): Promise<void> {
				const logger = await this.getEmbedderLogChannel();

				const logMessage = this.getLogMessage(id, level, message);
				logger.append(logMessage);
			}
		};
	}
}

Registry.as<IEmbedderApiRegistry>(EmbedderExt.EmbedderApiContrib).register(EmbedderLoggerApiKey, new SyncDescriptor(EmbedderLoggerApi));
