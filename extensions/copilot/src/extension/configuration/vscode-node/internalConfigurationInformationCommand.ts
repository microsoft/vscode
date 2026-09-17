/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { globalConfigRegistry } from '../../../platform/configuration/common/configurationService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IExtensionContribution } from '../../common/contributions';
import { buildInternalConfigurationInformation } from '../common/internalConfigurationInformation';

export class InternalConfigurationInformationCommandContribution extends Disposable implements IExtensionContribution {
	constructor() {
		super();
		this._register(vscode.commands.registerCommand('_github.copilot.getInternalConfigurationInformation', async (): Promise<string> => {
			return JSON.stringify(buildInternalConfigurationInformation(globalConfigRegistry.configs.values()));
		}));
	}
}
