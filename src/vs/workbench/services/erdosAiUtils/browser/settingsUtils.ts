/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISettingsUtils } from '../common/settingsUtils.js';

export class SettingsUtils extends Disposable implements ISettingsUtils {
    readonly _serviceBrand: undefined;
    
    constructor(
        @IConfigurationService private readonly configurationService: IConfigurationService
    ) {
        super();
    }

    async getAutoAcceptConsole(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoAcceptConsole') ?? false;
    }

    async getAutoAcceptConsoleAllowAnything(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoAcceptConsoleAllowAnything') ?? false;
    }

    async getAutoAcceptTerminal(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoAcceptTerminal') ?? false;
    }

    async getAutoAcceptTerminalAllowAnything(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoAcceptTerminalAllowAnything') ?? false;
    }

    async getAutoDeleteFiles(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoDeleteFiles') ?? false;
    }

    async getAutoRunFiles(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoRunFiles') ?? false;
    }

    async getAutoRunFilesAllowAnything(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoRunFilesAllowAnything') ?? false;
    }

    async getAutomationList(listName: string): Promise<string[]> {
        const settingKey = `erdosAi.${listName}`;
        return this.configurationService.getValue<string[]>(settingKey) ?? [];
    }

    async getAutoAcceptConsoleAllowList(): Promise<string[]> {
        return [];
    }

    async getAutoAcceptConsoleDenyList(): Promise<string[]> {
        return [];
    }

    async getAutoAcceptTerminalAllowList(): Promise<string[]> {
        return [];
    }

    async getAutoAcceptTerminalDenyList(): Promise<string[]> {
        return [];
    }

    async getAutoRunFilesAllowList(): Promise<string[]> {
        return this.getAutomationList('runFilesAutomationList');
    }

    async getAutoRunFilesDenyList(): Promise<string[]> {
        return [];
    }
}
