/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptElementProps, PromptSizing } from '@vscode/prompt-tsx';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { URI } from '../../../util/vs/base/common/uri';
import { Tag } from '../../prompts/node/base/tag';
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
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super(props);
	}

	async render() {
		const userMemoryContent = await this.getUserMemoryContent();
		const sessionMemoryFiles = await this.getSessionMemoryFiles(this.props.sessionResource);
		const localRepoMemoryFiles = await this.getLocalRepoMemoryFiles();

		this._sendContextReadTelemetry(
			!!userMemoryContent,
			userMemoryContent?.length ?? 0,
			sessionMemoryFiles?.length ?? 0,
			sessionMemoryFiles?.join('\n').length ?? 0,
		);

		return (
			<>
				<Tag name='userMemory'>
					{userMemoryContent
						? <>The following are your persistent user memory notes. These persist across all workspaces and conversations.<br /><br />{userMemoryContent}</>
						: <>No user preferences or notes saved yet. Use the {ToolName.Memory} tool to store persistent notes under /memories/.</>
					}
				</Tag>
				<Tag name='sessionMemory'>
					{sessionMemoryFiles && sessionMemoryFiles.length > 0
						? <>The following files exist in your session memory (/memories/session/). Use the {ToolName.Memory} tool to read them if needed.<br /><br />{sessionMemoryFiles.join('\n')}</>
						: <>Session memory (/memories/session/) is empty. No session notes have been created yet.</>
					}
				</Tag>
				<Tag name='repoMemory'>
					{localRepoMemoryFiles && localRepoMemoryFiles.length > 0
						? <>The following files exist in your repository memory (/memories/repo/). These are scoped to the current workspace. Use the {ToolName.Memory} tool to read them if needed.<br /><br />{localRepoMemoryFiles.join('\n')}</>
						: <>Repository memory (/memories/repo/) is empty. No workspace-scoped notes have been created yet.</>
					}
				</Tag>
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

	private _sendContextReadTelemetry(hasUserMemory: boolean, userMemoryLength: number, sessionFileCount: number, sessionMemoryLength: number): void {
		/* __GDPR__
			"memoryContextRead" : {
				"owner": "digitarald",
				"comment": "Tracks automatic memory context reads during prompt construction",
				"hasUserMemory": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether user memory content was loaded" },
				"userMemoryLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "String length of user memory content" },
				"sessionFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of session memory files listed" },
				"sessionMemoryLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "String length of session memory file listing" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('memoryContextRead', {
			hasUserMemory: String(hasUserMemory),
		}, {
			userMemoryLength,
			sessionFileCount,
			sessionMemoryLength,
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
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		return <Tag name='memoryInstructions'>
			As you work, consult your memory files to build on previous experience. When you encounter a mistake that seems like it could be common, check your memory for relevant notes — and if nothing is written yet, record what you learned.<br />
			<br />
			<Tag name='memoryScopes'>
				Memory is organized into the scopes defined below:<br />
				- **User memory** (`/memories/`): Persistent notes that survive across all workspaces and conversations. Store user preferences, common patterns, frequently used commands, and general insights here. First {MAX_USER_MEMORY_LINES} lines are loaded into your context automatically.<br />
				- **Session memory** (`/memories/session/`): Notes for the current conversation only. Store task-specific context, in-progress notes, and temporary working state here. Session files are listed in your context but not loaded automatically — use the memory tool to read them when needed.<br />
				- **Repository memory** (`/memories/repo/`): Repository-scoped facts stored locally in the workspace. Store codebase conventions, build commands, project structure facts, and verified practices here.<br />
			</Tag>
			<br />
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
		</Tag>;
	}
}
