/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptReference, PromptSizing, TextChunk } from '@vscode/prompt-tsx';
import type { ChatLanguageModelToolReference } from 'vscode';
import { ConfigKey } from '../../../../platform/configuration/common/configurationService';
import { CustomInstructionsKind, ICustomInstructions, ICustomInstructionsService } from '../../../../platform/customInstructions/common/customInstructionsService';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { ResourceSet } from '../../../../util/vs/base/common/map';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatVariablesCollection, isCustomizationsIndex, isInstructionFile } from '../../../prompt/common/chatVariablesCollection';
import { IPromptVariablesService } from '../../../prompt/node/promptVariablesService';
import { Tag } from '../base/tag';

export interface CustomInstructionsProps extends BasePromptElementProps {
	readonly chatVariables: ChatVariablesCollection | undefined;

	readonly languageId: string | undefined;
	/**
	 * @default true
	 */
	readonly includeCodeGenerationInstructions?: boolean;
	/**
	 * @default false
	 */
	readonly includeTestGenerationInstructions?: boolean;
	/**
	 * @default false
	 */
	readonly includeCodeFeedbackInstructions?: boolean;
	/**
	 * @default false
	 */
	readonly includeCommitMessageGenerationInstructions?: boolean;
	/**
	 * @default false
	 */
	readonly includePullRequestDescriptionGenerationInstructions?: boolean;
	readonly customIntroduction?: string;

	/**
	 * @default true
	 */
	readonly includeSystemMessageConflictWarning?: boolean;
}

export class CustomInstructions extends PromptElement<CustomInstructionsProps> {
	constructor(
		props: CustomInstructionsProps,
		@ICustomInstructionsService private readonly customInstructionsService: ICustomInstructionsService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IPromptVariablesService private readonly promptVariablesService: IPromptVariablesService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) {
		super(props);
	}
	override async render(state: void, sizing: PromptSizing) {

		const { includeCodeGenerationInstructions, includeTestGenerationInstructions, includeCodeFeedbackInstructions, includeCommitMessageGenerationInstructions, includePullRequestDescriptionGenerationInstructions, customIntroduction } = this.props;
		const includeSystemMessageConflictWarning = this.props.includeSystemMessageConflictWarning ?? true;

		const chunks = [];

		if (includeCodeGenerationInstructions !== false) {
			const hasSeen = new ResourceSet();
			const hasSeenContent = new Set();
			if (this.props.chatVariables) {
				for (const variable of this.props.chatVariables) {
					if (isCustomizationsIndex(variable)) {
						let value = variable.value;
						if (variable.reference.toolReferences?.length) {
							value = await this.promptVariablesService.resolveToolReferencesInPrompt(value, variable.reference.toolReferences);
						}
						chunks.push(<TextChunk>{value}</TextChunk>);
					} else if (isInstructionFile(variable)) {
						const value = variable.value;
						if (!hasSeen.has(value)) {
							hasSeen.add(value);
							const element = await this.createElementFromURI(value, variable.reference.toolReferences);
							if (element && !hasSeenContent.has(element.content)) {
								hasSeenContent.add(element.content);
								chunks.push(element.chuck);
							}
						}
					}
				}
			}
			const instructionFiles = await this.customInstructionsService.getAgentInstructions();
			for (const instructionFile of instructionFiles) {
				if (!hasSeen.has(instructionFile)) {
					hasSeen.add(instructionFile);
					const element = await this.createElementFromURI(instructionFile);
					if (element && !hasSeenContent.has(element.content)) {
						hasSeenContent.add(element.content);
						chunks.push(element.chuck);
					}
				}
			}
		}

		const customInstructions: ICustomInstructions[] = [];
		if (includeCodeGenerationInstructions !== false) {
			customInstructions.push(...await this.customInstructionsService.fetchInstructionsFromSetting(ConfigKey.CodeGenerationInstructions));
		}
		if (includeTestGenerationInstructions) {
			customInstructions.push(...await this.customInstructionsService.fetchInstructionsFromSetting(ConfigKey.TestGenerationInstructions));
		}
		if (includeCodeFeedbackInstructions) {
			customInstructions.push(...await this.customInstructionsService.fetchInstructionsFromSetting(ConfigKey.CodeFeedbackInstructions));
		}
		if (includeCommitMessageGenerationInstructions) {
			customInstructions.push(...await this.customInstructionsService.fetchInstructionsFromSetting(ConfigKey.CommitMessageGenerationInstructions));
		}
		if (includePullRequestDescriptionGenerationInstructions) {
			customInstructions.push(...await this.customInstructionsService.fetchInstructionsFromSetting(ConfigKey.PullRequestDescriptionGenerationInstructions));
		}
		for (const instruction of customInstructions) {
			const chunk = this.createInstructionElement(instruction);
			if (chunk) {
				chunks.push(chunk);
			}
		}
		if (chunks.length === 0) {
			return undefined;
		}
		const introduction = customIntroduction ?? 'When generating code, please follow these user provided coding instructions.';
		const isMultiRoot = this.workspaceService.getWorkspaceFolders().length > 1;
		const multiRootHint = isMultiRoot && ' This is a multi-root workspace. The instructions below may come from different workspace folders. Apply each set of instructions to the folder it belongs to.';
		const systemMessageConflictWarning = includeSystemMessageConflictWarning && ' You can ignore an instruction if it contradicts a system message.';

		return (<>
			{introduction}{multiRootHint}{systemMessageConflictWarning}<br />
			<Tag name='instructions'>
				{
					...chunks
				}
			</Tag>

		</>);
	}

