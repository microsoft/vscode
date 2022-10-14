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
import { isUndefined } from 'vs/base/common/types';
import { ILogLevelService } from 'vs/workbench/contrib/logs/common/logLevelService';
import { extensionTelemetryLogChannelId, telemetryLogChannelId } from 'vs/workbench/contrib/logs/common/logConstants';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';

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
		const logChannel = await this.selectLogChannel();
		if (!isUndefined(logChannel)) {
			await this.selectLogLevel(logChannel);
		}
	}

	private async selectLogChannel(): Promise<IOutputChannelDescriptor | undefined | null> {
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
		const entries: ({ label: string; channel?: IOutputChannelDescriptor } | IQuickPickSeparator)[] = [];
		entries.push({ label: nls.localize('all', "All") });
		entries.push({ type: 'separator', label: nls.localize('loggers', "Logs") });
		for (const channel of logs.sort((a, b) => a.label.localeCompare(b.label))) {
			entries.push({ label: channel.label, channel });
		}
		if (extensionLogs.length && logs.length) {
			entries.push({ type: 'separator', label: nls.localize('extensionLogs', "Extension Logs") });
		}
		for (const channel of extensionLogs.sort((a, b) => a.label.localeCompare(b.label))) {
			entries.push({ label: channel.label, channel });
		}
		const entry = await this.quickInputService.pick(entries, { placeHolder: nls.localize('selectlog', "Select Log") });
		return entry ? entry.channel ?? null : undefined;
	}

	private async selectLogLevel(logChannel: IOutputChannelDescriptor | null): Promise<void> {
		const defaultLogLevel = this.getDefaultLogLevel(logChannel);
		const current = logChannel ? this.logLevelService.getLogLevel(logChannel.id) ?? defaultLogLevel : this.logService.getLevel();
		const entries = [
			{ label: this.getLabel(nls.localize('trace', "Trace"), LogLevel.Trace, current), level: LogLevel.Trace, description: this.getDescription(LogLevel.Trace, defaultLogLevel) },
			{ label: this.getLabel(nls.localize('debug', "Debug"), LogLevel.Debug, current), level: LogLevel.Debug, description: this.getDescription(LogLevel.Debug, defaultLogLevel) },
			{ label: this.getLabel(nls.localize('info', "Info"), LogLevel.Info, current), level: LogLevel.Info, description: this.getDescription(LogLevel.Info, defaultLogLevel) },
			{ label: this.getLabel(nls.localize('warn', "Warning"), LogLevel.Warning, current), level: LogLevel.Warning, description: this.getDescription(LogLevel.Warning, defaultLogLevel) },
			{ label: this.getLabel(nls.localize('err', "Error"), LogLevel.Error, current), level: LogLevel.Error, description: this.getDescription(LogLevel.Error, defaultLogLevel) },
			{ label: this.getLabel(nls.localize('critical', "Critical"), LogLevel.Critical, current), level: LogLevel.Critical, description: this.getDescription(LogLevel.Critical, defaultLogLevel) },
			{ label: this.getLabel(nls.localize('off', "Off"), LogLevel.Off, current), level: LogLevel.Off, description: this.getDescription(LogLevel.Off, defaultLogLevel) },
		];

		const entry = await this.quickInputService.pick(entries, { placeHolder: logChannel ? nls.localize('selectLogLevelFor', " {0}: Select log level", logChannel?.label) : nls.localize('selectLogLevel', "Select log level"), activeItem: entries[this.logService.getLevel()] });
		if (entry) {
			if (logChannel) {
				this.logLevelService.setLogLevel(logChannel.id, entry.level);
			} else {
				this.logService.setLevel(entry.level);
			}
		}
	}

	private getLabel(label: string, level: LogLevel, current: LogLevel): string {
		if (level === current) {
			return `$(check) ${label}`;
		}
		return label;
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

