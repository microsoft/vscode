/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatCustomAgent, ChatInstruction, ChatPromptReference, ChatRequestModeInstructions, ChatSkill, LanguageModelToolInformation } from 'vscode';
import { afterEach, beforeEach, expect, suite, test } from 'vitest';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { TestExtensionsService } from '../../../../platform/test/common/testExtensionsService';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { LogServiceImpl } from '../../../../platform/log/common/logService';
import { TestPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { AgentInstructionFileType, IAgentInstructionFile, PromptConfig } from '../../../../platform/promptFiles/common/promptsService';
import { mockFiles } from '../../../../platform/promptFiles/test/node/mockFiles';
import { MockPromptsService } from '../../../../platform/promptFiles/test/common/mockPromptsService';
import { TelemetryEventMeasurements, TelemetryEventProperties } from '../../../../platform/telemetry/common/telemetry';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { AutomaticInstructionsCollector, InstructionsCollectionEvent } from '../../node/automaticInstructionsCollector';
import { InstructionFileIdPrefix, isCustomizationsIndex, isInstructionFile } from '../../../../extension/prompt/common/chatVariablesCollection';
import { ToolName } from '../../../../extension/tools/common/toolNames';
import { NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';


const localSessionResource = URI.parse(`local://test`);
const remoteSessionResource = URI.parse(`remote://test`);

/**
 * Build a `ChatPromptReference` representing an attached file.
 *
 * Mirrors the shape produced by core's `toFileVariableEntry` — anything
 * with a URI value whose id does not start with `InstructionFileIdPrefix`
 * is treated as an attached file by `collectAttachedContext`.
 */
function toAttachedFileReference(uri: URI): ChatPromptReference {
	return {
		id: `vscode.attachment.file__${uri.toString()}`,
		name: uri.path,
		value: uri,
	};
}

/**
 * Telemetry double that records `sendMSFTTelemetryEvent` calls so tests
 * can assert on the emitted events.
 */
class RecordingTelemetryService extends NullTelemetryService {
	readonly events: { eventName: string; properties: TelemetryEventProperties; measurements: TelemetryEventMeasurements }[] = [];

	override sendMSFTTelemetryEvent(eventName: string, properties: TelemetryEventProperties = {}, measurements: TelemetryEventMeasurements = {}): void {
		this.events.push({ eventName, properties, measurements });
	}
}

/**
 * Construct a tool-information stub. Only the `name` is consulted by the
 * collector when deciding which tools are available.
 */
function tool(name: string): LanguageModelToolInformation {
	return { name, description: '', inputSchema: undefined, tags: [], source: undefined, fullReferenceName: name };
}

/** Extract everything inside `<tag>…</tag>` (non-greedy, multi-instance). */
function xmlContents(text: string, tag: string): string[] {
	const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
	const matches: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		matches.push(match[1].trim());
	}
	return matches;
}

suite('AutomaticInstructionsCollector', () => {
	const rootFolder = '/workspace';
	const rootFolderUri = URI.file(rootFolder);

	let configService: InMemoryConfigurationService;
	let promptsService: MockPromptsService;
	let workspaceService: TestWorkspaceService;
	let fileSystem: MockFileSystemService;
	let extensionsService: TestExtensionsService;
	let telemetry: RecordingTelemetryService;
	let collector: AutomaticInstructionsCollector;

	beforeEach(() => {
		configService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		promptsService = new MockPromptsService();
		workspaceService = new TestWorkspaceService([rootFolderUri]);
		fileSystem = new MockFileSystemService();
		extensionsService = new TestExtensionsService();
		telemetry = new RecordingTelemetryService();

		// Defaults that mirror what the migrated `chatServiceImpl` would set.
		configService.setNonExtensionConfig(PromptConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
		configService.setNonExtensionConfig(PromptConfig.INCLUDE_REFERENCED_INSTRUCTIONS, true);

		collector = new AutomaticInstructionsCollector(
			promptsService,
			configService,
			workspaceService,
			fileSystem,
			new TestPromptPathRepresentationService(workspaceService),
			extensionsService,
			telemetry,
			new LogServiceImpl([]),
			new NullExperimentationService()
		);
	});

	afterEach(() => {
		promptsService.dispose();
	});

	/**
	 * Invoke the collector with a flat options bag. Wraps `tools` into the
	 * `Map<tool, enabled>` shape and `allowedSubagents` into a minimal
	 * `ChatRequestModeInstructions` value.
	 */
	function callCollect(opts: {
		tools?: readonly LanguageModelToolInformation[];
		allowedSubagents?: readonly string[];
		sessionResource?: URI;
		references?: readonly ChatPromptReference[];
	} = {}, token: CancellationToken = CancellationToken.None) {
		const toolsMap = new Map<LanguageModelToolInformation, boolean>();
		for (const t of opts.tools ?? []) {
			toolsMap.set(t, true);
		}
		const modeInstructions2 = opts.allowedSubagents !== undefined ? { name: '', content: '', allowedSubagents: opts.allowedSubagents } satisfies ChatRequestModeInstructions : undefined;
		return collector.collect({
			tools: toolsMap,
			modeInstructions2,
			sessionResource: opts.sessionResource ?? localSessionResource,
			references: opts.references ?? [],
		}, token);
	}

	/** Returns the measurements payload of the single `instructionsCollected` event. */
	function instructionsCollectedMeasurements(): TelemetryEventMeasurements {
		const events = telemetry.events.filter(e => e.eventName === 'instructionsCollected');
		expect(events).toHaveLength(1);
		return events[0].measurements;
	}

	suite('applying instructions', () => {
		test('matches ** pattern for any attached file', async () => {
			const attached = URI.joinPath(rootFolderUri, 'src/file.ts');
			const instructionUri = URI.joinPath(rootFolderUri, '.github/instructions/all.instructions.md');
			promptsService.setInstructions([
				{ uri: instructionUri, name: 'all', source: 'local', pattern: '**' } as ChatInstruction,
			]);

			const result = await callCollect({ references: [toAttachedFileReference(attached)] });

			const paths = result.filter(isInstructionFile).map(e => e.value.path);
			expect(paths).toContain(instructionUri.path);
			expect(instructionsCollectedMeasurements().applyingInstructionsCount).toBe(1);
		});

		test('matches specific file patterns and skips non-matching ones', async () => {
			const attached = URI.joinPath(rootFolderUri, 'src/file.ts');
			const tsInstruction = URI.joinPath(rootFolderUri, '.github/instructions/typescript.instructions.md');
			const jsInstruction = URI.joinPath(rootFolderUri, '.github/instructions/javascript.instructions.md');
			promptsService.setInstructions([
				{ uri: tsInstruction, name: 'ts', source: 'local', pattern: '**/*.ts' } as ChatInstruction,
				{ uri: jsInstruction, name: 'js', source: 'local', pattern: '**/*.js' } as ChatInstruction,
			]);

			const result = await callCollect({ references: [toAttachedFileReference(attached)] });

			const paths = result.filter(isInstructionFile).map(e => e.value.path);
			expect(paths).toContain(tsInstruction.path);
			expect(paths).not.toContain(jsInstruction.path);
		});

		test('matches one of the comma-separated patterns', async () => {
			const attached = URI.joinPath(rootFolderUri, 'src/component.tsx');
			const instructionUri = URI.joinPath(rootFolderUri, '.github/instructions/web.instructions.md');
			promptsService.setInstructions([
				{ uri: instructionUri, name: 'web', source: 'local', pattern: '**/*.ts, **/*.js, **/*.tsx' } as ChatInstruction,
			]);

			const result = await callCollect({ references: [toAttachedFileReference(attached)] });

			expect(result.filter(isInstructionFile)).toHaveLength(1);
		});

		test('matches relative glob patterns', async () => {
			const attached = URI.joinPath(rootFolderUri, 'src/file.ts');
			const instructionUri = URI.joinPath(rootFolderUri, '.github/instructions/src.instructions.md');
			promptsService.setInstructions([
				{ uri: instructionUri, name: 'src', source: 'local', pattern: 'src/**/*.ts' } as ChatInstruction,
			]);

			const result = await callCollect({ references: [toAttachedFileReference(attached)] });

			expect(result.filter(isInstructionFile)).toHaveLength(1);
		});

		test('does not duplicate instructions for multiple matching files', async () => {
			const file1 = URI.joinPath(rootFolderUri, 'src/file1.ts');
			const file2 = URI.joinPath(rootFolderUri, 'src/file2.ts');
			const instructionUri = URI.joinPath(rootFolderUri, '.github/instructions/typescript.instructions.md');
			promptsService.setInstructions([
				{ uri: instructionUri, name: 'ts', source: 'local', pattern: '**/*.ts' } as ChatInstruction,
			]);

			const result = await callCollect({ references: [toAttachedFileReference(file1), toAttachedFileReference(file2)] });

			expect(result.filter(isInstructionFile)).toHaveLength(1);
		});

		test('skips applying instructions when setting is disabled (Agent mode)', async () => {
			await configService.setNonExtensionConfig(PromptConfig.INCLUDE_APPLYING_INSTRUCTIONS, false);
			const attached = URI.joinPath(rootFolderUri, 'src/file.ts');
			const instructionUri = URI.joinPath(rootFolderUri, '.github/instructions/typescript.instructions.md');
			promptsService.setInstructions([
				{ uri: instructionUri, name: 'ts', source: 'local', pattern: '**/*.ts' } as ChatInstruction,
			]);

			const result = await callCollect({ references: [toAttachedFileReference(attached)] });

			expect(result.filter(isInstructionFile)).toHaveLength(0);
		});

		test('honors sessionTypes when filtering instructions', async () => {
			const attached = URI.joinPath(rootFolderUri, 'src/file.ts');
			const localOnly = URI.joinPath(rootFolderUri, '.github/instructions/local.instructions.md');
			const remoteOnly = URI.joinPath(rootFolderUri, '.github/instructions/remote.instructions.md');
			promptsService.setInstructions([
				{ uri: localOnly, name: 'local', source: 'local', pattern: '**/*.ts', sessionTypes: ['local'] } as ChatInstruction,
				{ uri: remoteOnly, name: 'remote', source: 'local', pattern: '**/*.ts', sessionTypes: ['remote'] } as ChatInstruction,
			]);

			const result = await callCollect({ references: [toAttachedFileReference(attached)] });

			const paths = result.filter(isInstructionFile).map(e => e.value.path);
			expect(paths).toContain(localOnly.path);
			expect(paths).not.toContain(remoteOnly.path);
		});
	});

	suite('agent instructions', () => {
		test('adds copilot-instructions.md, AGENTS.md and CLAUDE.md returned by the locator', async () => {
			const copilot: IAgentInstructionFile = { uri: URI.joinPath(rootFolderUri, '.github/copilot-instructions.md'), type: AgentInstructionFileType.copilotInstructionsMd };
			const agentsMd: IAgentInstructionFile = { uri: URI.joinPath(rootFolderUri, 'AGENTS.md'), type: AgentInstructionFileType.agentsMd };
			const claudeMd: IAgentInstructionFile = { uri: URI.joinPath(rootFolderUri, 'CLAUDE.md'), type: AgentInstructionFileType.claudeMd };
			promptsService.setAgentInstructions([copilot, agentsMd, claudeMd]);

			const result = await callCollect();

			const paths = result.filter(e => isInstructionFile(e)).map(e => e.value.path);
			expect(paths).toContain(copilot.uri.path);
			expect(paths).toContain(agentsMd.uri.path);
			expect(paths).toContain(claudeMd.uri.path);
			const m = instructionsCollectedMeasurements();
			expect(m.agentInstructionsCount).toBe(3);
			expect(m.claudeMdCount).toBe(1);
		});

		test('does not duplicate when the file is already attached', async () => {
			const copilot: IAgentInstructionFile = { uri: URI.joinPath(rootFolderUri, '.github/copilot-instructions.md'), type: AgentInstructionFileType.copilotInstructionsMd };
			promptsService.setAgentInstructions([copilot]);

			// Pre-attach the same URI as an instruction-file reference.
			const preAttached: ChatPromptReference = {
				id: `${InstructionFileIdPrefix}.root__${copilot.uri.toString()}`,
				name: 'pre-attached',
				value: copilot.uri,
			};

			const result = await callCollect({ references: [preAttached] });

			expect(result.filter(e => isInstructionFile(e))).toHaveLength(0);
			expect(instructionsCollectedMeasurements().agentInstructionsCount).toBe(0);
		});
	});

	suite('referenced instructions', () => {
		test('follows #file: references in copilot-instructions.md', async () => {
			const copilotUri = URI.joinPath(rootFolderUri, '.github/copilot-instructions.md');
			const referencedUri = URI.joinPath(rootFolderUri, '.github/referenced.instructions.md');

			promptsService.setAgentInstructions([
				{ uri: copilotUri, type: AgentInstructionFileType.copilotInstructionsMd },
			]);
			promptsService.setFileContent(copilotUri, 'Be helpful #file:./referenced.instructions.md');
			promptsService.setFileContent(referencedUri, 'Referenced content');

			// `_addReferencedInstructions` confirms each candidate exists by stat.
			await mockFiles(fileSystem, [
				{ path: referencedUri.path, contents: ['Referenced content'] },
			]);

			const result = await callCollect();

			const paths = result.filter(e => isInstructionFile(e)).map(e => e.value.path);
			expect(paths).toContain(copilotUri.path);
			expect(paths).toContain(referencedUri.path);
			expect(instructionsCollectedMeasurements().referencedInstructionsCount).toBe(1);
		});

		test('handles transitive (nested) references', async () => {
			const copilotUri = URI.joinPath(rootFolderUri, '.github/copilot-instructions.md');
			const level2Uri = URI.joinPath(rootFolderUri, '.github/level2.instructions.md');
			const level3Uri = URI.joinPath(rootFolderUri, '.github/level3.instructions.md');

			promptsService.setAgentInstructions([
				{ uri: copilotUri, type: AgentInstructionFileType.copilotInstructionsMd },
			]);
			promptsService.setFileContent(copilotUri, 'Level 1 #file:./level2.instructions.md');
			promptsService.setFileContent(level2Uri, 'Level 2 #file:./level3.instructions.md');
			promptsService.setFileContent(level3Uri, 'Level 3');

			await mockFiles(fileSystem, [
				{ path: level2Uri.path, contents: ['Level 2'] },
				{ path: level3Uri.path, contents: ['Level 3'] },
			]);

			const result = await callCollect();

			const paths = result.filter(e => isInstructionFile(e)).map(e => e.value.path);
			expect(paths).toContain(copilotUri.path);
			expect(paths).toContain(level2Uri.path);
			expect(paths).toContain(level3Uri.path);
		});

		test('skips references to files outside the workspace that are not prompt files', async () => {
			const copilotUri = URI.joinPath(rootFolderUri, '.github/copilot-instructions.md');
			promptsService.setAgentInstructions([
				{ uri: copilotUri, type: AgentInstructionFileType.copilotInstructionsMd },
			]);
			promptsService.setFileContent(copilotUri, 'See #file:/tmp/external.md');

			const result = await callCollect();

			const paths = result.filter(e => isInstructionFile(e)).map(e => e.value.path);
			expect(paths).toContain(copilotUri.path);
			expect(paths).not.toContain('/tmp/external.md');
		});

		test('skips reference following when setting is disabled (Agent mode)', async () => {
			await configService.setNonExtensionConfig(PromptConfig.INCLUDE_REFERENCED_INSTRUCTIONS, false);

			const copilotUri = URI.joinPath(rootFolderUri, '.github/copilot-instructions.md');
			const referencedUri = URI.joinPath(rootFolderUri, '.github/referenced.instructions.md');
			promptsService.setAgentInstructions([
				{ uri: copilotUri, type: AgentInstructionFileType.copilotInstructionsMd },
			]);
			promptsService.setFileContent(copilotUri, '#file:./referenced.instructions.md');
			await mockFiles(fileSystem, [
				{ path: referencedUri.path, contents: ['x'] },
			]);

			const result = await callCollect();

			const paths = result.filter(e => isInstructionFile(e)).map(e => e.value.path);
			expect(paths).not.toContain(referencedUri.path);
			expect(instructionsCollectedMeasurements().referencedInstructionsCount).toBe(0);
		});
	});

	suite('customizations index', () => {
		test('emits an <instructions> section when readFile tool is available', async () => {
			const instructionUri = URI.joinPath(rootFolderUri, '.github/instructions/test.instructions.md');
			promptsService.setInstructions([
				{ uri: instructionUri, name: 'test', source: 'local', description: 'Test instructions', pattern: '**/*.ts' } as ChatInstruction,
			]);

			const result = await callCollect({ tools: [tool(ToolName.ReadFile)] });

			const indexEntry = result.find(isCustomizationsIndex);
			expect(indexEntry).toBeDefined();
			const content = indexEntry!.value;
			const sections = xmlContents(content, 'instructions');
			expect(sections).toHaveLength(1);
			const items = xmlContents(sections[0], 'instruction');
			expect(items).toHaveLength(1);
			expect(xmlContents(items[0], 'description')[0]).toBe('Test instructions');
			expect(xmlContents(items[0], 'applyTo')[0]).toBe('**/*.ts');
			expect(xmlContents(items[0], 'file')[0]).toBe(instructionUri.path);
		});

		test('omits the customizations index entirely when no tool is available', async () => {
			const instructionUri = URI.joinPath(rootFolderUri, '.github/instructions/test.instructions.md');
			promptsService.setInstructions([
				{ uri: instructionUri, name: 'test', source: 'local', description: 'Test', pattern: '**/*.ts' } as ChatInstruction,
			]);

			const result = await callCollect();

			expect(result.find(isCustomizationsIndex)).toBeUndefined();
		});

		test('emits a <skills> section listing model-invocable skills', async () => {
			const jsSkillUri = URI.joinPath(rootFolderUri, '.claude/skills/javascript/SKILL.md');
			const tsSkillUri = URI.joinPath(rootFolderUri, '.claude/skills/typescript/SKILL.md');
			promptsService.setSkills([
				{ uri: jsSkillUri, name: 'javascript', source: 'local', description: 'JavaScript best practices', disableModelInvocation: false } as ChatSkill,
				{ uri: tsSkillUri, name: 'typescript', source: 'local', description: 'TypeScript best practices', disableModelInvocation: false } as ChatSkill,
			]);

			const result = await callCollect({ tools: [tool(ToolName.ReadFile)] });

			const indexEntry = result.find(isCustomizationsIndex)!;
			const skills = xmlContents(xmlContents(indexEntry.value, 'skills')[0], 'skill');
			expect(skills).toHaveLength(2);
			expect(xmlContents(skills[0], 'name')[0]).toBe('javascript');
			expect(xmlContents(skills[0], 'description')[0]).toBe('JavaScript best practices');
			expect(xmlContents(skills[1], 'name')[0]).toBe('typescript');
		});

		test('excludes skills with disableModelInvocation', async () => {
			const autoUri = URI.joinPath(rootFolderUri, '.claude/skills/auto/SKILL.md');
			const manualUri = URI.joinPath(rootFolderUri, '.claude/skills/manual/SKILL.md');
			promptsService.setSkills([
				{ uri: autoUri, name: 'auto', source: 'local', description: 'Auto skill', disableModelInvocation: false } as ChatSkill,
				{ uri: manualUri, name: 'manual', source: 'local', description: 'Manual skill', disableModelInvocation: true } as ChatSkill,
			]);

			const result = await callCollect({ tools: [tool(ToolName.ReadFile)] });

			const indexEntry = result.find(isCustomizationsIndex)!;
			const skills = xmlContents(xmlContents(indexEntry.value, 'skills')[0], 'skill');
			expect(skills).toHaveLength(1);
			expect(xmlContents(skills[0], 'name')[0]).toBe('auto');
		});

		test('excludes skills without a description', async () => {
			const withDesc = URI.joinPath(rootFolderUri, '.claude/skills/with-desc/SKILL.md');
			const noDesc = URI.joinPath(rootFolderUri, '.claude/skills/no-desc/SKILL.md');
			promptsService.setSkills([
				{ uri: withDesc, name: 'with-desc', source: 'local', description: 'Has a description', disableModelInvocation: false } as ChatSkill,
				{ uri: noDesc, name: 'no-desc', source: 'local', disableModelInvocation: false } as ChatSkill,
			]);

			const result = await callCollect({ tools: [tool(ToolName.ReadFile)] });

			const indexEntry = result.find(isCustomizationsIndex)!;
			const skills = xmlContents(xmlContents(indexEntry.value, 'skills')[0], 'skill');
			expect(skills).toHaveLength(1);
			expect(xmlContents(skills[0], 'name')[0]).toBe('with-desc');
		});

		test('skill section honors sessionTypes filter', async () => {
			const matchingUri = URI.joinPath(rootFolderUri, '.claude/skills/match/SKILL.md');
			const otherUri = URI.joinPath(rootFolderUri, '.claude/skills/other/SKILL.md');
			promptsService.setSkills([
				{ uri: matchingUri, name: 'match', source: 'local', description: 'Matches', disableModelInvocation: false, sessionTypes: ['remote'] } as ChatSkill,
				{ uri: otherUri, name: 'other', source: 'local', description: 'Other', disableModelInvocation: false, sessionTypes: ['local'] } as ChatSkill,
			]);

			const result = await callCollect({ tools: [tool(ToolName.ReadFile)], sessionResource: remoteSessionResource });

			const indexEntry = result.find(isCustomizationsIndex)!;
			const skills = xmlContents(xmlContents(indexEntry.value, 'skills')[0], 'skill');
			expect(skills).toHaveLength(1);
			expect(xmlContents(skills[0], 'name')[0]).toBe('match');
		});

		test('emits an <agents> section when runSubagent tool is available', async () => {
			const agent1Uri = URI.joinPath(rootFolderUri, '.github/agents/test-agent-1.agent.md');
			const agent2Uri = URI.joinPath(rootFolderUri, '.github/agents/test-agent-2.agent.md');
			const agent3Uri = URI.joinPath(rootFolderUri, '.github/agents/test-agent-3.agent.md');
			promptsService.setCustomAgents([
				{ uri: agent1Uri, name: 'test-agent-1', source: 'local', description: 'Test agent 1', userInvocable: true, disableModelInvocation: false, enabled: true } as ChatCustomAgent,
				// Excluded: disableModelInvocation: true
				{ uri: agent2Uri, name: 'test-agent-2', source: 'local', description: 'Test agent 2', userInvocable: true, disableModelInvocation: true, enabled: true } as ChatCustomAgent,
				// Included: userInvocable=false but model invocation is allowed
				{ uri: agent3Uri, name: 'test-agent-3', source: 'local', description: 'Test agent 3', userInvocable: false, disableModelInvocation: false, enabled: true } as ChatCustomAgent,
			]);

			const result = await callCollect({ tools: [tool(ToolName.CoreRunSubagent)], allowedSubagents: ['*'] });

			const indexEntry = result.find(isCustomizationsIndex)!;
			const agents = xmlContents(xmlContents(indexEntry.value, 'agents')[0], 'agent');
			// `disableModelInvocation` excludes an agent regardless of `allowedSubagents`.
			expect(agents).toHaveLength(2);
			expect(xmlContents(agents[0], 'name')[0]).toBe('test-agent-1');
			expect(xmlContents(agents[1], 'name')[0]).toBe('test-agent-3');
		});

		test('respects allowedSubagents filter (specific names only)', async () => {
			const agent1Uri = URI.joinPath(rootFolderUri, '.github/agents/agent1.agent.md');
			const agent2Uri = URI.joinPath(rootFolderUri, '.github/agents/agent2.agent.md');
			promptsService.setCustomAgents([
				{ uri: agent1Uri, name: 'agent1', source: 'local', description: 'A1', userInvocable: true, disableModelInvocation: false, enabled: true } as ChatCustomAgent,
				{ uri: agent2Uri, name: 'agent2', source: 'local', description: 'A2', userInvocable: true, disableModelInvocation: false, enabled: true } as ChatCustomAgent,
			]);

			const result = await callCollect({ tools: [tool(ToolName.CoreRunSubagent)], allowedSubagents: ['agent1'] });

			const indexEntry = result.find(isCustomizationsIndex)!;
			const agents = xmlContents(xmlContents(indexEntry.value, 'agents')[0], 'agent');
			expect(agents).toHaveLength(1);
			expect(xmlContents(agents[0], 'name')[0]).toBe('agent1');
		});

		test('General Purpose agent appears first when the experiment is enabled', async () => {
			await configService.setNonExtensionConfig(PromptConfig.GENERAL_PURPOSE_AGENT_ENABLED, true);
			const agentUri = URI.joinPath(rootFolderUri, '.github/agents/test.agent.md');
			promptsService.setCustomAgents([
				{ uri: agentUri, name: 'custom', source: 'local', description: 'Custom', userInvocable: true, disableModelInvocation: false, enabled: true } as ChatCustomAgent,
			]);

			const result = await callCollect({ tools: [tool(ToolName.CoreRunSubagent)], allowedSubagents: ['*'] });

			const indexEntry = result.find(isCustomizationsIndex)!;
			const agents = xmlContents(xmlContents(indexEntry.value, 'agents')[0], 'agent');
			expect(agents).toHaveLength(2);
			expect(xmlContents(agents[0], 'name')[0]).toBe('General Purpose');
			expect(xmlContents(agents[1], 'name')[0]).toBe('custom');
		});

		test('includes nested AGENTS.md as instruction items when enabled', async () => {
			await configService.setNonExtensionConfig(PromptConfig.USE_NESTED_AGENT_MD, true);
			const nestedUri = URI.joinPath(rootFolderUri, 'packages/foo/AGENTS.md');
			promptsService.setNestedAgentMDs([
				{ uri: nestedUri, type: AgentInstructionFileType.agentsMd },
			]);

			const result = await callCollect({ tools: [tool(ToolName.ReadFile)] });

			const indexEntry = result.find(isCustomizationsIndex)!;
			const items = xmlContents(xmlContents(indexEntry.value, 'instructions')[0], 'instruction');
			expect(items).toHaveLength(1);
			expect(xmlContents(items[0], 'file')[0]).toBe(nestedUri.path);
		});

		test('uses skill adherence prompt when experiment is enabled', async () => {
			await configService.setNonExtensionConfig(PromptConfig.USE_SKILL_ADHERENCE_PROMPT, true);
			const skillUri = URI.joinPath(rootFolderUri, '.claude/skills/test/SKILL.md');
			promptsService.setSkills([
				{ uri: skillUri, name: 'test', source: 'local', description: 'Test skill', disableModelInvocation: false } as ChatSkill,
			]);

			const result = await callCollect({ tools: [tool(ToolName.ReadFile), tool(ToolName.Skill)] });

			const indexEntry = result.find(isCustomizationsIndex)!;
			const content = indexEntry.value;
			expect(content).toContain('BLOCKING REQUIREMENT');
		});
	});

	suite('telemetry', () => {
		test('aggregates instruction counts in the emitted event', async () => {
			const attached = URI.joinPath(rootFolderUri, 'src/file.ts');
			const applying = URI.joinPath(rootFolderUri, '.github/instructions/typescript.instructions.md');
			const copilot: IAgentInstructionFile = { uri: URI.joinPath(rootFolderUri, '.github/copilot-instructions.md'), type: AgentInstructionFileType.copilotInstructionsMd };
			const agentsMd: IAgentInstructionFile = { uri: URI.joinPath(rootFolderUri, 'AGENTS.md'), type: AgentInstructionFileType.agentsMd };

			promptsService.setInstructions([
				{ uri: applying, name: 'ts', source: 'local', pattern: '**/*.ts' } as ChatInstruction,
			]);
			promptsService.setAgentInstructions([copilot, agentsMd]);

			await callCollect({ references: [toAttachedFileReference(attached)] });

			const expected: InstructionsCollectionEvent = {
				applyingInstructionsCount: 1,
				referencedInstructionsCount: 0,
				agentInstructionsCount: 2,
				listedInstructionsCount: 0,
				totalInstructionsCount: 3,
				claudeRulesCount: 0,
				claudeMdCount: 0,
				claudeAgentsCount: 0,
			};
			expect(instructionsCollectedMeasurements()).toEqual(expected);
		});

		test('counts CLAUDE.md and rules folder hits', async () => {
			const attached = URI.joinPath(rootFolderUri, 'src/file.ts');
			const claudeRule = URI.joinPath(rootFolderUri, '.claude/rules/code-style.md');
			const claudeMd: IAgentInstructionFile = { uri: URI.joinPath(rootFolderUri, 'CLAUDE.md'), type: AgentInstructionFileType.claudeMd };

			promptsService.setInstructions([
				{ uri: claudeRule, name: 'rule', source: 'local', pattern: '**' } as ChatInstruction,
			]);
			promptsService.setAgentInstructions([claudeMd]);

			await callCollect({ references: [toAttachedFileReference(attached)] });

			const m = instructionsCollectedMeasurements();
			expect(m.claudeRulesCount).toBe(1);
			expect(m.claudeMdCount).toBe(1);
		});

		test('emits skillLoadedIntoContext per model-invocable skill', async () => {
			const a = URI.joinPath(rootFolderUri, '.claude/skills/a/SKILL.md');
			const b = URI.joinPath(rootFolderUri, '.claude/skills/b/SKILL.md');
			promptsService.setSkills([
				{ uri: a, name: 'a', source: 'local', description: 'Skill A', disableModelInvocation: false } as ChatSkill,
				{ uri: b, name: 'b', source: 'local', description: 'Skill B', disableModelInvocation: false } as ChatSkill,
			]);

			await callCollect({ tools: [tool(ToolName.ReadFile)] });

			const skillEvents = telemetry.events.filter(e => e.eventName === 'skillLoadedIntoContext');
			expect(skillEvents).toHaveLength(2);
			expect(skillEvents[0].properties.skillNameHash).toBeTypeOf('string');
			expect(skillEvents[0].properties.skillNameHash).not.toBe('');
			expect(skillEvents[0].properties.skillNameHash).not.toBe(skillEvents[1].properties.skillNameHash);
		});

		test('does not emit skillLoadedIntoContext for skills with disableModelInvocation', async () => {
			const manual = URI.joinPath(rootFolderUri, '.claude/skills/manual/SKILL.md');
			const auto = URI.joinPath(rootFolderUri, '.claude/skills/auto/SKILL.md');
			promptsService.setSkills([
				{ uri: manual, name: 'manual', source: 'local', description: 'Manual', disableModelInvocation: true } as ChatSkill,
				{ uri: auto, name: 'auto', source: 'local', description: 'Auto', disableModelInvocation: false } as ChatSkill,
			]);

			await callCollect({ tools: [tool(ToolName.ReadFile)] });

			const skillEvents = telemetry.events.filter(e => e.eventName === 'skillLoadedIntoContext');
			expect(skillEvents).toHaveLength(1);
		});
	});

	suite('edge cases', () => {
		test('handles an empty workspace gracefully', async () => {
			const result = await callCollect();

			expect(result).toHaveLength(0);
		});

		test('returns early when the token is already cancelled', async () => {
			const cancelled: CancellationToken = {
				isCancellationRequested: true,
				onCancellationRequested: Event.None,
			};

			promptsService.setInstructions([
				{ uri: URI.joinPath(rootFolderUri, '.github/instructions/x.instructions.md'), name: 'x', source: 'local', pattern: '**' } as ChatInstruction,
			]);
			promptsService.setAgentInstructions([
				{ uri: URI.joinPath(rootFolderUri, 'AGENTS.md'), type: AgentInstructionFileType.agentsMd },
			]);

			const result = await callCollect({
				tools: [tool(ToolName.ReadFile)],
				references: [toAttachedFileReference(URI.joinPath(rootFolderUri, 'src/file.ts'))],
			}, cancelled);

			// Collection returns before building any entries when cancellation has
			// already been requested.
			expect(result).toHaveLength(0);
		});
	});

	test('marks the customizations index entry with the expected id', async () => {
		const skill = URI.joinPath(rootFolderUri, '.claude/skills/x/SKILL.md');
		promptsService.setSkills([
			{ uri: skill, name: 'x', source: 'local', description: 'X', disableModelInvocation: false } as ChatSkill,
		]);

		const result = await callCollect({ tools: [tool(ToolName.ReadFile)] });

		const indexEntries = result.filter(e => isCustomizationsIndex(e));
		expect(indexEntries).toHaveLength(1);
		expect(typeof indexEntries[0].value).toBe('string');
	});
});
