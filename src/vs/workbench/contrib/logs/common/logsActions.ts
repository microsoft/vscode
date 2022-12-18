/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { ILogService, LogLevel, getLogLevel, parseLogLevel } from 'vs/platform/log/common/log';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { dirname, basename, isEqual } from 'vs/base/common/resources';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IOutputChannelDescriptor, IOutputService } from 'vs/workbench/services/output/common/output';
import { isNumber } from 'vs/base/common/types';
import { ILogLevelService } from 'vs/workbench/contrib/logs/common/logLevelService';
import { extensionTelemetryLogChannelId, telemetryLogChannelId } from 'vs/workbench/contrib/logs/common/logConstants';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';

type LogLevelQuickPickItem = IQuickPickItem & { level: LogLevel };
type LogChannelQuickPickItem = IQuickPickItem & { channel: IOutputChannelDescriptor };

function isLogLevel(thing: unknown): thing is LogLevel {
	return isNumber(thing);
}

export class SetLogLevelAction extends Action {

	static readonly ID = 'workbench.action.setLogLevel';
	static readonly TITLE = { value: nls.localize('setLogLevel', "Set Log Level..."), original: 'Set Log Level...' };

	constructor(id: string, label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILogService private readonly logService: ILogService,
		@ILogLevelService private readonly logLevelService: ILogLevelService,
		@IOutputService private readonly outputService: IOutputService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const logLevelOrChannel = await this.selectLogLevelOrChannel();
		if (logLevelOrChannel !== null) {
			if (isLogLevel(logLevelOrChannel)) {
				this.logService.setLevel(logLevelOrChannel);
			} else {
				await this.setLogLevelForChannel(logLevelOrChannel);
			}
		}
	}

	private async selectLogLevelOrChannel(): Promise<IOutputChannelDescriptor | LogLevel | null> {
		const extensionLogs = [], logs = [];
		for (const channel of this.outputService.getChannelDescriptors()) {
			if (!channel.log || channel.id === telemetryLogChannelId || channel.id === extensionTelemetryLogChannelId) {
				continue;
			}
			if (channel.extensionId) {
				extensionLogs.push(channel);
			} else {
				logs.push(channel);
			}
		}
		const entries: (LogLevelQuickPickItem | LogChannelQuickPickItem | IQuickPickSeparator)[] = [];
		entries.push({ type: 'separator', label: nls.localize('all', "All") });
		entries.push(...this.getLogLevelEntries(this.getDefaultLogLevel(null), this.logService.getLevel()));
		entries.push({ type: 'separator', label: nls.localize('loggers', "Logs") });
		const logLevel = this.logService.getLevel();
		for (const channel of logs.sort((a, b) => a.label.localeCompare(b.label))) {
			const channelLogLevel = this.logLevelService.getLogLevel(channel.id) ?? logLevel;
			entries.push({ label: channel.label, channel, description: channelLogLevel !== logLevel ? this.getLabel(channelLogLevel) : undefined });
		}
		if (extensionLogs.length && logs.length) {
			entries.push({ type: 'separator', label: nls.localize('extensionLogs', "Extension Logs") });
		}
		for (const channel of extensionLogs.sort((a, b) => a.label.localeCompare(b.label))) {
			const channelLogLevel = this.logLevelService.getLogLevel(channel.id) ?? logLevel;
			entries.push({ label: channel.label, channel, description: channelLogLevel !== logLevel ? this.getLabel(channelLogLevel) : undefined });
		}
		const entry = await this.quickInputService.pick(entries, { placeHolder: nls.localize('selectlog', "Set Log Level") });
		if (entry) {
			if ((<LogLevelQuickPickItem>entry).level) {
				return (<LogLevelQuickPickItem>entry).level;
			}
			if ((<LogChannelQuickPickItem>entry).channel) {
				return (<LogChannelQuickPickItem>entry).channel;
			}
		}
		return null;
	}

	private async setLogLevelForChannel(logChannel: IOutputChannelDescriptor): Promise<void> {
		const defaultLogLevel = this.getDefaultLogLevel(logChannel);
		const currentLogLevel = this.logLevelService.getLogLevel(logChannel.id) ?? defaultLogLevel;
		const entries = this.getLogLevelEntries(defaultLogLevel, currentLogLevel);

		const entry = await this.quickInputService.pick(entries, { placeHolder: logChannel ? nls.localize('selectLogLevelFor', " {0}: Select log level", logChannel?.label) : nls.localize('selectLogLevel', "Select log level"), activeItem: entries[this.logService.getLevel()] });
		if (entry) {
			this.logLevelService.setLogLevel(logChannel.id, entry.level);
		}
	}

