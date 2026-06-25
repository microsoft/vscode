/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';

export const getChatQuotaTrajectoryNudgeEnabledCommand = '_github.copilot.chat.getQuotaTrajectoryNudgeEnabled';

interface ICommandRegistrar {
	registerCommand(command: string, callback: (...args: unknown[]) => unknown): { dispose(): void };
}

export function registerChatQuotaTrajectoryNudgeEnabledCommand(commandRegistrar: ICommandRegistrar, configService: IConfigurationService, expService: IExperimentationService) {
	return commandRegistrar.registerCommand(getChatQuotaTrajectoryNudgeEnabledCommand, async () => {
		await expService.hasTreatments();
		const config = ConfigKey.Advanced.ChatQuotaTrajectoryNudge;
		const configured = configService.isConfigured(config);
		const assigned = expService.getTreatmentVariable<boolean>(config.experimentName ?? '');
		return assigned !== undefined || configured
			? configService.getExperimentBasedConfig(config, expService)
			: undefined;
	});
}
