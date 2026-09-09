/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { CustomizationLoadStatus, CustomizationType, type DirectoryCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { AgentCustomizationItemProvider } from '../../../browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';

export function createCodexSkillCustomizations(): DirectoryCustomization[] {
	return [
		{
			name: 'repo', valid: true, skills: [
				{ directory: '.agents', name: 'agents-dreaming' },
				{ directory: '.codex', name: 'codex-described' },
			],
		},
		{
			name: 'errors', valid: false, skills: [
				{ directory: '.agents', name: 'agents-invalid' },
				{ directory: '.codex', name: 'dreaming' },
			],
		},
	].map(({ name, valid, skills }) => {
		return {
			type: CustomizationType.Directory,
			id: `codex-skills:${name}`,
			uri: `codex-skills:/${name}`,
			name,
			enabled: valid,
			contents: CustomizationType.Skill,
			writable: false,
			load: valid ? { kind: CustomizationLoadStatus.Loaded } : { kind: CustomizationLoadStatus.Error, message: 'missing field `description`' },
			children: skills.map(skill => {
				const uri = URI.file(`/workspace/${skill.directory}/skills/${skill.name}/SKILL.md`).toString();
				return { type: CustomizationType.Skill, id: uri, uri, name: skill.name, enabled: valid };
			}),
		};
	});
}

export async function assertCodexSkillItems(service: IAgentHostCustomizationService, sessionResource: URI, store: Pick<DisposableStore, 'add'>): Promise<void> {
	const provider = store.add(new AgentCustomizationItemProvider(
		'local',
		undefined,
		undefined,
		new class extends mock<IFileService>() { }(),
		new NullLogService(),
		service,
		new class extends mock<IPromptsService>() {
			override readonly onDidChangeSkills = Event.None;
			override getDisabledPromptFiles(): ResourceSet { return new ResourceSet(); }
			override async listPromptFilesForStorage() { return []; }
		}(),
	));
	const items = await provider.provideChatSessionCustomizations(sessionResource, CancellationToken.None);

	assert.deepStrictEqual(items.map(item => ({
		name: item.name,
		uri: item.uri.toString(),
		type: item.type,
		source: item.source,
		enabled: item.enabled,
		status: item.status,
		statusMessage: item.statusMessage,
	})), [
		{ name: 'agents-dreaming', uri: 'file:///workspace/.agents/skills/agents-dreaming/SKILL.md', type: PromptsType.skill, source: AICustomizationSources.local, enabled: true, status: 'loaded', statusMessage: undefined },
		{ name: 'codex-described', uri: 'file:///workspace/.codex/skills/codex-described/SKILL.md', type: PromptsType.skill, source: AICustomizationSources.local, enabled: true, status: 'loaded', statusMessage: undefined },
		{ name: 'agents-invalid', uri: 'file:///workspace/.agents/skills/agents-invalid/SKILL.md', type: PromptsType.skill, source: AICustomizationSources.local, enabled: false, status: 'error', statusMessage: 'missing field `description`' },
		{ name: 'dreaming', uri: 'file:///workspace/.codex/skills/dreaming/SKILL.md', type: PromptsType.skill, source: AICustomizationSources.local, enabled: false, status: 'error', statusMessage: 'missing field `description`' },
	]);
}
