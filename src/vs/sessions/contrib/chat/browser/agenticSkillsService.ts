/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { FileAccess } from '../../../../base/common/network.js';
import { basename, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { SKILL_FILENAME } from '../../../../workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.js';
import { PromptFileParser } from '../../../../workbench/contrib/chat/common/promptSyntax/promptFileParser.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IAgenticSkillsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/agenticSkillsService.js';
import { readDisabledPromptFiles, storeDisabledPromptFiles } from '../../../../workbench/contrib/chat/common/promptSyntax/service/disabledPromptFilesStorage.js';
import { IBuiltinPromptPath, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING } from '../../../../workbench/contrib/sessions/common/chatConstants.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { getChatNativeComponentsRenderer } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatNativeComponents.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerEnvironmentsEnabledSettingId, DevContainerHandoffEnabledSettingId, isDevContainerHandoffEnabled } from '../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';

/** URI root for built-in skills bundled with the Agents app. */
export const BUILTIN_SKILLS_URI = FileAccess.asFileUri('vs/sessions/skills');

const DISABLED_STORAGE_KEY = 'chat.agenticSkills.disabled';

/** Where older versions stored disabled skills, including built-in ones, before this service owned them. */
const LEGACY_DISABLED_SKILLS_STORAGE_KEY = 'chat.disabledPromptFiles.skill';

interface IBuiltinSkill {
	readonly uri: URI;
	readonly name: string;
	readonly description: string;
}

/**
 * Discovers the built-in skills bundled with the Agents app at
 * `vs/sessions/skills/{folder}/SKILL.md`, hides those whose feature is turned
 * off, and stores which of them the user disabled.
 *
 * The prompts service merges these into skill discovery with the lowest
 * priority, so a user or workspace skill with the same folder name wins.
 */
export class AgenticSkillsService extends Disposable implements IAgenticSkillsService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _builtinSkillsCache: Promise<readonly IBuiltinSkill[]> | undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.migrateLegacyDisabledSkills();
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration,
			event => event.affectsConfiguration(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING)
				|| event.affectsConfiguration(ChatConfiguration.HtmlPreviewEnabled)
				|| event.affectsConfiguration(ChatConfiguration.NativeComponentsEnabled)
				|| event.affectsConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING)
				|| event.affectsConfiguration(DevContainerHandoffEnabledSettingId)
				|| event.affectsConfiguration(DevContainerEnvironmentsEnabledSettingId)
				|| event.affectsConfiguration(DevContainerAgentHostEnabledSettingId)
				|| event.affectsConfiguration(RemoteAgentHostsEnabledSettingId)
				|| event.affectsConfiguration(ChatAIDisabledSettingId))(() => this._onDidChange.fire()));
	}

	isBuiltinSkill(uri: URI): boolean {
		return isEqualOrParent(uri, BUILTIN_SKILLS_URI);
	}

	getDisabledSkills(): ResourceSet {
		return readDisabledPromptFiles(this.storageService, DISABLED_STORAGE_KEY);
	}

	setDisabledSkills(uris: ResourceSet): void {
		storeDisabledPromptFiles(this.storageService, DISABLED_STORAGE_KEY, uris);
		this._onDidChange.fire();
	}

	/**
	 * Moves disabled built-in skills from the prompts service's storage, keeping its other entries. Runs before the
	 * first read, so no consumer ever sees a migrated skill as enabled.
	 */
	private migrateLegacyDisabledSkills(): void {
		const legacy = readDisabledPromptFiles(this.storageService, LEGACY_DISABLED_SKILLS_STORAGE_KEY);
		const remaining = [...legacy].filter(uri => !this.isBuiltinSkill(uri));
		if (remaining.length === legacy.size) {
			return;
		}
		const disabled = this.getDisabledSkills();
		for (const uri of legacy) {
			if (this.isBuiltinSkill(uri)) {
				disabled.add(uri);
			}
		}
		// Store here before removing there, so an interruption never loses a decision.
		storeDisabledPromptFiles(this.storageService, DISABLED_STORAGE_KEY, disabled);
		storeDisabledPromptFiles(this.storageService, LEGACY_DISABLED_SKILLS_STORAGE_KEY, remaining);
	}

	private async getBuiltinSkills(): Promise<readonly IBuiltinSkill[]> {
		if (!this._builtinSkillsCache) {
			this._builtinSkillsCache = this.discoverBuiltinSkills();
		}
		return this._builtinSkillsCache;
	}

	private async discoverBuiltinSkills(): Promise<readonly IBuiltinSkill[]> {
		try {
			const stat = await this.fileService.resolve(BUILTIN_SKILLS_URI);
			if (!stat.children) {
				return [];
			}

			const parser = new PromptFileParser();
			const skills: IBuiltinSkill[] = [];
			for (const child of stat.children) {
				if (!child.isDirectory) {
					continue;
				}
				const skillFileUri = joinPath(child.resource, SKILL_FILENAME);
				try {
					const content = await this.fileService.readFile(skillFileUri);
					const parsed = parser.parse(skillFileUri, content.value.toString());
					const rawName = parsed.header?.name;
					const rawDescription = parsed.header?.description;
					if (!rawName || !rawDescription) {
						continue;
					}
					const name = sanitizeSkillText(rawName, 64);
					const description = sanitizeSkillText(rawDescription, 1024);
					if (name !== basename(child.resource)) {
						continue;
					}
					skills.push({ uri: skillFileUri, name, description });
				} catch (e) {
					this.logService.warn(`[AgenticSkillsService] Failed to parse built-in skill: ${skillFileUri}`, e instanceof Error ? e.message : String(e));
				}
			}
			return skills;
		} catch {
			return [];
		}
	}

	async getSkills(): Promise<readonly IBuiltinPromptPath[]> {
		const skills = await this.getBuiltinSkills();
		return skills.filter(s => {
			if (s.name === 'html-preview') {
				return this.configurationService.getValue<boolean>(ChatConfiguration.HtmlPreviewEnabled) === true
					&& !this.configurationService.getValue<boolean>(ChatAIDisabledSettingId);
			}
			if (s.name === 'vscode-ui') {
				return !!getChatNativeComponentsRenderer(this.configurationService);
			}
			if (s.name === 'automate') {
				return this.configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true
					&& !this.configurationService.getValue<boolean>(ChatAIDisabledSettingId);
			}
			if (s.name === 'dev-container-handoff') {
				return isDevContainerHandoffEnabled(this.configurationService);
			}
			return s.name !== 'generate-chat-background' || this.configurationService.getValue<boolean>(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING) === true;
		}).map(s => ({
			uri: s.uri,
			storage: PromptsStorage.builtIn,
			type: PromptsType.skill,
			name: s.name,
			description: s.description,
		}));
	}
}

/**
 * Strips XML tags, repeating until the text no longer changes so that removing one tag cannot leave another behind,
 * and truncates to the given max length.
 */
function sanitizeSkillText(text: string, maxLength: number): string {
	let sanitized = text;
	let previous: string;
	do {
		previous = sanitized;
		sanitized = sanitized.replace(/<[^>]*>/g, '');
	} while (sanitized !== previous);
	return sanitized.length > maxLength ? sanitized.substring(0, maxLength) : sanitized;
}
