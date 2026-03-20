/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { hash } from '../../../../base/common/hash.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IAgentPlugin, IAgentPluginService } from '../common/plugins/agentPluginService.js';
import { IAgentSkill, IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { IToolCompletedEvent, ILanguageModelToolsService } from '../common/tools/languageModelToolsService.js';

export class SkillContentReadTelemetry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.skillContentReadTelemetry';

	/** Cached mapping from normalized skill path → skill, lazily populated. */
	private _skillsByPath: Map<string, IAgentSkill> | undefined;
	/** Cached mapping from plugin URI → plugin, refreshed alongside skills cache. */
	private _pluginByUri: ResourceMap<IAgentPlugin> | undefined;

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(toolsService.onDidCompleteToolInvocation(e => this._onToolCompleted(e)));
		this._register(this._promptsService.onDidChangeSkills(() => {
			this._skillsByPath = undefined;
			this._pluginByUri = undefined;
		}));
	}

	private _onToolCompleted(event: IToolCompletedEvent): void {
		if (event.toolReferenceName !== 'readFile') {
			return;
		}

		const filePath = event.parameters['filePath'];
		if (typeof filePath !== 'string') {
			return;
		}

		const lowerPath = filePath.toLowerCase();
		if (lowerPath.endsWith('/skill.md') || lowerPath.endsWith('\\skill.md')) {
			// Fire-and-forget: resolve skill match and log telemetry asynchronously
			this._logSkillContentReadIfMatch(filePath, event).catch(err => {
				this._logService.error('[SkillContentReadTelemetry] Failed to log skill content read telemetry', err);
			});
		}
	}

	private async _logSkillContentReadIfMatch(filePath: string, event: IToolCompletedEvent): Promise<void> {
		const skill = await this._findSkillForPath(filePath);
		if (!skill) {
			return;
		}

		// Extract text content from the tool result for hashing
		const textPart = event.result.content.find(part => part.kind === 'text');
		const textContent = textPart?.kind === 'text' ? textPart.value : undefined;

		type SkillContentReadEvent = {
			skillNameHash: string;
			skillStorage: string;
			extensionIdHash: string;
			extensionVersion: string;
			pluginNameHash: string;
			pluginVersion: string;
			contentHash: string;
		};

		type SkillContentReadClassification = {
			skillNameHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Numeric hash of the skill name that was read by the model.' };
			skillStorage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The storage source of the skill (local, user, extension, plugin, internal).' };
			extensionIdHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Numeric hash of the contributing extension identifier, empty if none.' };
			extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Semver version of the contributing extension, empty if none.' };
			pluginNameHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Numeric hash of the plugin display name, empty if not from a plugin.' };
			pluginVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Semver version of the plugin, empty if unavailable.' };
			contentHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Numeric hash of the skill file content that was read by the model.' };
			owner: 'manishj,dbreshears';
			comment: 'Tracks when the model reads a skill file via the readFile tool, including provenance metadata.';
		};

		try {
			const skillPlugin = skill.pluginUri ? this._pluginByUri?.get(skill.pluginUri) : undefined;

			const hashOrEmpty = (value: string | undefined) => {
				return value !== undefined ? String(hash(value)) : '';
			};

			this._telemetryService.publicLog2<SkillContentReadEvent, SkillContentReadClassification>('skillContentRead', {
				skillNameHash: hashOrEmpty(skill.name),
				skillStorage: skill.storage,
				extensionIdHash: hashOrEmpty(skill.extension?.identifier.value),
				extensionVersion: skill.extension?.version ?? '',
				pluginNameHash: hashOrEmpty(skillPlugin?.label),
				pluginVersion: skillPlugin?.fromMarketplace?.version ?? '',
				contentHash: hashOrEmpty(textContent),
			});
		} catch (err) {
			this._logService.error('[SkillContentReadTelemetry] Failed to log skill content read telemetry', err);
		}
	}

	private async _findSkillForPath(filePath: string): Promise<IAgentSkill | undefined> {
		const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

		// Try cached lookup first
		const cached = this._skillsByPath?.get(normalizedPath);
		if (cached) {
			return cached;
		}

		// Refresh cache and try again
		await this._refreshCache();
		return this._skillsByPath?.get(normalizedPath);
	}

	private async _refreshCache(): Promise<void> {
		const skills = await this._promptsService.findAgentSkills(CancellationToken.None);
		if (!skills) {
			this._skillsByPath = undefined;
			this._pluginByUri = undefined;
			return;
		}

		// Key by normalized path (forward slashes, lowercase) to match across
		// local file:// and vscodeRemote:// schemes
		const skillMap = new Map<string, IAgentSkill>();
		for (const skill of skills) {
			const normalizedPath = skill.uri.path.toLowerCase();
			skillMap.set(normalizedPath, skill);
		}
		this._skillsByPath = skillMap;

		const pluginMap = new ResourceMap<IAgentPlugin>();
		for (const plugin of this._agentPluginService.plugins.get()) {
			pluginMap.set(plugin.uri, plugin);
		}
		this._pluginByUri = pluginMap;
	}
}
