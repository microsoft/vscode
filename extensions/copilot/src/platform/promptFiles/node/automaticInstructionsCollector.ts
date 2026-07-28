/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IExtensionsService } from '../../../platform/extensions/common/extensionsService';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { ILogService } from '../../../platform/log/common/logService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { AgentInstructionFileType, IAgentInstructionFile, IPromptsService, PromptConfig } from '../../../platform/promptFiles/common/promptsService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { match as globMatch, splitGlobAware } from '../../../util/vs/base/common/glob';
import { hash } from '../../../util/vs/base/common/hash';
import { ResourceMap, ResourceSet } from '../../../util/vs/base/common/map';
import { basename, dirname } from '../../../util/vs/base/common/resources';
import { posix } from '../../../util/vs/base/common/path';
import { stringDiff } from '../../../util/vs/base/common/diff/diff';
import { URI } from '../../../util/vs/base/common/uri';
import { ParsedPromptFile } from '../../../util/vs/workbench/contrib/chat/common/promptSyntax/promptFileParser';
import { isLocation } from '../../../util/common/types';
import { getToolName, ToolName } from '../../../extension/tools/common/toolNames';
import { isCustomizationsIndex, isInstructionFile, toCustomizationsIndexReference, toInstructionFileReference } from '../../../extension/prompt/common/chatVariablesCollection';
import { getToolReferencePromptContent } from '../../../extension/prompt/vscode-node/promptVariablesService';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { getChatSessionType, matchesSessionType } from '../../chat/common/sessionUtils';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName, IOTelService } from '../../otel/common';
import { ICustomInstructionsService } from '../../customInstructions/common/customInstructionsService';
import { IPromptVariablesService } from '../../../extension/prompt/node/promptVariablesService';
import { arrayEqual } from 'diff/lib/util/array.js';
import { structuralEquals } from '../../../util/vs/base/common/equals';

/**
 * Telemetry payload (parity with core's `instructionsCollected` event).
 */
export interface InstructionsCollectionEvent {
	[key: string]: number;
	applyingInstructionsCount: number;
	referencedInstructionsCount: number;
	agentInstructionsCount: number;
	listedInstructionsCount: number;
	totalInstructionsCount: number;
	claudeRulesCount: number;
	claudeMdCount: number;
	claudeAgentsCount: number;
}


export interface IAutomaticInstructionsCollectorContext {
	readonly tools: Map<vscode.LanguageModelToolInformation, boolean>;
	readonly modeInstructions2?: vscode.ChatRequestModeInstructions;
	readonly sessionResource: URI;
	readonly references: readonly vscode.ChatPromptReference[];
}

export interface IAutomaticInstructionsCollector {
	readonly _serviceBrand: undefined;
	collect(context: IAutomaticInstructionsCollectorContext, token: CancellationToken): Promise<readonly vscode.ChatPromptReference[]>;
}

export const IAutomaticInstructionsCollector = createServiceIdentifier<IAutomaticInstructionsCollector>('IAutomaticInstructionsCollector');

// Path suffix of the built-in troubleshoot skill. Excluded from the
// customizations index when agent debug log file logging is disabled,
// matching the behavior of core.
const TROUBLESHOOT_SKILL_PATH = 'troubleshoot/SKILL.md';

// Folder fragments used to detect Claude-style customizations.
const CLAUDE_AGENTS_FOLDER_PATH = '/.claude/agents';
const CLAUDE_RULES_FOLDER_PATH = '/.claude/rules/';


function isInClaudeAgentsFolder(uri: URI): boolean {
	return dirname(uri).path.endsWith(CLAUDE_AGENTS_FOLDER_PATH);
}

function isInClaudeRulesFolder(uri: URI): boolean {
	return uri.path.includes(CLAUDE_RULES_FOLDER_PATH);
}


/** Recognizes the file extensions that core treats as instruction/prompt files. */
function isPromptOrInstructionsFile(uri: URI): boolean {
	const filename = basename(uri).toLowerCase();
	if (filename.endsWith('.instructions.md') || filename.endsWith('.prompt.md') || filename.endsWith('.agent.md')) {
		return true;
	}
	if (filename === 'copilot-instructions.md') {
		return true;
	}
	if (filename === 'skill.md') {
		return true;
	}
	// Markdown files inside `.claude/rules/` are treated as instruction files.
	if (filename.endsWith('.md') && filename !== 'readme.md' && isInClaudeRulesFolder(uri)) {
		return true;
	}
	return false;
}

/**
 * Extension-side equivalent of core's `ComputeAutomaticInstructions`.
 *
 * Mirrors the four steps performed by core today:
 *   1. `applyTo` glob match against currently attached files.
 *   2. Workspace-level agent instruction files (`AGENTS.md`, `CLAUDE.md`,
 *      `copilot-instructions.md`).
 *   3. Transitive instruction-file references followed from any file
 *      already in the variable set.
 *   4. The `<instructions>…<skills>…<agents>…` customizations index text
 *      variable consumed by `CustomInstructions` /
 *      `SkillAdherenceReminder` / `skillTool`.
 */
export class AutomaticInstructionsCollector implements IAutomaticInstructionsCollector {

