/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

/**
 * Settings utilities for Erdos AI function handlers
 * Provides real implementations using Erdos's configuration service
 */
export class SettingsUtils {
    constructor(
        private readonly configurationService: IConfigurationService
    ) {}

    /**
     * Get auto accept console setting
     */
    async getAutoAcceptConsole(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoAcceptConsole') ?? false;
    }

    /**
     * Get auto accept console allow anything setting
     */
    async getAutoAcceptConsoleAllowAnything(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoAcceptConsoleAllowAnything') ?? false;
    }

    /**
     * Get auto accept terminal setting
     */
    async getAutoAcceptTerminal(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoAcceptTerminal') ?? false;
    }

    /**
     * Get auto accept terminal allow anything setting
     */
    async getAutoAcceptTerminalAllowAnything(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoAcceptTerminalAllowAnything') ?? false;
    }

    /**
     * Get auto delete files setting
     */
    async getAutoDeleteFiles(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoDeleteFiles') ?? false;
    }

    /**
     * Get auto run files setting
     */
    async getAutoRunFiles(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoRunFiles') ?? false;
    }

    /**
     * Get auto run files allow anything setting
     */
    async getAutoRunFilesAllowAnything(): Promise<boolean> {
        return this.configurationService.getValue<boolean>('erdosAi.autoRunFilesAllowAnything') ?? false;
    }

    /**
     * Get automation list (allow/deny lists)
     */
    async getAutomationList(listName: string): Promise<string[]> {
        const settingKey = `erdosAi.${listName}`;
        return this.configurationService.getValue<string[]>(settingKey) ?? [];
    }

    /**
     * Get auto accept console allow list (not implemented yet)
     */
    async getAutoAcceptConsoleAllowList(): Promise<string[]> {
        return []; // No configuration registered yet
    }

    /**
     * Get auto accept console deny list (not implemented yet)
     */
    async getAutoAcceptConsoleDenyList(): Promise<string[]> {
        return []; // No configuration registered yet
    }

    /**
     * Get auto accept terminal allow list (not implemented yet)
     */
    async getAutoAcceptTerminalAllowList(): Promise<string[]> {
        return []; // No configuration registered yet
    }

    /**
     * Get auto accept terminal deny list (not implemented yet)
     */
    async getAutoAcceptTerminalDenyList(): Promise<string[]> {
        return []; // No configuration registered yet
    }

    /**
     * Get auto run files allow list
     */
    async getAutoRunFilesAllowList(): Promise<string[]> {
        return this.getAutomationList('runFilesAutomationList');
    }

    /**
     * Get auto run files deny list (not implemented yet)
     */
    async getAutoRunFilesDenyList(): Promise<string[]> {
        return []; // No configuration registered yet
    }
}




