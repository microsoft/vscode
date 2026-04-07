/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptElementProps, PromptSizing } from '@vscode/prompt-tsx';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { URI } from '../../../util/vs/base/common/uri';
import { Tag } from '../../prompts/node/base/tag';
import { IAgentMemoryService, normalizeCitations, RepoMemoryEntry } from '../common/agentMemoryService';
import { ToolName } from '../common/toolNames';
import { extractSessionId } from './memoryTool';

const MEMORY_BASE_DIR = 'memory-tool/memories';
const MAX_USER_MEMORY_LINES = 200;

export interface MemoryContextPromptProps extends BasePromptElementProps {
	readonly sessionResource?: string;
}

export class MemoryContextPrompt extends PromptElement<MemoryContextPromptProps> {
	constructor(
		props: any,
		@IAgentMemoryService private readonly agentMemoryService: IAgentMemoryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super(props);
	}

	async render() {
		const enableCopilotMemory = this.configurationService.getExperimentBasedConfig(ConfigKey.CopilotMemoryEnabled, this.experimentationService);
		const enableMemoryTool = this.configurationService.getExperimentBasedConfig(ConfigKey.MemoryToolEnabled, this.experimentationService);

		const userMemoryContent = enableMemoryTool ? await this.getUserMemoryContent() : undefined;
		const sessionMemoryFiles = enableMemoryTool ? await this.getSessionMemoryFiles(this.props.sessionResource) : undefined;
		const repoMemories = enableCopilotMemory ? await this.agentMemoryService.getRepoMemories() : undefined;
		const localRepoMemoryFiles = (enableMemoryTool && !enableCopilotMemory) ? await this.getLocalRepoMemoryFiles() : undefined;

		if (!enableMemoryTool && !enableCopilotMemory) {
			return null;
		}

		this._sendContextReadTelemetry(
			!!userMemoryContent,
			userMemoryContent?.length ?? 0,
			sessionMemoryFiles?.length ?? 0,
			sessionMemoryFiles?.join('\n').length ?? 0,
			repoMemories?.length ?? 0,
			repoMemories ? this.formatMemories(repoMemories).length : 0,
		);

		return (
			<>
				{enableMemoryTool && (
					<Tag name='userMemory'>
						{userMemoryContent
							? <>The following are your persistent user memory notes. These persist across all workspaces and conversations.<br /><br />{userMemoryContent}</>
							: <>No user preferences or notes saved yet. Use the {ToolName.Memory} tool to store persistent notes under /memories/.</>
						}
					</Tag>
				)}
				{enableMemoryTool && (
					<Tag name='sessionMemory'>
						{sessionMemoryFiles && sessionMemoryFiles.length > 0
							? <>The following files exist in your session memory (/memories/session/). Use the {ToolName.Memory} tool to read them if needed.<br /><br />{sessionMemoryFiles.join('\n')}</>
							: <>Session memory (/memories/session/) is empty. No session notes have been created yet.</>
						}
					</Tag>
				)}
				{enableMemoryTool && !enableCopilotMemory && (
					<Tag name='repoMemory'>
						{localRepoMemoryFiles && localRepoMemoryFiles.length > 0
							? <>The following files exist in your repository memory (/memories/repo/). These are scoped to the current workspace. Use the {ToolName.Memory} tool to read them if needed.<br /><br />{localRepoMemoryFiles.join('\n')}</>
							: <>Repository memory (/memories/repo/) is empty. No workspace-scoped notes have been created yet.</>
						}
					</Tag>
				)}
				{repoMemories && repoMemories.length > 0 && (
					<Tag name='repository_memories'>
						The following are recent memories stored for this repository from previous agent interactions. These memories may contain useful context about the codebase conventions, patterns, and practices. However, be aware that memories might be obsolete or incorrect or may not apply to your current task. Use the citations provided to verify the accuracy of any relevant memory before relying on it.<br />
						<br />
						{this.formatMemories(repoMemories)}
						<br />
						Be sure to consider these stored facts carefully. Consider whether any are relevant to your current task. If they are, verify their current applicability before using them to inform your work.<br />
						<br />
						If you come across a memory that you're able to verify and that you find useful, you should use the {ToolName.Memory} tool to store the same fact again. Only recent memories are retained, so storing the fact again will cause it to be retained longer.<br />
						If you come across a fact that's incorrect or outdated, you should use the {ToolName.Memory} tool to store a new fact that reflects the current reality.<br />
					</Tag>
				)}
			</>
		);
	}