	declare readonly _serviceBrand: undefined;

	// Cached parse results keyed by URI to avoid re-reading instruction files
	// when several references resolve to the same target during one call.
	private readonly _parseResults = new ResourceMap<ParsedPromptFile | undefined>();

	constructor(
		@IPromptsService private readonly _promptsService: IPromptsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@IPromptPathRepresentationService private readonly _promptPathRepresentationService: IPromptPathRepresentationService,
		@IExtensionsService private readonly _extensionsService: IExtensionsService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
	) { }




	async collect({ sessionResource, references, tools, modeInstructions2 }: IAutomaticInstructionsCollectorContext, token: CancellationToken): Promise<readonly vscode.ChatPromptReference[]> {

		const telemetry = newTelemetryEvent();
		const newEntries: vscode.ChatPromptReference[] = [];
		const sessionType = getChatSessionType(sessionResource);

		// Reset per-call parse cache.
		this._parseResults.clear();

		const instructionFiles = await this._promptsService.getInstructions(token);
		const context = collectAttachedContext(references);

		// Track instruction URIs already known to the collector so the
		// applying / referenced steps don't add duplicates.
		const seenInstructionUris = new ResourceSet();
		for (const uri of context.instructions) {
			seenInstructionUris.add(uri);
		}

		// Step 1: applying instructions (applyTo glob match).
		await this._addApplyingInstructions(instructionFiles, context.files, seenInstructionUris, sessionType, telemetry, newEntries, token);
		if (token.isCancellationRequested) {
			return [];
		}

		// Step 3 (run before agent instructions to match core ordering).
		// Follow references from anything currently attached as instruction.
		await this._addReferencedInstructions(seenInstructionUris, telemetry, newEntries, token, seenInstructionUris);
		if (token.isCancellationRequested) {
			return [];
		}

		// Step 2: workspace-level agent instructions, plus referenced
		// instructions starting from copilot-instructions.md only.
		await this._addAgentInstructions(seenInstructionUris, telemetry, newEntries, token);
		if (token.isCancellationRequested) {
			return [];
		}

		// Step 4: customizations index text variable.
		const indexEntry = await this._buildCustomizationsIndex(instructionFiles, tools, modeInstructions2?.allowedSubagents, sessionType, telemetry, token);
		if (indexEntry) {
			newEntries.push(indexEntry);
			telemetry.listedInstructionsCount++;
		}

		this.sendTelemetry(telemetry);
		return newEntries;
	}

	// ─── Step 1: applyTo matching ─────────────────────────────────────────
	private async _addApplyingInstructions(
		instructionFiles: readonly vscode.ChatInstruction[],
		attachedFiles: ResourceSet,
		seenInstructionUris: ResourceSet,
		sessionType: string,
		telemetry: InstructionsCollectionEvent,
		newEntries: vscode.ChatPromptReference[],
		token: CancellationToken,
	): Promise<void> {
		const includeApplyingInstructions = this._configurationService.getNonExtensionConfig<boolean>(PromptConfig.INCLUDE_APPLYING_INSTRUCTIONS) === true;
		if (!includeApplyingInstructions) {
			this._logService.trace(`[AutomaticInstructionsCollector] includeApplyingInstructions is disabled. Skipping applying instructions.`);
			return;
		}

		for (const instructionFile of instructionFiles) {
			if (token.isCancellationRequested) {
				return;
			}
			const { uri, pattern } = instructionFile;
			if (!matchesSessionType(instructionFile.sessionTypes, sessionType)) {
				continue;
			}
			if (!pattern) {
				this._logService.trace(`[AutomaticInstructionsCollector] No applyTo pattern: ${uri.toString()}`);
				continue;
			}
			if (seenInstructionUris.has(uri)) {
				continue;
			}
			const matchInfo = matchesAttachedFiles(attachedFiles, pattern);
			if (!matchInfo) {
				continue;
			}
			const reason = matchInfo.file === undefined
				? l10n.t('automatically attached as pattern is **')
				: l10n.t('automatically attached as pattern {0} matches {1}', pattern, this._workspaceService.asRelativePath(matchInfo.file));

			newEntries.push(toInstructionFileReference(uri, /* isRoot */ true, reason));
			seenInstructionUris.add(uri);
			telemetry.applyingInstructionsCount++;
			if (isInClaudeRulesFolder(uri)) {
				telemetry.claudeRulesCount++;
			}
		}
	}

	// ─── Step 2: workspace agent instructions ────────────────────────────
	private async _addAgentInstructions(
		seenInstructionUris: ResourceSet,
		telemetry: InstructionsCollectionEvent,
		newEntries: vscode.ChatPromptReference[],
		token: CancellationToken,
	): Promise<void> {
		const logger = {
			logInfo: (message: string) => this._logService.trace(`[AutomaticInstructionsCollector] ${message}`),
		};
		const allCandidates = await this._promptsService.listAgentInstructions(token, logger);
		if (token.isCancellationRequested || allCandidates.length === 0) {
			return;
		}

		// Track copilot-instructions.md entries separately so we can follow
		// their transitive references afterwards (matches core behavior).
		const copilotUris = new ResourceSet();
		for (const candidate of allCandidates) {
			if (seenInstructionUris.has(candidate.uri)) {
				continue;
			}
			seenInstructionUris.add(candidate.uri);
			newEntries.push(toInstructionFileReference(candidate.uri, /* isRoot */ true, /* reason */ undefined));
			telemetry.agentInstructionsCount++;
			if (candidate.type === AgentInstructionFileType.claudeMd) {
				telemetry.claudeMdCount++;
			}
			if (candidate.type === AgentInstructionFileType.copilotInstructionsMd) {
				copilotUris.add(candidate.uri);
			}
		}

		if (copilotUris.size > 0) {
			await this._addReferencedInstructions(copilotUris, telemetry, newEntries, token, /* additionalSeen */ seenInstructionUris);
		}
	}

