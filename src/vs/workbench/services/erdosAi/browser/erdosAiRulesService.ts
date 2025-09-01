/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IErdosAiRulesService } from '../common/erdosAiRulesService.js';

export class ErdosAiRulesService extends Disposable implements IErdosAiRulesService {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
	}

	async getUserRules(): Promise<string[]> {
		return this.configurationService.getValue<string[]>('erdosAi.userRules') || [];
	}

	async addUserRule(rule: string): Promise<boolean> {
		try {
			const currentRules = await this.getUserRules();
			const updatedRules = [...currentRules, rule];
			await this.configurationService.updateValue('erdosAi.userRules', updatedRules);
			return true;
		} catch (error) {
			this.logService.error('Failed to add user rule:', error);
			return false;
		}
	}

	async editUserRule(index: number, rule: string): Promise<boolean> {
		try {
			const currentRules = await this.getUserRules();
			if (index < 0 || index >= currentRules.length) {
				throw new Error('Invalid rule index');
			}
			const updatedRules = [...currentRules];
			updatedRules[index] = rule;
			await this.configurationService.updateValue('erdosAi.userRules', updatedRules);
			return true;
		} catch (error) {
			this.logService.error('Failed to edit user rule:', error);
			return false;
		}
	}

	async deleteUserRule(index: number): Promise<boolean> {
		try {
			const currentRules = await this.getUserRules();
			if (index < 0 || index >= currentRules.length) {
				throw new Error('Invalid rule index');
			}
			const updatedRules = currentRules.filter((_, i) => i !== index);
			await this.configurationService.updateValue('erdosAi.userRules', updatedRules);
			return true;
		} catch (error) {
			this.logService.error('Failed to delete user rule:', error);
			return false;
		}
	}
}
