/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';

export namespace TypeScript {
	export const versionKey = 'js/ts.experimental.useTsgo';

	export function runsVersion7(): boolean {
		const value = vscode.workspace.getConfiguration('js/ts.experimental').get<boolean>('useTsgo', false);
		return value === true;
	}

	export function isVersion7SupportEnabled(configurationService: IConfigurationService): boolean {
		return configurationService.getConfig(ConfigKey.TypeScript7LanguageContext) ?? false;
	}
}