	private async createElementFromURI(fileUri: URI, toolReferences?: readonly ChatLanguageModelToolReference[]): Promise<{ chuck: PromptElement; content: string } | undefined> {
		try {
			const fileContents = await this.fileSystemService.readFile(fileUri);
			let content = new TextDecoder().decode(fileContents);
			if (toolReferences && toolReferences.length > 0) {
				content = await this.promptVariablesService.resolveToolReferencesInPrompt(content, toolReferences);
			}
			content = content.trim();
			if (content.length === 0) {
				return undefined;
			}
			const attrs: Record<string, string> = { filePath: this.promptPathRepresentationService.getFilePath(fileUri) };
			const folders = this.workspaceService.getWorkspaceFolders();
			if (folders.length > 1) {
				const folder = this.workspaceService.getWorkspaceFolder(fileUri);
				if (folder) {
					attrs.workspaceFolder = this.workspaceService.getWorkspaceFolderName(folder);
				}
			}
			return {
				chuck: <Tag name='attachment' attrs={attrs}>
					<references value={[new InstructionFileReference(fileUri, content)]} />
					<TextChunk>{content}</TextChunk>
				</Tag>,
				content
			};
		} catch (e) {
			this.logService.debug(`Instruction file not found: ${fileUri.toString()}`);
			return undefined;
		}
	}

	private createInstructionElement(instructions: ICustomInstructions) {
		const lines = [];
		for (const entry of instructions.content) {
			if (entry.languageId) {
				if (entry.languageId === this.props.languageId) {
					lines.push(`For ${entry.languageId} code: ${entry.instruction}`);
				}
			} else {
				lines.push(entry.instruction);
			}
		}
		if (lines.length === 0) {
			return undefined;
		}

		return (<>
			<references value={[new CustomInstructionPromptReference(instructions, lines)]} />
			<>
				{
					lines.map(line => <TextChunk>{line}</TextChunk>)
				}
			</>
		</>);
	}

}

export class CustomInstructionPromptReference extends PromptReference {
	constructor(public readonly instructions: ICustomInstructions, public readonly usedInstructions: string[]) {
		super(instructions.reference);
	}
}

export class InstructionFileReference extends PromptReference {
	constructor(public readonly ref: URI, public readonly instruction: string) {
		super(ref);
	}
}

export function getCustomInstructionTelemetry(references: readonly PromptReference[]): { codeGenInstructionsCount: number; codeGenInstructionsLength: number; codeGenInstructionsFilteredCount: number; codeGenInstructionFileCount: number; codeGenInstructionSettingsCount: number } {
	let codeGenInstructionsCount = 0;
	let codeGenInstructionsFilteredCount = 0;
	let codeGenInstructionsLength = 0;
	let codeGenInstructionFileCount = 0;
	let codeGenInstructionSettingsCount = 0;

	for (const reference of references) {
		if (reference instanceof CustomInstructionPromptReference) {
			codeGenInstructionsCount += reference.usedInstructions.length;
			codeGenInstructionsLength += reference.usedInstructions.reduce((acc, instruction) => acc + instruction.length, 0);
			codeGenInstructionsFilteredCount += Math.max(reference.instructions.content.length - reference.usedInstructions.length, 0);
			if (reference.instructions.kind === CustomInstructionsKind.File) {
				codeGenInstructionFileCount++;
			} else {
				codeGenInstructionSettingsCount += reference.usedInstructions.length;
			}
		} else if (reference instanceof InstructionFileReference) {
			codeGenInstructionsLength += reference.instruction.length;
			codeGenInstructionsCount++;
			codeGenInstructionFileCount++;
		}
	}
	return { codeGenInstructionsCount, codeGenInstructionsLength, codeGenInstructionsFilteredCount, codeGenInstructionFileCount, codeGenInstructionSettingsCount };

}