	private getLogLevelEntries(defaultLogLevel: LogLevel, currentLogLevel: LogLevel): LogLevelQuickPickItem[] {
		return [
			{ label: this.getLabel(LogLevel.Trace, currentLogLevel), level: LogLevel.Trace, description: this.getDescription(LogLevel.Trace, defaultLogLevel) },
			{ label: this.getLabel(LogLevel.Debug, currentLogLevel), level: LogLevel.Debug, description: this.getDescription(LogLevel.Debug, defaultLogLevel) },
			{ label: this.getLabel(LogLevel.Info, currentLogLevel), level: LogLevel.Info, description: this.getDescription(LogLevel.Info, defaultLogLevel) },
			{ label: this.getLabel(LogLevel.Warning, currentLogLevel), level: LogLevel.Warning, description: this.getDescription(LogLevel.Warning, defaultLogLevel) },
			{ label: this.getLabel(LogLevel.Error, currentLogLevel), level: LogLevel.Error, description: this.getDescription(LogLevel.Error, defaultLogLevel) },
			{ label: this.getLabel(LogLevel.Off, currentLogLevel), level: LogLevel.Off, description: this.getDescription(LogLevel.Off, defaultLogLevel) },
		];

	}

	private getLabel(level: LogLevel, current?: LogLevel): string {
		let label: string;
		switch (level) {
			case LogLevel.Trace: label = nls.localize('trace', "Trace"); break;
			case LogLevel.Debug: label = nls.localize('debug', "Debug"); break;
			case LogLevel.Info: label = nls.localize('info', "Info"); break;
			case LogLevel.Warning: label = nls.localize('warn', "Warning"); break;
			case LogLevel.Error: label = nls.localize('err', "Error"); break;
			case LogLevel.Off: label = nls.localize('off', "Off"); break;
		}
		return level === current ? `$(check) ${label}` : label;
	}

	private getDescription(level: LogLevel, defaultLogLevel: LogLevel): string | undefined {
		return defaultLogLevel === level ? nls.localize('default', "Default") : undefined;
	}

	private getDefaultLogLevel(outputChannel: IOutputChannelDescriptor | null): LogLevel {
		let logLevel: LogLevel | undefined;
		if (outputChannel?.extensionId) {
			const logLevelValue = this.environmentService.extensionLogLevel?.find(([id]) => areSameExtensions({ id }, { id: outputChannel.extensionId! }))?.[1];
			if (logLevelValue) {
				logLevel = parseLogLevel(logLevelValue);
			}
		}
		return logLevel ?? getLogLevel(this.environmentService);
	}
}

export class OpenWindowSessionLogFileAction extends Action {

	static readonly ID = 'workbench.action.openSessionLogFile';
	static readonly TITLE = { value: nls.localize('openSessionLogFile', "Open Window Log File (Session)..."), original: 'Open Window Log File (Session)...' };

	constructor(id: string, label: string,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const sessionResult = await this.quickInputService.pick(
			this.getSessions().then(sessions => sessions.map((s, index) => (<IQuickPickItem>{
				id: s.toString(),
				label: basename(s),
				description: index === 0 ? nls.localize('current', "Current") : undefined
			}))),
			{
				canPickMany: false,
				placeHolder: nls.localize('sessions placeholder', "Select Session")
			});
		if (sessionResult) {
			const logFileResult = await this.quickInputService.pick(
				this.getLogFiles(URI.parse(sessionResult.id!)).then(logFiles => logFiles.map(s => (<IQuickPickItem>{
					id: s.toString(),
					label: basename(s)
				}))),
				{
					canPickMany: false,
					placeHolder: nls.localize('log placeholder', "Select Log file")
				});
			if (logFileResult) {
				return this.editorService.openEditor({ resource: URI.parse(logFileResult.id!), options: { pinned: true } }).then(() => undefined);
			}
		}
	}

	private async getSessions(): Promise<URI[]> {
		const logsPath = URI.file(this.environmentService.logsPath).with({ scheme: this.environmentService.logFile.scheme });
		const result: URI[] = [logsPath];
		const stat = await this.fileService.resolve(dirname(logsPath));
		if (stat.children) {
			result.push(...stat.children
				.filter(stat => !isEqual(stat.resource, logsPath) && stat.isDirectory && /^\d{8}T\d{6}$/.test(stat.name))
				.sort()
				.reverse()
				.map(d => d.resource));
		}
		return result;
	}

	private async getLogFiles(session: URI): Promise<URI[]> {
		const stat = await this.fileService.resolve(session);
		if (stat.children) {
			return stat.children.filter(stat => !stat.isDirectory).map(stat => stat.resource);
		}
		return [];
	}
}

