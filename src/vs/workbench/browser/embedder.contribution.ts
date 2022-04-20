/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PerformanceMark } from 'vs/base/common/performance';
import { URI } from 'vs/base/common/uri';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Extensions as EmbedderExt, IEmbedderApiRegistry } from 'vs/platform/embedder/common/embedderRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { LogLevel, LogLevelToString } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { IProgress, IProgressCompositeOptions, IProgressDialogOptions, IProgressNotificationOptions, IProgressOptions, IProgressService, IProgressStep, IProgressWindowOptions } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IOutputChannel, IOutputChannelRegistry, IOutputService, Extensions as OutputExt } from 'vs/workbench/services/output/common/output';
import { ITimerService } from 'vs/workbench/services/timer/browser/timerService';

// Needed to ensure that contributions are registered and created before the Web API tries to get them
// Fixes: Attempted to get API for X before it was registered to EmbedderApiRegistry
export enum EmbedderApiKeys {
	commands = 'commands',
	progress = 'progress',
	opener = 'opener',
	product = 'product',
	telemetry = 'telemetry',
	lifecycle = 'lifecycle',
	timer = 'timer',
	logger = 'logger'
}

export class EmbedderCommandsApi {
	constructor(@ICommandService private readonly _commandService: ICommandService) { }

	executeCommand(command: string, ...args: any[]): Promise<unknown> {
		return this._commandService.executeCommand(command, args);
	}
}

Registry.as<IEmbedderApiRegistry>(EmbedderExt.EmbedderApiContrib).register(EmbedderApiKeys.commands, new SyncDescriptor(EmbedderCommandsApi));


export class EmbedderProgressApi {
	constructor(@IProgressService private readonly _progressService: IProgressService) { }

	withProgress<R>(
		options: IProgressOptions | IProgressDialogOptions | IProgressNotificationOptions | IProgressWindowOptions | IProgressCompositeOptions,
		task: (progress: IProgress<IProgressStep>) => Promise<R>
	): Promise<R> {
		return this._progressService.withProgress(options, task);
	}
}

Registry.as<IEmbedderApiRegistry>(EmbedderExt.EmbedderApiContrib).register(EmbedderApiKeys.progress, new SyncDescriptor(EmbedderProgressApi));

export class EmbedderOpenerApi {
	constructor(@IOpenerService private readonly _commandService: IOpenerService) { }

	openUri(target: URI): Promise<boolean> {
		return this._commandService.open(target, {});
	}
}

Registry.as<IEmbedderApiRegistry>(EmbedderExt.EmbedderApiContrib).register(EmbedderApiKeys.opener, new SyncDescriptor(EmbedderOpenerApi));


export class EmbedderProductApi {
	constructor(@IProductService private readonly _productService: IProductService) {
	}

	getUriScheme(): Promise<string> {
		return Promise.resolve(this._productService.urlProtocol);
	}
}

Registry.as<IEmbedderApiRegistry>(EmbedderExt.EmbedderApiContrib).register(EmbedderApiKeys.product, new SyncDescriptor(EmbedderProductApi));


export class EmbedderTelemetryApi {
	public telemetryLevel;

	constructor(@ITelemetryService _telemetryService: ITelemetryService) {
		this.telemetryLevel = _telemetryService.telemetryLevel;
	}
}

Registry.as<IEmbedderApiRegistry>(EmbedderExt.EmbedderApiContrib).register(EmbedderApiKeys.telemetry, new SyncDescriptor(EmbedderTelemetryApi));


export class EmbedderLifecycleApi {
	constructor(@ILifecycleService private readonly _lifecycleService: ILifecycleService) { }

	shutdown(): Promise<void> {
		return this._lifecycleService.shutdown();
	}
}

Registry.as<IEmbedderApiRegistry>(EmbedderExt.EmbedderApiContrib).register(EmbedderApiKeys.lifecycle, new SyncDescriptor(EmbedderLifecycleApi));


export class EmbedderTimerApi {
	constructor(@ITimerService private readonly _timerService: ITimerService) { }

	async retrievePerformanceMarks(): Promise<[source: string, marks: readonly PerformanceMark[]][]> {
		await this._timerService.whenReady();
		return this._timerService.getPerformanceMarks();
	}
}

Registry.as<IEmbedderApiRegistry>(EmbedderExt.EmbedderApiContrib).register(EmbedderApiKeys.timer, new SyncDescriptor(EmbedderTimerApi));


export class EmbedderLoggerApi {
	constructor(@IOutputService private readonly _outputService: IOutputService) { }

	async log(id: string, level: LogLevel, message: string): Promise<void> {
		const logger = await this.getEmbedderLogChannel();

		const logMessage = this.getLogMessage(id, level, message);
		logger.append(logMessage);
	}

	private async getEmbedderLogChannel(): Promise<IOutputChannel> {
		const id = 'webEmbedderLog';
		const label = 'vscode.dev';

		const channel = this._outputService.getChannel(id);
		if (channel) {
			return Promise.resolve(channel);
		}

		Registry.as<IOutputChannelRegistry>(OutputExt.OutputChannels).registerChannel({ id, label, log: true });
		return this._outputService.getChannel(id)!;
	}

	private getLogMessage(id: string, level: LogLevel, message: string): string {
		return `[${this.getTimeStamp()}] [${id}] [${LogLevelToString(level)}] ${message}`;
	}

	private getTimeStamp(): string {
		const date = new Date();
		return `${date.getFullYear()}-${this.padZeros((date.getMonth() + 1), 2)}-${this.padZeros(date.getDate(), 2)} ${this.padZeros(date.getHours(), 2)}:${this.padZeros(date.getMinutes(), 2)}:${this.padZeros(
			date.getSeconds(),
			2
		)}.${this.padZeros(date.getMilliseconds(), 3)}`;
	}

	private padZeros(n: number, size: number): string {
		return ('' + n).padStart(size, '0');
	}
}

Registry.as<IEmbedderApiRegistry>(EmbedderExt.EmbedderApiContrib).register(EmbedderApiKeys.logger, new SyncDescriptor(EmbedderLoggerApi));
