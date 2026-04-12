/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as nls from '../../../../nls.js';
import { Action } from '../../../../base/common/actions.js';
import { ILoggerService, LogLevel, LogLevelToLocalizedString, isLogLevel } from '../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { dirname, basename, isEqual } from '../../../../base/common/resources.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IOutputService, isMultiSourceOutputChannelDescriptor, isSingleSourceOutputChannelDescriptor } from '../../../services/output/common/output.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IDefaultLogLevelsService } from '../../../services/log/common/defaultLogLevels.js';
let SetLogLevelAction = class SetLogLevelAction extends Action {
    static { this.ID = 'workbench.action.setLogLevel'; }
    static { this.TITLE = nls.localize2('setLogLevel', "Set Log Level..."); }
    constructor(id, label, quickInputService, loggerService, outputService, defaultLogLevelsService) {
        super(id, label);
        this.quickInputService = quickInputService;
        this.loggerService = loggerService;
        this.outputService = outputService;
        this.defaultLogLevelsService = defaultLogLevelsService;
    }
    async run() {
        const logLevelOrChannel = await this.selectLogLevelOrChannel();
        if (logLevelOrChannel !== null) {
            if (isLogLevel(logLevelOrChannel)) {
                this.loggerService.setLogLevel(logLevelOrChannel);
            }
            else {
                await this.setLogLevelForChannel(logLevelOrChannel);
            }
        }
    }
    async selectLogLevelOrChannel() {
        const defaultLogLevels = this.defaultLogLevelsService.defaultLogLevels;
        const extensionLogs = [], logs = [];
        const logLevel = this.loggerService.getLogLevel();
        for (const channel of this.outputService.getChannelDescriptors()) {
            if (!this.outputService.canSetLogLevel(channel)) {
                continue;
            }
            const sources = isSingleSourceOutputChannelDescriptor(channel) ? [channel.source] : isMultiSourceOutputChannelDescriptor(channel) ? channel.source : [];
            if (!sources.length) {
                continue;
            }
            const channelLogLevel = sources.reduce((prev, curr) => Math.min(prev, this.loggerService.getLogLevel(curr.resource) ?? logLevel), logLevel);
            const item = {
                id: channel.id,
                label: channel.label,
                description: channelLogLevel !== logLevel ? this.getLabel(channelLogLevel) : undefined,
                channel
            };
            if (channel.extensionId) {
                extensionLogs.push(item);
            }
            else {
                logs.push(item);
            }
        }
        const entries = [];
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
            let selectedItem;
            disposables.add(quickPick.onDidTriggerItemButton(e => {
                quickPick.hide();
                this.defaultLogLevelsService.setDefaultLogLevel(e.item.level);
            }));
            disposables.add(quickPick.onDidAccept(e => {
                selectedItem = quickPick.selectedItems[0];
                quickPick.hide();
            }));
            disposables.add(quickPick.onDidHide(() => {
                const result = selectedItem ? selectedItem.level ?? selectedItem : null;
                disposables.dispose();
                resolve(result);
            }));
            quickPick.show();
        });
    }
    async setLogLevelForChannel(logChannel) {
        const defaultLogLevels = this.defaultLogLevelsService.defaultLogLevels;
        const defaultLogLevel = defaultLogLevels.extensions.find(e => e[0] === logChannel.channel.extensionId?.toLowerCase())?.[1] ?? defaultLogLevels.default;
        const entries = this.getLogLevelEntries(defaultLogLevel, this.outputService.getLogLevel(logChannel.channel) ?? defaultLogLevel, !!logChannel.channel.extensionId);
        return new Promise((resolve, reject) => {
            const disposables = new DisposableStore();
            const quickPick = disposables.add(this.quickInputService.createQuickPick());
            quickPick.placeholder = logChannel ? nls.localize('selectLogLevelFor', " {0}: Select log level", logChannel?.label) : nls.localize('selectLogLevel', "Select log level");
            quickPick.items = entries;
            quickPick.activeItems = entries.filter((entry) => entry.level === this.loggerService.getLogLevel());
            let selectedItem;
            disposables.add(quickPick.onDidTriggerItemButton(e => {
                quickPick.hide();
                this.defaultLogLevelsService.setDefaultLogLevel(e.item.level, logChannel.channel.extensionId);
            }));
            disposables.add(quickPick.onDidAccept(e => {
                selectedItem = quickPick.selectedItems[0];
                quickPick.hide();
            }));
            disposables.add(quickPick.onDidHide(() => {
                if (selectedItem) {
                    this.outputService.setLogLevel(logChannel.channel, selectedItem.level);
                }
                disposables.dispose();
                resolve();
            }));
            quickPick.show();
        });
    }
    getLogLevelEntries(defaultLogLevel, currentLogLevel, canSetDefaultLogLevel) {
        const button = canSetDefaultLogLevel ? { iconClass: ThemeIcon.asClassName(Codicon.checkAll), tooltip: nls.localize('resetLogLevel', "Set as Default Log Level") } : undefined;
        return [
            { label: this.getLabel(LogLevel.Trace, currentLogLevel), level: LogLevel.Trace, description: this.getDescription(LogLevel.Trace, defaultLogLevel), buttons: button && defaultLogLevel !== LogLevel.Trace ? [button] : undefined },
            { label: this.getLabel(LogLevel.Debug, currentLogLevel), level: LogLevel.Debug, description: this.getDescription(LogLevel.Debug, defaultLogLevel), buttons: button && defaultLogLevel !== LogLevel.Debug ? [button] : undefined },
            { label: this.getLabel(LogLevel.Info, currentLogLevel), level: LogLevel.Info, description: this.getDescription(LogLevel.Info, defaultLogLevel), buttons: button && defaultLogLevel !== LogLevel.Info ? [button] : undefined },
            { label: this.getLabel(LogLevel.Warning, currentLogLevel), level: LogLevel.Warning, description: this.getDescription(LogLevel.Warning, defaultLogLevel), buttons: button && defaultLogLevel !== LogLevel.Warning ? [button] : undefined },
            { label: this.getLabel(LogLevel.Error, currentLogLevel), level: LogLevel.Error, description: this.getDescription(LogLevel.Error, defaultLogLevel), buttons: button && defaultLogLevel !== LogLevel.Error ? [button] : undefined },
            { label: this.getLabel(LogLevel.Off, currentLogLevel), level: LogLevel.Off, description: this.getDescription(LogLevel.Off, defaultLogLevel), buttons: button && defaultLogLevel !== LogLevel.Off ? [button] : undefined },
        ];
    }
    getLabel(level, current) {
        const label = LogLevelToLocalizedString(level).value;
        return level === current ? `$(check) ${label}` : label;
    }
    getDescription(level, defaultLogLevel) {
        return defaultLogLevel === level ? nls.localize('default', "Default") : undefined;
    }
};
SetLogLevelAction = __decorate([
    __param(2, IQuickInputService),
    __param(3, ILoggerService),
    __param(4, IOutputService),
    __param(5, IDefaultLogLevelsService)
], SetLogLevelAction);
export { SetLogLevelAction };
let OpenWindowSessionLogFileAction = class OpenWindowSessionLogFileAction extends Action {
    static { this.ID = 'workbench.action.openSessionLogFile'; }
    static { this.TITLE = nls.localize2('openSessionLogFile', "Open Window Log File (Session)..."); }
    constructor(id, label, environmentService, fileService, quickInputService, editorService) {
        super(id, label);
        this.environmentService = environmentService;
        this.fileService = fileService;
        this.quickInputService = quickInputService;
        this.editorService = editorService;
    }
    async run() {
        const sessionResult = await this.quickInputService.pick(this.getSessions().then(sessions => sessions.map((s, index) => ({
            id: s.toString(),
            label: basename(s),
            description: index === 0 ? nls.localize('current', "Current") : undefined
        }))), {
            canPickMany: false,
            placeHolder: nls.localize('sessions placeholder', "Select Session")
        });
        if (sessionResult) {
            const logFileResult = await this.quickInputService.pick(this.getLogFiles(URI.parse(sessionResult.id)).then(logFiles => logFiles.map((s) => ({
                id: s.toString(),
                label: basename(s)
            }))), {
                canPickMany: false,
                placeHolder: nls.localize('log placeholder', "Select Log file")
            });
            if (logFileResult) {
                return this.editorService.openEditor({ resource: URI.parse(logFileResult.id), options: { pinned: true } }).then(() => undefined);
            }
        }
    }
    async getSessions() {
        const logsPath = this.environmentService.logsHome.with({ scheme: this.environmentService.logFile.scheme });
        const result = [logsPath];
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
    async getLogFiles(session) {
        const stat = await this.fileService.resolve(session);
        if (stat.children) {
            return stat.children.filter(stat => !stat.isDirectory).map(stat => stat.resource);
        }
        return [];
    }
};
OpenWindowSessionLogFileAction = __decorate([
    __param(2, IWorkbenchEnvironmentService),
    __param(3, IFileService),
    __param(4, IQuickInputService),
    __param(5, IEditorService)
], OpenWindowSessionLogFileAction);
export { OpenWindowSessionLogFileAction };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nc0FjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9sb2dzL2NvbW1vbi9sb2dzQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsY0FBYyxFQUFFLFFBQVEsRUFBRSx5QkFBeUIsRUFBRSxVQUFVLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN6SCxPQUFPLEVBQXFCLGtCQUFrQixFQUF1QyxNQUFNLHNEQUFzRCxDQUFDO0FBQ2xKLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDMUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBNEIsY0FBYyxFQUFFLG9DQUFvQyxFQUFFLHFDQUFxQyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbEwsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFLckYsSUFBTSxpQkFBaUIs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