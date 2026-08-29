/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICustomInstructionsService, ISkillInfo } from '../../../platform/customInstructions/common/customInstructionsService';
import { IExtensionsService } from '../../../platform/extensions/common/extensionsService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { hash } from '../../../util/vs/base/common/hash';
import { URI } from '../../../util/vs/base/common/uri';

/**
 * Sends `skillContentRead` telemetry for a skill invocation.
 * Shared between the skill tool and the readFile tool to ensure consistent
 * telemetry when skills are loaded through either path.
 *
 * TODO: Add pluginNameHash and pluginVersion properties once vscode core's
 * extensionPromptFileProvider command exposes IAgentPluginService metadata.
 */
export function sendSkillContentReadTelemetry(
	telemetryService: ITelemetryService,
	customInstructionsService: ICustomInstructionsService,
	extensionsService: IExtensionsService,
	uri: URI,
	skillInfo: ISkillInfo,
	content: string,
): void {
	const extensionSkillInfo = customInstructionsService.getExtensionSkillInfo(uri);
	const extensionId = extensionSkillInfo?.extensionId ?? '';
	const extensionVersion = extensionId ? extensionsService.getExtension(extensionId)?.packageJSON?.version ?? '' : '';
	const contentHash = content ? String(hash(content)) : '';

	const plaintextProps = {
		skillName: skillInfo.skillName,
		skillPath: uri.toString(),
		skillExtensionId: extensionId,
		skillExtensionVersion: extensionVersion,
		skillStorage: skillInfo.storage,
		skillContentHash: contentHash,
	};

	telemetryService.sendGHTelemetryEvent('skillContentRead',
		{
			skillNameHash: String(hash(skillInfo.skillName)),
			skillExtensionIdHash: extensionId ? String(hash(extensionId)) : '',
			skillExtensionVersion: plaintextProps.skillExtensionVersion,
			skillStorage: plaintextProps.skillStorage,
			skillContentHash: contentHash,
		}
	);

	telemetryService.sendEnhancedGHTelemetryEvent('skillContentRead', plaintextProps);
	telemetryService.sendInternalMSFTTelemetryEvent('skillContentRead', plaintextProps);
}