	// ─── Step 3: transitive instruction-file references ───────────────────
	private async _addReferencedInstructions(
		startingFrom: ResourceSet,
		telemetry: InstructionsCollectionEvent,
		newEntries: vscode.ChatPromptReference[],
		token: CancellationToken,
		additionalSeen?: ResourceSet,
	): Promise<void> {
		const includeReferencedInstructions = this._configurationService.getNonExtensionConfig<boolean>(PromptConfig.INCLUDE_REFERENCED_INSTRUCTIONS) === true;
		if (!includeReferencedInstructions) {
			this._logService.trace(`[AutomaticInstructionsCollector] includeReferencedInstructions is disabled. Skipping referenced instructions.`);
			return;
		}

		const queue: URI[] = [];
		const seen = new ResourceSet();
		for (const uri of startingFrom) {
			seen.add(uri);
			queue.push(uri);
		}
		if (additionalSeen) {
			for (const uri of additionalSeen) {
				seen.add(uri);
			}
		}

		while (queue.length > 0) {
			if (token.isCancellationRequested) {
				return;
			}
			const next = queue.pop()!;
			const parsed = await this._parseInstructionsFile(next, token);
			if (!parsed?.body) {
				continue;
			}

			// Resolve all referenced URIs from this file's body.
			const candidates: URI[] = [];
			for (const ref of parsed.body.fileReferences) {
				const resolved = parsed.body.resolveFilePath(ref.content);
				if (!resolved || seen.has(resolved)) {
					continue;
				}
				// Only follow references that are either prompt/instruction
				// files or live inside one of the workspace folders.
				const inWorkspace = this._workspaceService.getWorkspaceFolder(resolved) !== undefined;
				if (!isPromptOrInstructionsFile(resolved) && !inWorkspace) {
					continue;
				}
				seen.add(resolved);
				candidates.push(resolved);
			}

			if (candidates.length === 0) {
				continue;
			}

			// Verify each candidate exists and is a regular file before
			// adding it to the variable set.
			const stats = await Promise.all(candidates.map(async uri => {
				try {
					const stat = await this._fileSystemService.stat(uri);
					return { uri, isFile: (stat.type & FileType.File) !== 0 };
				} catch {
					return { uri, isFile: false };
				}
			}));
			for (const { uri, isFile } of stats) {
				if (!isFile) {
					continue;
				}
				if (isPromptOrInstructionsFile(uri)) {
					queue.push(uri);
				}
				const reason = l10n.t('Referenced by {0}', basename(next));
				newEntries.push(toInstructionFileReference(uri, /* isRoot */ false, reason));
				if (additionalSeen) {
					additionalSeen.add(uri);
				}
				telemetry.referencedInstructionsCount++;
				this._logService.trace(`[AutomaticInstructionsCollector] ${uri.toString()} added (referenced by ${next.toString()})`);
			}
		}
	}