	private async getUserMemoryContent(): Promise<string | undefined> {
		const globalStorageUri = this.extensionContext.globalStorageUri;
		if (!globalStorageUri) {
			return undefined;
		}
		const memoryDirUri = URI.joinPath(globalStorageUri, MEMORY_BASE_DIR);
		try {
			const stat = await this.fileSystemService.stat(memoryDirUri);
			if (stat.type !== FileType.Directory) {
				return undefined;
			}
		} catch {
			return undefined;
		}

		const entries = await this.fileSystemService.readDirectory(memoryDirUri);
		const fileEntries = entries.filter(([name, type]) => type === FileType.File && !name.startsWith('.'));
		if (fileEntries.length === 0) {
			return undefined;
		}

		const lines: string[] = [];
		for (const [name] of fileEntries) {
			if (lines.length >= MAX_USER_MEMORY_LINES) {
				break;
			}
			const fileUri = URI.joinPath(memoryDirUri, name);
			try {
				const content = await this.fileSystemService.readFile(fileUri);
				const text = new TextDecoder().decode(content);
				lines.push(`## ${name}`, ...text.split('\n'));
			} catch {
				// Skip unreadable files
			}
		}

		if (lines.length === 0) {
			return undefined;
		}

		return lines.slice(0, MAX_USER_MEMORY_LINES).join('\n');
	}

	private async getSessionMemoryFiles(sessionResource?: string): Promise<string[] | undefined> {
		const storageUri = this.extensionContext.storageUri;
		if (!storageUri || !sessionResource) {
			return undefined;
		}
		// Use the same logic as the memory tool to resolve the current session directory
		const sessionId = extractSessionId(sessionResource);
		const sessionDirUri = URI.joinPath(URI.from(storageUri), MEMORY_BASE_DIR, sessionId);
		try {
			const stat = await this.fileSystemService.stat(sessionDirUri);
			if (stat.type !== FileType.Directory) {
				return undefined;
			}
		} catch {
			return undefined;
		}

		const files: string[] = [];
		const entries = await this.fileSystemService.readDirectory(sessionDirUri);
		for (const [fileName, fileType] of entries) {
			if (fileType === FileType.File && !fileName.startsWith('.')) {
				files.push(`/memories/session/${fileName}`);
			}
		}

		return files.length > 0 ? files : undefined;
	}

	private async getLocalRepoMemoryFiles(): Promise<string[] | undefined> {
		const storageUri = this.extensionContext.storageUri;
		if (!storageUri) {
			return undefined;
		}
		const repoDirUri = URI.joinPath(URI.from(storageUri), MEMORY_BASE_DIR, 'repo');
		try {
			const stat = await this.fileSystemService.stat(repoDirUri);
			if (stat.type !== FileType.Directory) {
				return undefined;
			}
		} catch {
			return undefined;
		}

		const files: string[] = [];
		const entries = await this.fileSystemService.readDirectory(repoDirUri);
		for (const [fileName, fileType] of entries) {
			if (fileType === FileType.File && !fileName.startsWith('.')) {
				files.push(`/memories/repo/${fileName}`);
			}
		}

		return files.length > 0 ? files : undefined;
	}

	private formatMemories(memories: RepoMemoryEntry[]): string {
		return memories.map(m => {
			const lines = [`**${m.subject}**`, `- Fact: ${m.fact}`];

			// Format citations (handle both string and string[] formats)
			if (m.citations) {
				const citationsArray = normalizeCitations(m.citations) ?? [];
				if (citationsArray.length > 0) {
					lines.push(`- Citations: ${citationsArray.join(', ')}`);
				}
			}

			// Include reason if present (from CAPI format)
			if (m.reason) {
				lines.push(`- Reason: ${m.reason}`);
			}

			return lines.join('\n');
		}).join('\n\n');
	}

