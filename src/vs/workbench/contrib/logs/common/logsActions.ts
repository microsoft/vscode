/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { ILoggerService, LogLevel, LogLevelToLocalizedString, isLogLevel } from 'vs/platform/log/common/log';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { dirname, basename, isEqual } from 'vs/base/common/resources';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IOutputChannelDescriptor, IOutputService } from 'vs/workbench/services/output/common/output';
import { extensionTelemetryLogChannelId, telemetryLogId } from 'vs/platform/telemetry/common/telemetryUtils';
import { IDefaultLogLevelsService } from 'vs/workbench/contrib/logs/common/defaultLogLevels';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { DisposableStore } from 'vs/base/common/lifecycle';

type LogLevelQuickPickItem = IQuickPickItem & { level: LogLevel };
type LogChannelQuickPickItem = IQuickPickItem & { id: string; resource: URI; extensionId?: string };

export class SetLogLevelAction extends Action {

	static readonly ID = 'workbench.action.setLogLevel';
	static readonly TITLE = nls.localize2('setLogLevel', "Set Log Level...");

	constructor(id: string, label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILoggerService private readonly loggerService: ILoggerService,
		@IOutputService private readonly outputService: IOutputService,
		@IDefaultLogLevelsService private readonly defaultLogLevelsService: IDefaultLogLevelsService,
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const logLevelOrChannel = await this.selectLogLevelOrChannel();
		if (logLevelOrChannel !== null) {
			if (isLogLevel(logLevelOrChannel)) {
				this.loggerService.setLogLevel(logLevelOrChannel);
			} else {
				await this.setLogLevelForChannel(logLevelOrChannel);
			}
		}
	}

	private async selectLogLevelOrChannel(): Promise<LogChannelQuickPickItem | LogLevel | null> {
		const defaultLogLevels = await this.defaultLogLevelsService.getDefaultLogLevels();
		const extensionLogs: LogChannelQuickPickItem[] = [], logs: LogChannelQuickPickItem[] = [];
		const logLevel = this.loggerService.getLogLevel();
		for (const channel of this.outputService.getChannelDescriptors()) {
			if (!SetLogLevelAction.isLevelSettable(channel) || !channel.file) {
				continue;
			}
			const channelLogLevel = this.loggerService.getLogLevel(channel.file) ?? logLevel;
			const item: LogChannelQuickPickItem = { id: channel.id, resource: channel.file, label: channel.label, description: channelLogLevel !== logLevel ? this.getLabel(channelLogLevel) : undefined, extensionId: channel.extensionId };
			if (channel.extensionId) {
				extensionLogs.push(item);
			} else {
				logs.push(item);
			}
		}
		const entries: (LogLevelQuickPickItem | LogChannelQuickPickItem | IQuickPickSeparator)[] = [];
		entries.push({ type: 'separator', label: nls.localize('all', "All") });
		entries.push(...this.getLogLevelEntries(defaultLogLevels.default, this.loggerService.getLogLevel(), true));
		if (extensionLogs.length) {
			entries.push({ type: 'separator', label: nls.localize('extensionLogs', "Extension Logs") });
			entries.push(...extensionLogs.sort((a, b) => a.label.localeCompare(b.label)));
		}
		entries.push({ type: 'separator', label: nls.localize('loggers', "Logs") });
		entries.push(...logs.sort((a, b) => a.label.localeCompare(b.label)));

		return new Promise((resolve, reject) => {
			const disposables = new DisposableStore();
			const quickPick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
			quickPick.placeholder = nls.localize('selectlog', "Set Log Level");
			quickPick.items = entries;
			let selectedItem: IQuickPickItem | undefined;
			disposables.add(quickPick.onDidTriggerItemButton(e => {
				quickPick.hide();
				this.defaultLogLevelsService.setDefaultLogLevel((<LogLevelQuickPickItem>e.item).level);
			}));
			disposables.add(quickPick.onDidAccept(e => {
				selectedItem = quickPick.selectedItems[0];
				quickPick.hide();
			}));
			disposables.add(quickPick.onDidHide(() => {
				const result = selectedItem ? (<LogLevelQuickPickItem>selectedItem).level ?? <LogChannelQuickPickItem>selectedItem : null;
				disposables.dispose();
				resolve(result);
			}));
			quickPick.show();
		});
	}

	static isLevelSettable(channel: IOutputChannelDescriptor): boolean {
		return channel.log && channel.file !== undefined && channel.id !== telemetryLogId && channel.id !== extensionTelemetryLogChannelId;
	}