	// ─── Step 4: customizations index ─────────────────────────────────────
	private async _buildCustomizationsIndex(
		instructionFiles: readonly vscode.ChatInstruction[],
		tools: Map<vscode.LanguageModelToolInformation, boolean>,
		enabledSubagents: readonly string[] | undefined,
		sessionType: string,
		telemetry: InstructionsCollectionEvent,
		token: CancellationToken,
	): Promise<vscode.ChatPromptReference | undefined> {
		let readTool, skillTool, runSubagentTool;
		for (const [tool, enabled] of tools) {
			if (enabled) {
				const toolName = getToolName(tool.name);
				if (toolName === ToolName.ReadFile) {
					readTool = tool;
				} else if (toolName === ToolName.CoreRunSubagent) {
					runSubagentTool = tool;
				} else if (toolName === ToolName.Skill) {
					skillTool = tool;
				}
			}
		}

		const filePath = (uri: URI) => this._promptPathRepresentationService.getFilePath(uri);
		const lines: string[] = [];

		// ── <instructions> section ──────────────────────────────────────
		if (readTool) {
			const useNestedAgentMd = this._configurationService.getNonExtensionConfig<boolean>(PromptConfig.USE_NESTED_AGENT_MD) === true;
			const nestedAgentsMdPromise = useNestedAgentMd ? this._promptsService.listNestedAgentMDs(token) : Promise.resolve([] as IAgentInstructionFile[]);

			lines.push('<instructions>');
			lines.push('Here is a list of instruction files that contain rules for working with this codebase.');
			lines.push('These files are important for understanding the codebase structure, conventions, and best practices.');
			lines.push('When an instruction file applies to your task (based on its description or applyTo pattern), follow the rules specified in it.');
			lines.push(`If the file content is not already included in the context, use the ${getToolReferencePromptContent(readTool)} tool to read it before proceeding. Use the exact value from the <file> element as-is with the tool; do not add or remove prefixes or otherwise modify it.`);
			lines.push('Only load instruction files when they are relevant to the current task. Do not eagerly load all instructions upfront.');
			lines.push('When modifying or creating files, check for instructions whose applyTo pattern matches the file path and follow them.');

			let hasContent = false;
			for (const instruction of instructionFiles) {
				if (!matchesSessionType(instruction.sessionTypes, sessionType)) {
					continue;
				}
				lines.push('<instruction>');
				lines.push(`<file>${filePath(instruction.uri)}</file>`);
				if (instruction.description) {
					lines.push(`<description>${instruction.description}</description>`);
				}
				if (instruction.pattern) {
					lines.push(`<applyTo>${instruction.pattern}</applyTo>`);
				}
				lines.push('</instruction>');
				hasContent = true;
			}

			const nestedAgentsMd = await nestedAgentsMdPromise;
			for (const { uri } of nestedAgentsMd) {
				const folderName = this._workspaceService.asRelativePath(dirname(uri));
				const description = folderName.trim().length === 0
					? l10n.t('Instructions for the workspace')
					: l10n.t('Instructions for folder \'{0}\'', folderName);
				lines.push('<instruction>');
				lines.push(`<file>${filePath(uri)}</file>`);
				lines.push(`<description>${description}</description>`);
				lines.push('</instruction>');
				hasContent = true;
			}

			if (!hasContent) {
				lines.length = 0; // discard instructions block
			} else {
				lines.push('</instructions>', '', '');
			}

			// ── <skills> section (lives inside the readTool branch) ───────
			const allSkills = await this._promptsService.getSkills(token);
			const isFileLoggingEnabled = this._configurationService.getExperimentBasedConfig<boolean>(ConfigKey.Advanced.ChatDebugFileLogging, this._experimentationService) === true;
			const modelInvocableSkills = allSkills.filter(skill => {
				if (!skill.description) {
					return false;
				}
				if (skill.disableModelInvocation) {
					return false;
				}
				if (!matchesSessionType(skill.sessionTypes, sessionType)) {
					return false;
				}
				if (!isFileLoggingEnabled && skill.uri.path.includes(TROUBLESHOOT_SKILL_PATH)) {
					return false;
				}
				return true;
			});
			if (modelInvocableSkills.length > 0) {
				this._logSkillLoadedTelemetry(modelInvocableSkills);

				const useSkillAdherencePrompt = this._configurationService.getNonExtensionConfig<boolean>(PromptConfig.USE_SKILL_ADHERENCE_PROMPT) === true;
				// Direct the model to invoke skills via the dedicated skill
				// tool when available, falling back to readFile otherwise.
				const skillLoadTool = skillTool ?? readTool;
				lines.push('<skills>');
				if (useSkillAdherencePrompt) {
					lines.push('Skills provide specialized capabilities, domain knowledge, and refined workflows for producing high-quality outputs. Each skill folder contains tested instructions for specific domains like testing strategies, API design, or performance optimization. Multiple skills can be combined when a task spans different domains.');
					if (skillTool) {
						lines.push(`BLOCKING REQUIREMENT: When a skill applies to the user's request, you MUST invoke it IMMEDIATELY as your first action, BEFORE generating any other response or taking action on the task. Use ${getToolReferencePromptContent(skillLoadTool)} with the skill name to load the relevant skill(s).`);
					} else {
						lines.push(`BLOCKING REQUIREMENT: When a skill applies to the user's request, you MUST load and read the SKILL.md file IMMEDIATELY as your first action, BEFORE generating any other response or taking action on the task. Use ${getToolReferencePromptContent(readTool)} to load the relevant skill(s).`);
					}
					lines.push('NEVER just mention or reference a skill in your response without actually loading it first. If a skill is relevant, load it before proceeding.');
					lines.push('How to determine if a skill applies:');
					lines.push('1. Review the available skills below and match their descriptions against the user\'s request');
					lines.push('2. If any skill\'s domain overlaps with the task, load that skill immediately');
					lines.push('3. When multiple skills apply (e.g., a flowchart in documentation), load all relevant skills');
					lines.push('Examples:');
					lines.push(`- "Help me write unit tests for this module" -> Load the testing skill via ${getToolReferencePromptContent(skillLoadTool)} FIRST, then proceed`);
					lines.push(`- "Optimize this slow function" -> Load the performance-profiling skill via ${getToolReferencePromptContent(skillLoadTool)} FIRST, then proceed`);
					lines.push(`- "Add a discount code field to checkout" -> Load both the checkout-flow and form-validation skills FIRST`);
					lines.push('Available skills:');
				} else {
					if (skillTool) {
						lines.push('Here is a list of skills that contain domain specific knowledge on a variety of topics.');
						lines.push(`When a user asks you to perform a task that falls within the domain of a skill, use the ${getToolReferencePromptContent(skillTool)} tool with the skill name to load it.`);
					} else {
						lines.push('Here is a list of skills that contain domain specific knowledge on a variety of topics.');
						lines.push('Each skill comes with a description of the topic and a file path that contains the detailed instructions.');
						lines.push(`When a user asks you to perform a task that falls within the domain of a skill, use the ${getToolReferencePromptContent(readTool)} tool to acquire the full instructions from the file URI.`);
					}
				}

				const SKILL_DESCRIPTION_CHAR_BUDGET = 15000;
				const TRUNCATED_NAMES_CHAR_BUDGET = 5000;
				let skillCharCount = 0;
				let truncatedAtIndex = modelInvocableSkills.length;
				for (let i = 0; i < modelInvocableSkills.length; i++) {
					const skill = modelInvocableSkills[i];
					const skillEntry = ['<skill>', `<name>${skill.name}</name>`];
					if (skill.description) {
						skillEntry.push(`<description>${skill.description}</description>`);
					}
					skillEntry.push(`<file>${filePath(skill.uri)}</file>`);
					skillEntry.push('</skill>');
					const entryLength = skillEntry.join('\n').length + 1;
					if (skillTool && skillCharCount + entryLength > SKILL_DESCRIPTION_CHAR_BUDGET) {
						truncatedAtIndex = i;
						break;
					}
					skillCharCount += entryLength;
					lines.push(...skillEntry);
				}
				if (truncatedAtIndex < modelInvocableSkills.length) {
					const truncatedSkills = modelInvocableSkills.slice(truncatedAtIndex);
					const names: string[] = [];
					let nameListLength = 0;
					for (const skill of truncatedSkills) {
						const addition = (names.length > 0 ? 2 : 0) + skill.name.length;
						if (nameListLength + addition > TRUNCATED_NAMES_CHAR_BUDGET) {
							break;
						}
						nameListLength += addition;
						names.push(skill.name);
					}
					const remaining = truncatedSkills.length - names.length;
					const nameList = names.join(', ');
					lines.push(remaining > 0
						? `Additional skills available (invoke by name): ${nameList}... and ${remaining} more`
						: `Additional skills available (invoke by name): ${nameList}`);
				}
				lines.push('</skills>', '', '');
			}
		}

		// ── <agents> section ────────────────────────────────────────────
		if (runSubagentTool) {
			const customAgents = (await this._promptsService.getCustomAgents(token)).filter(a => a.enabled);

			const canInvokeAgent = (agent: vscode.ChatCustomAgent): boolean => {
				if (!matchesSessionType(agent.sessionTypes, sessionType)) {
					return false;
				}
				if (enabledSubagents && !enabledSubagents.includes('*')) {
					return enabledSubagents.includes(agent.name);
				}
				// Default visibility: agent must be invocable by the model.
				return !agent.disableModelInvocation;
			};

			if (customAgents.length > 0) {
				lines.push('<agents>');
				lines.push('Here is a list of agents that can be used when running a subagent.');
				lines.push('Each agent has optionally a description with the agent\'s purpose and expertise. When asked to run a subagent, choose the most appropriate agent from this list.');
				lines.push(`Use the ${getToolReferencePromptContent(runSubagentTool)} tool with the agent name to run the subagent.`);

				for (const agent of customAgents) {
					if (!canInvokeAgent(agent)) {
						continue;
					}
					lines.push('<agent>');
					lines.push(`<name>${agent.name}</name>`);
					if (agent.description) {
						lines.push(`<description>${agent.description}</description>`);
					}
					if (agent.argumentHint) {
						lines.push(`<argumentHint>${agent.argumentHint}</argumentHint>`);
					}
					lines.push('</agent>');
					if (isInClaudeAgentsFolder(agent.uri)) {
						telemetry.claudeAgentsCount++;
					}
				}
				lines.push('</agents>', '', '');
			}
		}

		if (lines.length === 0) {
			return undefined;
		}


		return toCustomizationsIndexReference(lines.join('\n'));
	}

