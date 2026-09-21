/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { MODEL_CONFIG_GROUP_CONTEXT, MODEL_CONFIG_GROUP_EFFORT } from './modelPickerModelConfig.js';

type ChatThinkingEffortChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when a model configuration value (e.g. thinking effort, or the Auto routing tier) is changed';
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model the configuration was changed for' };
	property: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The first-party configuration property that was changed (reasoningEffort, or tier for the Auto model); "unknown" for third-party providers, which choose their own keys' };
	fromValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous value of the configuration property' };
	toValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new value of the configuration property' };
};

type ChatThinkingEffortChangeEvent = {
	model: string | TelemetryTrustedValue<string>;
	property: string;
	fromValue: string;
	toValue: string;
};

type ChatContextSizeChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when the context window size is changed';
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model the context size was changed for' };
	fromValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous context size value' };
	toValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new context size value' };
};

type ChatContextSizeChangeEvent = {
	model: string | TelemetryTrustedValue<string>;
	fromValue: string;
	toValue: string;
};

/**
 * Reports a model configuration change. Shared by both model pickers so the same
 * change reports identically wherever the user makes it.
 */
export function logModelConfigurationChange(
	telemetryService: ITelemetryService,
	model: ILanguageModelChatMetadataAndIdentifier,
	group: string,
	key: string,
	fromValue: unknown,
	toValue: unknown,
): void {
	// Third-party providers choose their own property keys and model ids, so only
	// first-party ones are reported as a controlled vocabulary.
	const isFirstParty = model.metadata.vendor === COPILOT_VENDOR_ID;
	const modelValue = isFirstParty ? new TelemetryTrustedValue(model.identifier) : 'unknown';
	if (group === MODEL_CONFIG_GROUP_CONTEXT) {
		telemetryService.publicLog2<ChatContextSizeChangeEvent, ChatContextSizeChangeClassification>('chat.contextSizeChange', {
			model: modelValue,
			fromValue: String(fromValue ?? ''),
			toValue: String(toValue),
		});
		return;
	}
	if (group === MODEL_CONFIG_GROUP_EFFORT) {
		telemetryService.publicLog2<ChatThinkingEffortChangeEvent, ChatThinkingEffortChangeClassification>('chat.thinkingEffortChange', {
			model: modelValue,
			property: isFirstParty ? key : 'unknown',
			fromValue: String(fromValue ?? ''),
			toValue: String(toValue),
		});
	}
}
