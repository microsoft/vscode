/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IErdosAiAutomationService } from '../common/erdosAiAutomationService.js';

export class ErdosAiAutomationService extends Disposable implements IErdosAiAutomationService {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
	}

	async getAutoAcceptEdits(): Promise<boolean> {
		const settings = await this.loadSettingsFromFile();
		return settings.auto_accept_edits || false;
	}

	async setAutoAcceptEdits(enabled: boolean): Promise<boolean> {
		try {
			const settings = await this.loadSettingsFromFile();
			settings.auto_accept_edits = enabled;
			const result = await this.saveSettingsToFile(settings);
			
			if (result) {
				await this.configurationService.updateValue('erdosAi.autoAcceptEdits', enabled);
			}
			
			return result;
		} catch (error) {
			this.logService.error('Failed to set auto-accept edits:', error);
			return false;
		}
	}

	async getAutoAcceptConsole(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoAcceptConsole') || false;
	}

	async setAutoAcceptConsole(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoAcceptConsole', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-accept file edits:', error);
			return false;
		}
	}
	
	async getAutoRunFiles(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoRunFiles') || false;
	}

	async setAutoRunFiles(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoRunFiles', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-run files:', error);
			return false;
		}
	}

	async getAutoDeleteFiles(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoDeleteFiles') || false;
	}

	async setAutoDeleteFiles(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoDeleteFiles', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-delete files:', error);
			return false;
		}
	}

	async getAutoRunFilesAllowAnything(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoRunFilesAllowAnything') || false;
	}

	async setAutoRunFilesAllowAnything(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoRunFilesAllowAnything', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-run files allow anything:', error);
			return false;
		}
	}

	async getAutoDeleteFilesAllowAnything(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('erdosAi.autoDeleteFilesAllowAnything') || false;
	}

	async setAutoDeleteFilesAllowAnything(enabled: boolean): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.autoDeleteFilesAllowAnything', enabled);
			return true;
		} catch (error) {
			this.logService.error('Failed to set auto-delete files allow anything:', error);
			return false;
		}
	}

	async getRunFilesAutomationList(): Promise<string[]> {
		return this.configurationService.getValue<string[]>('erdosAi.runFilesAutomationList') || [];
	}

	async setRunFilesAutomationList(files: string[]): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.runFilesAutomationList', files);
			return true;
		} catch (error) {
			this.logService.error('Failed to set run files automation list:', error);
			return false;
		}
	}

	async getDeleteFilesAutomationList(): Promise<string[]> {
		return this.configurationService.getValue<string[]>('erdosAi.deleteFilesAutomationList') || [];
	}

	async setDeleteFilesAutomationList(files: string[]): Promise<boolean> {
		try {
			await this.configurationService.updateValue('erdosAi.deleteFilesAutomationList', files);
			return true;
		} catch (error) {
			this.logService.error('Failed to set delete files automation list:', error);
			return false;
		}
	}

	private async loadSettingsFromFile(): Promise<any> {
		return {
			auto_accept_edits: false
		};
	}

	private async saveSettingsToFile(settings: any): Promise<boolean> {
		return true;
	}
}