	private async _parseInstructionsFile(uri: URI, token: CancellationToken): Promise<ParsedPromptFile | undefined> {
		if (this._parseResults.has(uri)) {
			return this._parseResults.get(uri);
		}
		try {
			const result = await this._promptsService.parseFile(uri, token);
			this._parseResults.set(uri, result);
			return result;
		} catch (error) {
			this._logService.error(`[AutomaticInstructionsCollector] Failed to parse instruction file: ${uri.toString()}`, error);
			this._parseResults.set(uri, undefined);
			return undefined;
		}
	}

	// Mirror of core's `skillLoadedIntoContext` per-skill telemetry.
	private _logSkillLoadedTelemetry(skills: readonly vscode.ChatSkill[]): void {
		try {
			const hashOrEmpty = (value: string | undefined) => value !== undefined ? String(hash(value)) : '';
			for (const skill of skills) {
				const extension = skill.extensionId ? this._extensionsService.getExtension(skill.extensionId) : undefined;
				const extensionVersion = (extension?.packageJSON as { version?: string } | undefined)?.version ?? '';
				this._telemetryService.sendMSFTTelemetryEvent('skillLoadedIntoContext', {
					skillNameHash: hashOrEmpty(skill.name),
					skillStorage: skill.source,
					extensionIdHash: hashOrEmpty(skill.extensionId),
					extensionVersion,
					// Plugin-name/version is not exposed on `ChatSkill` today
					// — leave empty until the API surfaces it.
					pluginNameHash: '',
					pluginVersion: '',
				});
			}
		} catch (err) {
			this._logService.error('[AutomaticInstructionsCollector] Failed to log skill telemetry', err);
		}
	}
	private sendTelemetry(telemetryEvent: InstructionsCollectionEvent): void {
		telemetryEvent.totalInstructionsCount = telemetryEvent.agentInstructionsCount + telemetryEvent.referencedInstructionsCount + telemetryEvent.applyingInstructionsCount + telemetryEvent.listedInstructionsCount;
		/* __GDPR__
			"instructionsCollected" : {
				"owner": "digitarald",
				"comment": "Tracks automatic instruction collection usage in chat prompt system.",
				"applyingInstructionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of instructions added via pattern matching." },
				"referencedInstructionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of instructions added via references from other instruction files." },
				"agentInstructionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of agent instructions added (copilot-instructions.md and agents.md)." },
				"listedInstructionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of instruction patterns added." },
				"totalInstructionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of instruction entries added to variables." },
				"claudeRulesCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of Claude rules files (.claude/rules/) added via pattern matching." },
				"claudeMdCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of CLAUDE.md agent instruction files added." },
				"claudeAgentsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of Claude agent files (.claude/agents/) listed as subagents." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('instructionsCollected', undefined, telemetryEvent);
	}


}

// ─── Helpers ──────────────────────────────────────────────────────────────


function newTelemetryEvent(): InstructionsCollectionEvent {
	return {
		applyingInstructionsCount: 0,
		referencedInstructionsCount: 0,
		agentInstructionsCount: 0,
		listedInstructionsCount: 0,
		totalInstructionsCount: 0,
		claudeRulesCount: 0,
		claudeMdCount: 0,
		claudeAgentsCount: 0,
	};
}

/** Splits the existing variable set into attached files vs. instructions. */
function collectAttachedContext(references: readonly vscode.ChatPromptReference[]): { files: ResourceSet; instructions: ResourceSet } {
	const files = new ResourceSet();
	const instructions = new ResourceSet();
	for (const reference of references) {
		if (isInstructionFile(reference)) {
			instructions.add(reference.value);
		} else if (URI.isUri(reference.value)) {
			files.add(reference.value);
		} else if (isLocation(reference.value)) {
			files.add(reference.value.uri);
		}
	}
	return { files, instructions };
}

/**
 * Returns the matched glob pattern (and optionally the matching file URI)
 * for `applyToPattern` against `attachedFiles`. Mirrors core's `_matches`.
 */
function matchesAttachedFiles(attachedFiles: ResourceSet, applyToPattern: string): { pattern: string; file?: URI } | undefined {
	const patterns = splitGlobAware(applyToPattern, ',');
	for (const raw of patterns) {
		let pattern = raw.trim();
		if (pattern.length === 0) {
			continue;
		}
		// Special wildcards apply even when there are no attached files.
		if (pattern === '**' || pattern === '**/*' || pattern === '*') {
			return { pattern };
		}
		// Allow relative globs like `src/**/*.ts`.
		if (!pattern.startsWith('/') && !pattern.startsWith('**/')) {
			pattern = '**/' + pattern;
		}
		for (const file of attachedFiles) {
			if (globMatch(pattern, file.path, { ignoreCase: true })) {
				return { pattern, file };
			}
		}
	}
	return undefined;
}

function formatDiffLine(line: string): string {
	const MAX_LINE_LENGTH = 200;
	const normalized = line.replace(/\r/g, '\\r').replace(/\t/g, '\\t');
	if (normalized.length <= MAX_LINE_LENGTH) {
		return normalized;
	}
	return `${normalized.slice(0, MAX_LINE_LENGTH)}...`;
}

function toLineStarts(text: string): number[] {
	const starts = [0];
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) === 10) {
			starts.push(i + 1);
		}
	}
	return starts;
}

