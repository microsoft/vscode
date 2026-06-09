/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ICustomInstructionsService } from '../../../platform/customInstructions/common/customInstructionsService';
import { SKILL_FILENAME } from '../../../platform/customInstructions/common/promptTypes';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IExtensionsService } from '../../../platform/extensions/common/extensionsService';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { equalsIgnoreCase } from '../../../util/vs/base/common/strings';
import { isString } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { ExtendedLanguageModelToolResult, LanguageModelTextPart, MarkdownString } from '../../../vscodeTypes';
import { isCustomizationsIndex } from '../../prompt/common/chatVariablesCollection';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { ToolName } from '../common/toolNames';
import { CopilotToolMode, ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { IToolsService } from '../common/toolsService';
import { formatUriForFileWidget } from '../common/toolUtils';
import { sendSkillContentReadTelemetry } from '../common/skillTelemetry';

export interface ISkillParams {
	/** The skill name. E.g., "commit", "review-pr", or "pdf" */
	skill: string;
}

/** Maximum number of related files to list in skill context */
const MAX_RELATED_FILES = 50;

/** Directories to skip when listing related files */
const SKILL_SKIP_DIRS = new Set([
	'.git', 'node_modules', 'dist', 'build', 'out', '.cache',
	'coverage', '__pycache__', 'target', 'bin', 'obj', '.venv', 'venv',
]);

class SkillTool implements ICopilotTool<ISkillParams> {
	public static readonly toolName = ToolName.Skill;
	public static readonly nonDeferred = true;
	private _inputContext: IBuildPromptContext | undefined;

	constructor(
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ICustomInstructionsService private readonly customInstructionsService: ICustomInstructionsService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IToolsService private readonly toolsService: IToolsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IExtensionsService private readonly extensionsService: IExtensionsService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ISkillParams>, token: vscode.CancellationToken) {
		const uri = this.resolveSkillUri(options.input.skill);

		// Read the skill file content
		const document = await this.workspaceService.openTextDocument(uri);
		const snapshot = TextDocumentSnapshot.create(document);
		const skillContent = snapshot.getText();

		// Emit skill content read telemetry
		const skillInfo = this.customInstructionsService.getSkillInfo(uri);
		if (skillInfo) {
			sendSkillContentReadTelemetry(this.telemetryService, this.customInstructionsService, this.extensionsService, uri, skillInfo, skillContent);
		}

		const mode = parseSkillContext(skillContent);

		if (mode === 'fork') {
			return this.invokeFork(skillContent, uri, options, token);
		} else {
			return this.invokeInline(skillContent, uri);
		}
	}

	private async invokeInline(skillContent: string, uri: URI) {
		const skillInfo = this.customInstructionsService.getSkillInfo(uri);
		const skillLabel = skillInfo?.skillName ?? 'skill';
		const skillFolderUri = skillInfo?.skillFolderUri ?? extUriBiasedIgnorePathCase.dirname(uri);

		// List related files in the skill directory
		const relatedFiles = await this.listRelatedFiles(skillFolderUri);
		const relatedFilesSection = relatedFiles.length > 0
			? `\nRelated files (use read_file tool to read):\n${relatedFiles.map(f => `  - ${f}`).join('\n')}\n`
			: '';

		const resultText = `<skill-context name="${skillLabel}">
Base directory: ${skillFolderUri.fsPath}
${relatedFilesSection}
${skillContent}
</skill-context>`;

		const result = new ExtendedLanguageModelToolResult([new LanguageModelTextPart(resultText)]);
		result.toolResultMessage = new MarkdownString(l10n.t`Loaded skill: ${skillLabel}`);
		result.toolMetadata = {
			skill: skillLabel,
			skillUri: uri.toString(),
			agentName: 'skill'
		};
		return result;
	}

	private async invokeFork(skillContent: string, uri: URI, options: vscode.LanguageModelToolInvocationOptions<ISkillParams>, token: vscode.CancellationToken) {
		const skillInfo = this.customInstructionsService.getSkillInfo(uri);
		const skillLabel = skillInfo?.skillName ?? options.input.skill;

		// Use the user's original message as the task for the subagent
		const userMessage = this._inputContext?.conversation?.turns[0]?.request.message;
		const query = userMessage ?? `Run the ${skillLabel} skill`;

		// Embed skill instructions in the prompt for the subagent
		const prompt = `You have been loaded with the following skill instructions. Follow them carefully to complete the task.

<skill_instructions>
${skillContent}
</skill_instructions>

Task: ${query}`;

		// Delegate to the runSubagent tool which goes through the full VS Code chat
		// pipeline (automatic instructions, hooks, model resolution, nesting depth, etc.)
		const subagentResult = await this.toolsService.invokeTool(ToolName.CoreRunSubagent, {
			...options,
			input: {
				prompt,
				description: `Skill: ${skillLabel}`,
			},
		}, token);

		// Extract text from the subagent result
		const parts: string[] = [];
		for (const part of subagentResult.content) {
			if (part instanceof LanguageModelTextPart) {
				parts.push(part.value);
			}
		}
		const subagentResponse = parts.join('') || 'Skill completed with no output';

		// Frame the result as skill output (not as another agent's response) so the
		// parent agent summarizes the content naturally without treating it as a
		// conversation with a separate agent.
		const result = new ExtendedLanguageModelToolResult([new LanguageModelTextPart(
			`Result from the "${skillLabel}" skill:\n\n${subagentResponse}`
		)]);
		result.toolMetadata = {
			skill: options.input.skill,
			skillUri: uri.toString(),
			agentName: 'skill'
		};
		result.toolResultMessage = new MarkdownString(l10n.t`Skill complete: ${skillLabel}`);
		return result;
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ISkillParams>, _token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation | undefined> {
		let uri: URI;
		try {
			uri = this.resolveSkillUri(options.input.skill);
		} catch {
			return {
				invocationMessage: new MarkdownString(l10n.t`Loading skill: ${options.input.skill}`),
			};
		}

		await this.customInstructionsService.refreshExtensionPromptFiles();
		const skillInfo = this.customInstructionsService.getSkillInfo(uri);
		const skillLabel = skillInfo?.skillName ?? options.input.skill;

		// Read the skill file to check frontmatter for context: fork
		const document = await this.workspaceService.openTextDocument(uri);
		const snapshot = TextDocumentSnapshot.create(document);
		const mode = parseSkillContext(snapshot.getText());

		if (mode === 'fork') {
			return {
				invocationMessage: new MarkdownString(l10n.t`Running skill ${formatUriForFileWidget(uri, { vscodeLinkType: 'skill', linkText: skillLabel })}`),
				pastTenseMessage: new MarkdownString(l10n.t`Ran skill ${formatUriForFileWidget(uri, { vscodeLinkType: 'skill', linkText: skillLabel })}`),
			};
		}

		return {
			invocationMessage: new MarkdownString(l10n.t`Loading skill ${formatUriForFileWidget(uri, { vscodeLinkType: 'skill', linkText: skillLabel })}`),
			pastTenseMessage: new MarkdownString(l10n.t`Loaded skill ${formatUriForFileWidget(uri, { vscodeLinkType: 'skill', linkText: skillLabel })}`),
		};
	}

	async resolveInput(input: ISkillParams, promptContext: IBuildPromptContext, _mode: CopilotToolMode): Promise<ISkillParams> {
		this._inputContext = promptContext;
		return input;
	}

	/**
	 * Resolve a skill name to its SKILL.md URI by searching the instruction index.
	 * If not found, throws with a list of available skills.
	 */
	private resolveSkillUri(skillName: string): URI {
		const indexVariable = this._inputContext?.chatVariables.find(isCustomizationsIndex);
		const indexValue = indexVariable && isString(indexVariable.value) ? indexVariable.value : undefined;
		return resolveSkillUri(
			skillName,
			indexValue,
			text => this.customInstructionsService.parseInstructionIndexFile(text),
			uri => this.customInstructionsService.getSkillInfo(uri),
		);
	}

	/**
	 * List files in a skill directory, excluding SKILL.md and skipped directories.
	 */
	private async listRelatedFiles(skillFolderUri: URI): Promise<string[]> {
		return listRelatedFiles(skillFolderUri, uri => this.fileSystemService.readDirectory(uri));
	}
}

ToolRegistry.registerTool(SkillTool);

export type ReadDirectoryFn = (uri: URI) => Promise<[string, FileType][]>;

/**
 * Resolve a skill name to its SKILL.md URI by searching the instruction index.
 * If not found, throws with a list of available skills.
 */
export function resolveSkillUri(
	skillName: string,
	indexValue: string | undefined,
	parseInstructionIndexFile: (text: string) => { readonly skills: Iterable<URI> },
	getSkillInfo: (uri: URI) => { readonly skillName: string } | undefined,
): URI {
	const availableSkills: string[] = [];

	if (isString(indexValue)) {
		const indexFile = parseInstructionIndexFile(indexValue);
		for (const skillUri of indexFile.skills) {
			const info = getSkillInfo(skillUri);
			if (info) {
				if (info.skillName === skillName) {
					return skillUri;
				}
				availableSkills.push(info.skillName);
			}
		}
	}

	const skillListMessage = availableSkills.length > 0
		? ` Available skills: ${availableSkills.join(', ')}`
		: '';
	throw new Error(`Skill "${skillName}" not found.${skillListMessage}`);
}

/**
 * List files in a skill directory, excluding SKILL.md and skipped directories.
 */
export async function listRelatedFiles(skillFolderUri: URI, readDirectory: ReadDirectoryFn): Promise<string[]> {
	try {
		const files: string[] = [];
		await listRelatedFilesRecursive(skillFolderUri, skillFolderUri, files, readDirectory);
		return files;
	} catch {
		return [];
	}
}

export async function listRelatedFilesRecursive(baseUri: URI, currentUri: URI, files: string[], readDirectory: ReadDirectoryFn, depth: number = 0): Promise<void> {
	if (files.length >= MAX_RELATED_FILES || depth > 5) {
		return;
	}

	const entries = await readDirectory(currentUri);

	for (const [name, type] of entries) {
		if (files.length >= MAX_RELATED_FILES) {
			break;
		}

		if (type === FileType.Directory) {
			if (!SKILL_SKIP_DIRS.has(name)) {
				await listRelatedFilesRecursive(baseUri, extUriBiasedIgnorePathCase.joinPath(currentUri, name), files, readDirectory, depth + 1);
			}
		} else if (type === FileType.File && !equalsIgnoreCase(name, SKILL_FILENAME)) {
			const relativePath = extUriBiasedIgnorePathCase.relativePath(baseUri, extUriBiasedIgnorePathCase.joinPath(currentUri, name));
			if (relativePath) {
				files.push(relativePath);
			}
		}
	}
}

/**
 * Parse the `context` field from SKILL.md YAML frontmatter.
 * Returns 'fork' if frontmatter contains `context: fork`, otherwise 'inline'.
 */
export function parseSkillContext(content: string): 'inline' | 'fork' {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/m);
	if (!frontmatterMatch) {
		return 'inline';
	}
	const contextMatch = frontmatterMatch[1].match(/^context:\s*(.+)$/m);
	if (contextMatch && contextMatch[1].trim() === 'fork') {
		return 'fork';
	}
	return 'inline';
}
