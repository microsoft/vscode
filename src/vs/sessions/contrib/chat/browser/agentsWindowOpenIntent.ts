/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DevContainerAgentHostEnabledSettingId } from '../../../common/devContainerAgentHostService.js';

export function shouldPreferDevContainer(requested: unknown, configurationService: IConfigurationService): boolean {
	return requested === true
		&& configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId) === true;
}