function charIndexToLine(index: number, lineStarts: readonly number[]): number {
	if (lineStarts.length === 0) {
		return 0;
	}
	let low = 0;
	let high = lineStarts.length - 1;
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		if (lineStarts[mid] <= index) {
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}
	return Math.max(0, Math.min(high, lineStarts.length - 1));
}

function formatStringDiff(original: string, modified: string): string {
	const CONTEXT_LINES = 2;
	const MAX_HUNKS = 8;
	const rawChanges = stringDiff(original, modified, true);
	if (rawChanges.length === 0) {
		return 'no textual difference';
	}

	const originalLines = original.split('\n');
	const modifiedLines = modified.split('\n');
	const originalStarts = toLineStarts(original);
	const modifiedStarts = toLineStarts(modified);

	// Convert character-level changes into line-level ranges so logs can show
	// compact unified-style hunks with surrounding unchanged context lines.
	const changes = rawChanges.map(change => {
		const originalStart = charIndexToLine(change.originalStart, originalStarts);
		const modifiedStart = charIndexToLine(change.modifiedStart, modifiedStarts);
		const originalEnd = change.originalLength === 0
			? originalStart
			: charIndexToLine(change.originalStart + change.originalLength - 1, originalStarts) + 1;
		const modifiedEnd = change.modifiedLength === 0
			? modifiedStart
			: charIndexToLine(change.modifiedStart + change.modifiedLength - 1, modifiedStarts) + 1;
		return { originalStart, originalEnd, modifiedStart, modifiedEnd };
	});

	const hunks: Array<{ originalStart: number; originalEnd: number; modifiedStart: number; modifiedEnd: number; firstChange: number; lastChange: number }> = [];
	for (let i = 0; i < changes.length; i++) {
		const change = changes[i];
		const prev = hunks[hunks.length - 1];
		if (!prev) {
			hunks.push({ ...change, firstChange: i, lastChange: i });
			continue;
		}

		const originalGap = change.originalStart - prev.originalEnd;
		const modifiedGap = change.modifiedStart - prev.modifiedEnd;
		if (originalGap <= CONTEXT_LINES * 2 && modifiedGap <= CONTEXT_LINES * 2) {
			prev.originalEnd = Math.max(prev.originalEnd, change.originalEnd);
			prev.modifiedEnd = Math.max(prev.modifiedEnd, change.modifiedEnd);
			prev.lastChange = i;
		} else {
			hunks.push({ ...change, firstChange: i, lastChange: i });
		}
	}

	const lines: string[] = [];
	const shownHunks = Math.min(hunks.length, MAX_HUNKS);
	for (let i = 0; i < shownHunks; i++) {
		const hunk = hunks[i];
		const hunkChanges = changes.slice(hunk.firstChange, hunk.lastChange + 1);

		const originalWindowStart = Math.max(0, hunk.originalStart - CONTEXT_LINES);
		const originalWindowEnd = Math.min(originalLines.length, hunk.originalEnd + CONTEXT_LINES);
		const modifiedWindowStart = Math.max(0, hunk.modifiedStart - CONTEXT_LINES);
		const modifiedWindowEnd = Math.min(modifiedLines.length, hunk.modifiedEnd + CONTEXT_LINES);

		lines.push(`@@ -${originalWindowStart + 1},${Math.max(0, originalWindowEnd - originalWindowStart)} +${modifiedWindowStart + 1},${Math.max(0, modifiedWindowEnd - modifiedWindowStart)} @@`);

		let originalCursor = originalWindowStart;
		let modifiedCursor = modifiedWindowStart;
		for (const change of hunkChanges) {
			while (originalCursor < change.originalStart && modifiedCursor < change.modifiedStart) {
				lines.push(` ${formatDiffLine(originalLines[originalCursor])}`);
				originalCursor++;
				modifiedCursor++;
			}

			for (let o = change.originalStart; o < change.originalEnd; o++) {
				lines.push(`-${formatDiffLine(originalLines[o])}`);
			}
			for (let m = change.modifiedStart; m < change.modifiedEnd; m++) {
				lines.push(`+${formatDiffLine(modifiedLines[m])}`);
			}

			originalCursor = Math.max(originalCursor, change.originalEnd);
			modifiedCursor = Math.max(modifiedCursor, change.modifiedEnd);
		}

		while (originalCursor < originalWindowEnd && modifiedCursor < modifiedWindowEnd) {
			lines.push(` ${formatDiffLine(originalLines[originalCursor])}`);
			originalCursor++;
			modifiedCursor++;
		}
	}

	if (hunks.length > shownHunks) {
		lines.push(`... ${hunks.length - shownHunks} additional hunks omitted`);
	}

	return lines.join('\n');
}

