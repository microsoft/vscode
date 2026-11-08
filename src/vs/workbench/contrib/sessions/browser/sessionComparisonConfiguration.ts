/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { filterConfigurationToSchema } from '../../chat/browser/widget/input/chatModelConfigurationLogic.js';
import { isModelComparisonSupported } from '../../chat/browser/widget/input/modelPicker/modelPickerPresentation.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../chat/common/languageModels.js';
import { localize } from '../../../../nls.js';
import { ISessionType } from '../../../services/sessions/common/session.js';
import { ISessionComparisonHarness } from '../common/sessionComparison.js';
import { ISessionPermissionOption } from '../common/sessionsProvider.js';

export function createSessionComparisonHarness(
	providerId: string,
	sessionType: ISessionType,
	model: ILanguageModelChatMetadataAndIdentifier,
	configuration: Readonly<Record<string, string | number | boolean | null>>,
	permission: ISessionPermissionOption | undefined,
): ISessionComparisonHarness {
	if (!permission || permission.locked) {
		throw new Error(localize('comparison.permissionsUnavailable', "The current permissions are unavailable for comparison. Update the source chat permissions and try again."));
	}
	if (!isModelComparisonSupported(model)) {
		throw new Error(localize('comparison.fixedModelRequired', "Comparison attempts require a fixed model or Copilot Fusion."));
	}
	const filtered = filterConfigurationToSchema(configuration, model.metadata.configurationSchema);
	if (Object.entries(configuration).some(([key, value]) => {
		const property = model.metadata.configurationSchema?.properties?.[key];
		return filtered[key] !== value || property?.readOnly && value !== property.default;
	})) {
		throw new Error(localize('comparison.configurationUnavailable', "The requested model configuration is not supported by the selected model."));
	}
	return {
		providerId,
		sessionTypeId: sessionType.id,
		label: sessionType.label,
		modelId: model.identifier,
		modelLabel: model.metadata.name,
		modelConfiguration: Object.keys(configuration).length ? { ...configuration } : undefined,
		permissionId: permission.id,
		permissionLabel: permission.label,
		modeId: permission.comparisonModeId,
	};
}
