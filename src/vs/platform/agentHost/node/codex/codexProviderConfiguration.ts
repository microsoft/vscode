/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { CODEX_AGENT_PROVIDER_ID } from '../../common/agentService.js';
import type { IAgentCustomizationSettingsRegistration } from '../../common/agentCustomizationSettings.js';

export function createCodexProviderConfiguration(userHome: URI): IAgentCustomizationSettingsRegistration {
	return {
		provider: CODEX_AGENT_PROVIDER_ID,
		title: localize('codex.configuration.title', "Codex Settings"),
		description: localize('codex.configuration.description', "Configure Codex defaults stored in config.toml. Project and managed configuration can override these user values."),
		properties: {
			'codex.personality': { type: 'string', title: localize('codex.configuration.personality', "Personality"), description: localize('codex.configuration.personality.description', "Controls the default communication style for Codex. Default leaves personality unset in config.toml."), default: 'default', enum: ['default', 'friendly', 'pragmatic'], enumLabels: [localize('codex.configuration.personality.default', "Default"), localize('codex.configuration.personality.friendly', "Friendly"), localize('codex.configuration.personality.pragmatic', "Pragmatic")] },
			'codex.autoReviewPolicy': { type: 'string', title: localize('codex.configuration.autoReviewPolicy', "Auto-review policy"), description: localize('codex.configuration.autoReviewPolicy.description', "Updates auto_review.policy in config.toml. Leave empty to remove the auto_review section."), default: '' },
		},
		settings: [
			{ key: 'codex.personality', group: localize('codex.configuration.personalization', "Personalization") },
			{ key: 'codex.autoReviewPolicy', group: localize('codex.configuration.review', "Review policy"), kind: 'multiline', saveLabel: localize('codex.configuration.review.save', "Save Policy") },
		],
		configurationFile: {
			resource: URI.file(join(userHome.fsPath, '.codex', 'config.toml')).toString(),
			title: localize('codex.configuration.file.title', "Advanced configuration"),
			description: localize('codex.configuration.file.description', "Open the Codex configuration file to customize additional agent behavior."),
			openLabel: localize('codex.configuration.file.open', "Open config.toml"),
			documentationUrl: 'https://learn.chatgpt.com/docs/config-file/config-basic',
			documentationLabel: localize('codex.configuration.file.docs', "Codex configuration documentation"),
		},
	};
}