export class CustomInstructionsReferenceLogger {
	constructor(
		@IOTelService private readonly _otelService: IOTelService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IPromptVariablesService private readonly _promptVariablesService: IPromptVariablesService,
		@ICustomInstructionsService private readonly _customInstructionsService: ICustomInstructionsService
	) { }

	async logReferences(sessionId: string | undefined, references: readonly vscode.ChatPromptReference[], collectInstructionsInExtension: boolean): Promise<void> {
		const customInstructionsDebugInfo = await this.toCustomInstructionsDebugInfo(references);
		const span = this._otelService.startSpan('collect_automatic_instructions', {
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.CONTENT_EVENT,
				...(sessionId ? { [CopilotChatAttr.CHAT_SESSION_ID]: sessionId } : {}),
			},
		});
		span.setAttributes({
			[CopilotChatAttr.DEBUG_NAME]: `Custom Instructions`,
			'copilot_chat.event_category': 'discovery',
			'copilot_chat.event_details': ICustomInstructionsDebugInfo.formatAgentDebugLog(customInstructionsDebugInfo) + (collectInstructionsInExtension ? '\n(collected in extension)' : '\n(collected in core)'),
		});
		span.end();
	}

	async compare({ sessionResource, references, tools, modeInstructions2 }: IAutomaticInstructionsCollectorContext, collector: IAutomaticInstructionsCollector, token: CancellationToken): Promise<void> {
		const core = references.filter(r => isInstructionFile(r) || isCustomizationsIndex(r));
		const without = references.filter(r => !isInstructionFile(r) && !isCustomizationsIndex(r));

		const result = await collector.collect({ sessionResource, references: without, tools, modeInstructions2 }, token);

		const coreInfo = await this.toCustomInstructionsDebugInfo(core);
		const extInfo = await this.toCustomInstructionsDebugInfo(result);
		const isMatch = ICustomInstructionsDebugInfo.equals(coreInfo, extInfo);
		if (!isMatch) {
			const diff = ICustomInstructionsDebugInfo.formatDiff(coreInfo, extInfo, true);
			this._logService.info(`[AutomaticInstructionsCollector] Core vs extension instructions mismatch:\n--- diff ---\n${diff}`);
		} else {
			this._logService.info(`[AutomaticInstructionsCollector] Core vs extension instructions match (${core.length} entries)`);
		}

		// Internal-only parity signal for comparing core vs extension instruction collection.
		const simpleDiff = isMatch ? ICustomInstructionsDebugInfo.formatDiff(coreInfo, extInfo, false) : '';
		this._telemetryService.sendInternalMSFTTelemetryEvent('automaticInstructionsCollectionComparison', { diff: simpleDiff }, { isMatch: isMatch ? 1 : 0 });
	}

	private async toIndexDebugInfo(content: string, toolReferences: readonly vscode.ChatLanguageModelToolReference[] | undefined): Promise<IndexDebugInfo> {
		if (toolReferences?.length) {
			content = await this._promptVariablesService.resolveToolReferencesInPrompt(content, toolReferences);
		}
		const indexFile = this._customInstructionsService.parseInstructionIndexFile(content);
		return {
			agents: Array.from(indexFile.agents.keys()),
			instructions: Array.from(indexFile.instructions.values()).map(instr => instr.toString()).sort(),
			skills: Array.from(indexFile.skills).map(skill => skill.toString()).sort(),
			content
		};
	}

	private async toCustomInstructionsDebugInfo(references: readonly vscode.ChatPromptReference[]): Promise<ICustomInstructionsDebugInfo> {
		const instructions = references.filter(isInstructionFile).map(ref => ref.value.toString()).sort();
		const index = references.find(isCustomizationsIndex);
		const indexInfo = index ? await this.toIndexDebugInfo(index.value, index.toolReferences) : undefined;
		return { instructions, index: indexInfo };
	}

}

