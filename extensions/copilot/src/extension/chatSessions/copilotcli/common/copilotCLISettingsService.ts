/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { loadFeatureFlagsFromConfig } from '@github/copilot/sdk';
import { createDecorator } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ISessionSettingsService, SessionSettingsFile } from '../../common/sessionSettingsService';

// TODO: We should use an actual exported type from the Copilot SDK. This is currently not available.
export type CopilotCLISettings = Parameters<typeof loadFeatureFlagsFromConfig>[0];

export const ICopilotCLISettingsService = createDecorator<ICopilotCLISettingsService>('copilotCLISettingsService');

export enum CopilotCLISettingsLocationType {
	// ~/.copilot/settings.json
	User = 'user',
}

export type CopilotCLISettingsFile = SessionSettingsFile<CopilotCLISettingsLocationType, CopilotCLISettings>;

export interface ICopilotCLISettingsService extends ISessionSettingsService<CopilotCLISettingsLocationType, CopilotCLISettings> {
}
