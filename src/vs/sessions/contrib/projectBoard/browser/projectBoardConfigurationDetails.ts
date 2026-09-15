/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { formatTokenCount } from '../../../../base/common/numbers.js';
import { localize } from '../../../../nls.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ClaudeSessionConfigKey } from '../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { CodexSessionConfigKey } from '../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { getModelConfigProperty, getModelConfigValueLabel, MODEL_CONFIG_GROUP_CONTEXT, MODEL_CONFIG_GROUP_EFFORT } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { IProjectBoardCard } from '../common/projectBoardModel.js';
import { IProjectBoardInputConfiguration } from './projectBoardMetadata.js';

export interface IProjectBoardConfigurationDetails {
	readonly model: readonly { readonly label: string; readonly value: string }[];
	readonly permissions: readonly { readonly label: string; readonly value: string }[];
}

function configLabel(config: ResolveSessionConfigResult | undefined, key: string): string | undefined {
	const schema = config?.schema.properties[key];
	const value = config?.values[key] ?? schema?.default;
	if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
		return undefined;
	}
	const index = schema?.enum?.indexOf(value) ?? -1;
	return (index >= 0 ? schema?.enumLabels?.[index] : undefined) ?? String(value);
}

/** Reads only the represented chat and its owning session; never global picker defaults. */
export function getProjectBoardConfigurationDetails(
	card: IProjectBoardCard,
	input: IProjectBoardInputConfiguration | undefined,
	provider: ISessionsProvider | undefined,
	reader?: IReader,
): IProjectBoardConfigurationDetails {
	const unavailable = localize('projectBoard.configUnavailable', "Unavailable");
	const modelId = card.chat.modelId.read(reader);
	const resolution = provider?.getModelsSnapshot(card.session.sessionId, modelId).desiredModelResolution;
	const selected = input?.selectedModel;
	const model = resolution?.kind === 'available' ? resolution.model
		: selected && (!modelId || selected.identifier === modelId || selected.metadata.id === modelId) ? selected : undefined;
	const matchingInput = !!model && selected?.identifier === model.identifier;
	const access = { getModelConfiguration: () => matchingInput ? input?.modelConfiguration : undefined };
	const effort = matchingInput ? getModelConfigProperty(model, access, MODEL_CONFIG_GROUP_EFFORT) : undefined;
	const context = matchingInput ? getModelConfigProperty(model, access, MODEL_CONFIG_GROUP_CONTEXT) : undefined;
	const config = provider && isAgentHostProvider(provider) ? provider.getSessionConfig(card.session.sessionId) : undefined;
	const mode = card.chat.mode.read(reader) ?? input?.mode;
	const permission = configLabel(config, CodexSessionConfigKey.PermissionsPreset)
		?? configLabel(config, ClaudeSessionConfigKey.PermissionMode)
		?? configLabel(config, SessionConfigKey.AutoApprove)
		?? input?.permissionLevel;
	const configurableContext = Object.values(model?.metadata.configurationSchema?.properties ?? {}).some(property => property.group === MODEL_CONFIG_GROUP_CONTEXT);
	const contextLabel = context?.value !== undefined ? getModelConfigValueLabel(context.schema, context.value)
		: model && !configurableContext && model.metadata.maxInputTokens > 0 ? formatTokenCount(model.metadata.maxInputTokens) : unavailable;
	const effortLabel = effort?.value !== undefined ? getModelConfigValueLabel(effort.schema, effort.value)
		: configLabel(config, CodexSessionConfigKey.ModelReasoningEffort) ?? unavailable;
	return {
		model: [
			{ label: localize('projectBoard.model', "Model"), value: model?.metadata.name ?? modelId ?? unavailable },
			{ label: effort?.schema.title ?? localize('projectBoard.thinking', "Thinking"), value: effortLabel },
			{ label: localize('projectBoard.context', "Context"), value: contextLabel },
			{ label: localize('projectBoard.harness', "Harness"), value: provider?.sessionTypes.find(type => type.id === card.session.sessionType)?.label ?? card.session.sessionType ?? unavailable },
		],
		permissions: [
			{ label: localize('projectBoard.agent', "Agent"), value: mode?.id ?? unavailable },
			{ label: localize('projectBoard.mode', "Mode"), value: configLabel(config, SessionConfigKey.Mode) ?? mode?.kind ?? unavailable },
			{ label: localize('projectBoard.permissions', "Permissions"), value: permission ?? unavailable },
		],
	};
}