interface IndexDebugInfo {
	instructions: string[];
	skills: string[];
	agents: string[];
	content: string;
}

interface ICustomInstructionsDebugInfo {
	instructions: string[];
	index: IndexDebugInfo | undefined;
}

namespace ICustomInstructionsDebugInfo {
	export function equals(a: ICustomInstructionsDebugInfo, b: ICustomInstructionsDebugInfo): boolean {
		return structuralEquals(a, b);
	}
	function formatNames(a: string[]): string {
		return a.join(', ');
	}
	function formatFileNames(a: string[]): string {
		return a.map(i => posix.basename(i)).join(', ');
	}
	function formatSkillNames(a: string[]): string {
		return a.map(i => posix.basename(posix.dirname(i))).join(', ');
	}
	export function formatAgentDebugLog(a: ICustomInstructionsDebugInfo): string {
		const result = [];
		result.push(`context included: [${a.instructions.length}] ${formatFileNames(a.instructions)}`);
		if (a.index) {
			result.push(`on-demand loading:`);
			result.push(` instructions: [${a.index.instructions.length}] ${formatFileNames(a.index.instructions)}`);
			result.push(` skills: [${a.index.skills.length}] ${formatSkillNames(a.index.skills)}`);
			result.push(` agents: [${a.index.agents.length}] ${formatFileNames(a.index.agents)}`);
		}
		return result.join('\n');
	}

	export function formatDiff(a: ICustomInstructionsDebugInfo, b: ICustomInstructionsDebugInfo, verbose: boolean): string {
		const result = [];
		if (!arrayEqual(a.instructions, b.instructions)) {
			result.push('-' + formatFileNames(a.instructions));
			result.push('+' + formatFileNames(b.instructions));
		}

		const aIndex = a.index;
		const bIndex = b.index;
		if (aIndex === undefined && bIndex !== undefined) {
			result.push('index: -undefined +defined');
		} else if (aIndex !== undefined && bIndex === undefined) {
			result.push('index: -defined +undefined');
		} else if (aIndex !== undefined && bIndex !== undefined) {
			if (!arrayEqual(aIndex.agents, bIndex.agents)) {
				result.push('agents: -' +formatNames(aIndex.agents));
				result.push('agents: +' + formatNames(bIndex.agents));
			}
			if (!arrayEqual(aIndex.instructions, bIndex.instructions)) {
				result.push('index.instructions: -' + formatFileNames(aIndex.instructions));
				result.push('index.instructions: +' + formatFileNames(bIndex.instructions));
			}
			if (!arrayEqual(aIndex.skills, bIndex.skills)) {
				result.push('skills: -' + formatSkillNames(aIndex.skills));
				result.push('skills: +' + formatSkillNames(bIndex.skills));
			}
			if (aIndex.content !== bIndex.content) {
				result.push('content diff:');
				result.push(verbose ? formatStringDiff(aIndex.content, bIndex.content) : '');
			}
		}

		return result.join('\n');
	}
}
