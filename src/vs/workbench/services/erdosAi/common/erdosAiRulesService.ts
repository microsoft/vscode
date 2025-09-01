/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IErdosAiRulesService = createDecorator<IErdosAiRulesService>('erdosAiRulesService');

export interface IErdosAiRulesService {
	readonly _serviceBrand: undefined;

	getUserRules(): Promise<string[]>;
	addUserRule(rule: string): Promise<boolean>;
	editUserRule(index: number, rule: string): Promise<boolean>;
	deleteUserRule(index: number): Promise<boolean>;
}