	private async setLogLevelForChannel(logChannel: LogChannelQuickPickItem): Promise<void> {
		const defaultLogLevels = await this.defaultLogLevelsService.getDefaultLogLevels();
		const defaultLogLevel = defaultLogLevels.extensions.find(e => e[0] === logChannel.extensionId?.toLowerCase())?.[1] ?? defaultLogLevels.default;
		const currentLogLevel = this.loggerService.getLogLevel(logChannel.resource) ?? defaultLogLevel;
		const entries = this.getLogLevelEntries(defaultLogLevel, currentLogLevel, !!logChannel.extensionId);

		return new Promise((resolve, reject) => {
			const disposables = new DisposableStore();
			const quickPick = disposables.add(this.quickInputService.createQuickPick());
			quickPick.placeholder = logChannel ? nls.localize('selectLogLevelFor', " {0}: Select log level", logChannel?.label) : nls.localize('selectLogLevel', "Select log level");
			quickPick.items = entries;
			quickPick.activeItems = entries.filter((entry) => entry.level === this.loggerService.getLogLevel());
			let selectedItem: LogLevelQuickPickItem | undefined;
			disposables.add(quickPick.onDidTriggerItemButton(e => {
				quickPick.hide();
				this.defaultLogLevelsService.setDefaultLogLevel((<LogLevelQuickPickItem>e.item).level, logChannel.extensionId);
			}));
			disposables.add(quickPick.onDidAccept(e => {
				selectedItem = quickPick.selectedItems[0] as LogLevelQuickPickItem;
				quickPick.hide();
			}));
			disposables.add(quickPick.onDidHide(() => {
				if (selectedItem) {
					this.loggerService.setLogLevel(logChannel.resource, selectedItem.level);
				}
				disposables.dispose();
				resolve();
			}));
			quickPick.show();
		});
	}

	private getLogLevelEntries(defaultLogLevel: LogLevel, currentLogLevel: LogLevel, canSetDefaultLogLevel: boolean): LogLevelQuickPickItem[] {
		const button: IQuickInputButton | undefined = canSetDefaultLogLevel ? { iconClass: ThemeIcon.asClassName(Codicon.checkAll), tooltip: nls.localize('resetLogLevel', "Set as Default Log Level") } : undefined;
		return [
			{ label: this.getLabel(LogLevel.Trace, currentLogLevel), level: LogLevel.Trace, description: this.getDescription(LogLevel.Trace, defaultLogLevel), buttons: button && defaultLogLevel !== LogLevel.Trace ? [button] : undefined },
			{ label: this.getLabel(LogLevel.Debug, currentLogLevel), level: LogLevel.Debug, description: this.getDescription(LogLevel.Debug, defaultLogLevel), buttons: button && defaultLogLevel !== LogLevel.Debug ? [button] : undefined },
			{ label: this.getLabel(LogLevel.Info, currentLogLevel), level: LogLevel.Info, description: this.getDescription(LogLevel.Info, defaultLogLevel), buttons: button && defaultLogLevel !== LogLevel.Info ? [button] : undefined },
			{ label: this.getLabel(LogLevel.Warning, currentLogLevel), level: LogLevel.Warning, description: this.getDescription(LogLevel.Warning, defaultLogLevel), buttons: button && defaultLogLevel !== LogLevel.Warning ? [button] : undefined },
			{ label: this.getLabel(LogLevel.Error, currentLogLevel), level: LogLevel.Error, description: this.getDescription(LogLevel.Error, defaultLogLevel), buttons: button && defaultLogLevel !== LogLevel.Error ? [button] : undefined },
			{ label: this.getLabel(LogLevel.Off, currentLogLevel), level: LogLevel.Off, description: this.getDescription(LogLevel.Off, defaultLogLevel), buttons: button && defaultLogLevel !== LogLevel.Off ? [button] : undefined },
		];
	}

	private getLabel(level: LogLevel, current?: LogLevel): string {
		const label = LogLevelToLocalizedString(level).value;
		return level === current ? `$(check) ${label}` : label;
	}

	private getDescription(level: LogLevel, defaultLogLevel: LogLevel): string | undefined {
		return defaultLogLevel === level ? nls.localize('default', "Default") : undefined;
	}

}

export class OpenWindowSessionLogFileAction extends Action {

	static readonly ID = 'workbench.action.openSessionLogFile';
	static readonly TITLE = nls.localize2('openSessionLogFile', "Open Window Log File (Session)...");

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
			this.getSessions().then(sessions => sessions.map((s, index): IQuickPickItem => ({
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
				this.getLogFiles(URI.parse(sessionResult.id!)).then(logFiles => logFiles.map((s): IQuickPickItem => ({
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
		const logsPath = this.environmentService.logsHome.with({ scheme: this.environmentService.logFile.scheme });
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