	private _sendContextReadTelemetry(hasUserMemory: boolean, userMemoryLength: number, sessionFileCount: number, sessionMemoryLength: number, repoMemoryCount: number, repoMemoryLength: number): void {
		/* __GDPR__
			"memoryContextRead" : {
				"owner": "digitarald",
				"comment": "Tracks automatic memory context reads during prompt construction",
				"hasUserMemory": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether user memory content was loaded" },
				"userMemoryLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "String length of user memory content" },
				"sessionFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of session memory files listed" },
				"sessionMemoryLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "String length of session memory file listing" },
				"repoMemoryCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of repository memories fetched" },
				"repoMemoryLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "String length of formatted repository memories" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('memoryContextRead', {
			hasUserMemory: String(hasUserMemory),
		}, {
			userMemoryLength,
			sessionFileCount,
			sessionMemoryLength,
			repoMemoryCount,
			repoMemoryLength,
		});
	}
}

/**
 * Prompt component that provides comprehensive instructions for using the memory tool.
 * Covers all three memory tiers: user, session, and repository.
 */
export class MemoryInstructionsPrompt extends PromptElement<BasePromptElementProps> {
	constructor(
		props: PromptElementProps<BasePromptElementProps>,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const enableCopilotMemory = this.configurationService.getExperimentBasedConfig(ConfigKey.CopilotMemoryEnabled, this.experimentationService);
		const enableMemoryTool = this.configurationService.getExperimentBasedConfig(ConfigKey.MemoryToolEnabled, this.experimentationService);
		if (!enableCopilotMemory && !enableMemoryTool) {
			return null;
		}

		return <Tag name='memoryInstructions'>
			As you work, consult your memory files to build on previous experience. When you encounter a mistake that seems like it could be common, check your memory for relevant notes — and if nothing is written yet, record what you learned.<br />
			<br />
			<Tag name='memoryScopes'>
				Memory is organized into the scopes defined below:<br />
				{enableMemoryTool && <>- **User memory** (`/memories/`): Persistent notes that survive across all workspaces and conversations. Store user preferences, common patterns, frequently used commands, and general insights here. First {MAX_USER_MEMORY_LINES} lines are loaded into your context automatically.<br /></>}
				{enableMemoryTool && <>- **Session memory** (`/memories/session/`): Notes for the current conversation only. Store task-specific context, in-progress notes, and temporary working state here. Session files are listed in your context but not loaded automatically — use the memory tool to read them when needed.<br /></>}
				{enableCopilotMemory && <>- **Repository memory** (`/memories/repo/`): Repository-scoped facts stored via Copilot. Only the `create` command is supported. Store codebase conventions, build commands, project structure facts, and verified practices here.<br /></>}
				{enableMemoryTool && !enableCopilotMemory && <>- **Repository memory** (`/memories/repo/`): Repository-scoped facts stored locally in the workspace. Store codebase conventions, build commands, project structure facts, and verified practices here.<br /></>}
			</Tag>
			<br />
			{enableMemoryTool && <>
				<Tag name='memoryGuidelines'>
					Guidelines for user memory (`/memories/`):<br />
					- Keep entries short and concise — use brief bullet points or single-line facts, not lengthy prose. User memory is loaded into context automatically, so brevity is critical.<br />
					- Organize by topic in separate files (e.g., `debugging.md`, `patterns.md`).<br />
					- Record only key insights: problem constraints, strategies that worked or failed, and lessons learned.<br />
					- Update or remove memories that turn out to be wrong or outdated.<br />
					- Do not create new files unless necessary — prefer updating existing files.<br />
					Guidelines for session memory (`/memories/session/`):<br />
					- Use session memory to keep plans up to date and reviewing historical summaries.<br />
					- Do not create unnecessary session memory files. You should only view and update existing session files.<br />
				</Tag>
			</>}
			<br />
			{enableCopilotMemory && <>
				<Tag name='repoMemoryInstructions'>
					If you come across an important fact about the codebase that could help in future code review or generation tasks, beyond the current task, use the {ToolName.Memory} tool to store it. Use the `create` command with a path under `/memories/repo/` to store repository-scoped facts. The file content should be a JSON object with these fields: `subject`, `fact`, `citations`, `reason`, and `category`.<br />
					Facts may be gleaned from the codebase itself or learned from user input or feedback. Such facts might include:<br />
					- Conventions, preferences, or best practices specific to this codebase that might be overlooked when inspecting only a limited code sample<br />
					- Important information about the structure or logic of the codebase<br />
					- Commands for linting, building, or running tests that have been verified through a successful run<br />
					<Tag name='examples'>
						- "Use ErrKind wrapper for every public API error"<br />
						- "Prefer ExpectNoLog helper over silent nil checks in tests"<br />
						- "Always use Python typing"<br />
						- "Follow the Google JavaScript Style Guide"<br />
						- "Use html_escape as a sanitizer to avoid cross site scripting vulnerabilities"<br />
						- "The code can be built with `npm run build` and tested with `npm run test`"<br />
					</Tag>
					Only store facts that meet the following criteria:<br />
					<Tag name='factsCriteria'>
						- Are likely to have actionable implications for a future task<br />
						- Are independent of changes you are making as part of your current task, and will remain relevant if your current code isn't merged<br />
						- Are unlikely to change over time<br />
						- Cannot always be inferred from a limited code sample<br />
						- Contain no secrets or sensitive data<br />
					</Tag>
					Always include the reason and citations fields.<br />
					Before storing, ask yourself: Will this help with future coding or code review tasks across the repository? If unsure, skip storing it.<br />
					Note: Only `create` is supported for `/memories/repo/` paths.<br />
					If the user asks how to view or manage their repo memories refer them to https://docs.github.com/en/copilot/how-tos/use-copilot-agents/copilot-memory.<br />
				</Tag>
			</>}
		</Tag>;
	}
}
