/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Attachment } from '@github/copilot/sdk';
import type * as vscode from 'vscode';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { isLocation, toLocation } from '../../../../util/common/types';
import { raceCancellation } from '../../../../util/vs/base/common/async';
import { ResourceMap } from '../../../../util/vs/base/common/map';
import { Schemas } from '../../../../util/vs/base/common/network';
import * as path from '../../../../util/vs/base/common/path';
import { extUriBiasedIgnorePathCase, relativePath } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatReferenceBinaryData, ChatReferenceDiagnostic, FileType, Location } from '../../../../vscodeTypes';
import { ChatVariablesCollection, isCustomizationsIndex, isInstructionFile, isPromptFile, PromptVariable } from '../../../prompt/common/chatVariablesCollection';
import { generateUserPrompt } from '../../../prompts/node/agent/copilotCLIPrompt';
import { getWorkingDirectory, isIsolationEnabled, IWorkspaceInfo } from '../../common/workspaceInfo';
import { ICopilotCLIImageSupport, isImageMimeType } from './copilotCLIImageSupport';
import { ICopilotCLISkills } from './copilotCLISkills';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';

export class CopilotCLIPromptResolver {
	constructor(
		@ICopilotCLIImageSupport private readonly imageSupport: ICopilotCLIImageSupport,
		@ILogService private readonly logService: ILogService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@ICopilotCLISkills private readonly skillsService: ICopilotCLISkills,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
	) { }

	/**
	 * Generates the final prompt for the Copilot CLI agent, resolving variables and preparing attachments.
	 * @param prompt Provide a prompt to override the request prompt
	 */
	public async resolvePrompt(request: vscode.ChatRequest, prompt: string | undefined, additionalReferences: vscode.ChatPromptReference[], workspaceInfo: IWorkspaceInfo, additionalWorkspaces: IWorkspaceInfo[], token: vscode.CancellationToken): Promise<{ prompt: string; attachments: Attachment[]; references: vscode.ChatPromptReference[] }> {
		const allReferences = new ChatVariablesCollection(request.references.concat(additionalReferences.filter(ref => !request.references.includes(ref))));
		prompt = prompt ?? request.prompt;
		const [variables, attachments] = await this.constructChatVariablesAndAttachments(allReferences, workspaceInfo, additionalWorkspaces, token);
		if (token.isCancellationRequested) {
			return { prompt, attachments: [], references: [] };
		}
		prompt = await raceCancellation(generateUserPrompt(request, prompt, variables, this.instantiationService), token);
		const references = Array.from(variables).map(v => v.reference);
		return { prompt: prompt ?? '', attachments, references };
	}

	/**
	 * Builds a map from workspace folder URIs to their corresponding worktree URIs.
	 * Used for multi-folder path translation when isolation is enabled.
	 */
	private buildFolderToWorktreeMap(primaryWorkspaceInfo: IWorkspaceInfo, additionalWorkspaces: IWorkspaceInfo[]): ResourceMap<vscode.Uri> {
		const map = new ResourceMap<vscode.Uri>();
		if (primaryWorkspaceInfo.worktree && primaryWorkspaceInfo.repository) {
			map.set(primaryWorkspaceInfo.repository, primaryWorkspaceInfo.worktree);
		}
		for (const ws of additionalWorkspaces) {
			if (ws.worktree && ws.repository) {
				map.set(ws.repository, ws.worktree);
			}
		}
		return map;
	}

	private async constructChatVariablesAndAttachments(variables: ChatVariablesCollection, workspaceInfo: IWorkspaceInfo, additionalWorkspaces: IWorkspaceInfo[], token: vscode.CancellationToken): Promise<[variables: ChatVariablesCollection, Attachment[]]> {
		const validReferences: vscode.ChatPromptReference[] = [];
		const fileFolderReferences: vscode.ChatPromptReference[] = [];
		const builtinSlashCommandReferences: vscode.ChatPromptReference[] = [];
		const isolationEnabled = isIsolationEnabled(workspaceInfo) || additionalWorkspaces.some(ws => isIsolationEnabled(ws));
		const folderToWorktreeMap = this.buildFolderToWorktreeMap(workspaceInfo, additionalWorkspaces);
		const hasAnyWorkingDirectory = getWorkingDirectory(workspaceInfo) || additionalWorkspaces.some(ws => getWorkingDirectory(ws));
		const knownSkillLocations = await this.skillsService.getSkillsLocations(CancellationToken.None);
		await Promise.all(Array.from(variables).map(async variable => {
			// Unsupported references: prompt instructions, instruction files, and the customizations index.
			if (isInstructionFile(variable) || isCustomizationsIndex(variable)) {
				return;
			}
			// No need to include skill prompt files as an attachment if CLI already knows about them.
			const promptFileUri = isPromptFile(variable) ? variable.value : undefined;
			if (promptFileUri) {
				if (knownSkillLocations.some(loc => extUriBiasedIgnorePathCase.isEqualOrParent(promptFileUri, loc))) {
					return;
				}
				// Exclude plan prompt file from Core.
				const directory = URI.file(path.dirname(promptFileUri.fsPath));
				if (promptFileUri.fsPath.endsWith('plan.prompt.md') && path.basename(directory.fsPath) === 'prompts' && extUriBiasedIgnorePathCase.isEqualOrParent(this.extensionContext.extensionUri, directory)) {
					return;
				}
			}
			// GitHub pull request references
			if (isGitHubPullRequestReference(variable.reference)) {
				builtinSlashCommandReferences.push(variable.reference);
				return;
			}
			// Git merge changes references
			if (isGitMergeChangesReference(variable.reference)) {
				builtinSlashCommandReferences.push(variable.reference);
				return;
			}
			// If isolation is enabled, and we have workspace repo information, skip it.
			if (isolationEnabled && isWorkspaceRepoInformationItem(variable)) {
				return;
			}
			const variableRef = (!isolationEnabled || !hasAnyWorkingDirectory) ? variable.reference : await this.translateWorkspaceRefToWorkingDirectoryRef(variable.reference, workspaceInfo, additionalWorkspaces, folderToWorktreeMap, token);
			// Images will be attached using regular attachments via Copilot CLI SDK.
			if (variableRef.value instanceof ChatReferenceBinaryData) {
				if (!isImageMimeType(variableRef.value.mimeType)) {
					validReferences.push(variableRef);
				}
				fileFolderReferences.push(variableRef);
				return;
			}
			if (isLocation(variableRef.value)) {
				if (await this.ignoreService.isCopilotIgnored(variableRef.value.uri)) {
					return;
				}
				fileFolderReferences.push(variableRef);
				validReferences.push(variableRef);
				return;
			}
			// Notebooks are not supported yet.
			if (URI.isUri(variableRef.value)) {
				if (await this.ignoreService.isCopilotIgnored(variableRef.value)) {
					return;
				}
				if (variableRef.value.scheme === Schemas.vscodeNotebookCellOutput || variableRef.value.scheme === Schemas.vscodeNotebookCellOutput) {
					return;
				}

				// Files and directories will be attached using regular attachments via Copilot CLI SDK.
				validReferences.push(variableRef);
				fileFolderReferences.push(variableRef);
				return;
			}

			validReferences.push(variableRef);
		}));

		const [attachments, imageAttachments] = await this.constructFileOrFolderAttachments(fileFolderReferences, token);
		// Re-add the images after we've copied them to the image store.
		imageAttachments.forEach(img => {
			if (img.type === 'file') {
				validReferences.push({
					name: img.displayName,
					value: URI.file(img.path),
					id: img.path,
				});
			}
		});

		// Add attachments for built-in slash command references
		for (const reference of builtinSlashCommandReferences) {
			// GitHub pull request reference
			if (isGitHubPullRequestReference(reference) && URI.isUri(reference.value)) {
				attachments.push({
					type: 'blob',
					mimeType: 'text/plain',
					data: reference.value.toString(),
				});
			}

			// Git merge changes reference
			if (isGitMergeChangesReference(reference) && typeof reference.value === 'string') {
				attachments.push({
					type: 'blob',
					mimeType: 'text/plain',
					data: reference.value,
				});
			}
		}

		variables = new ChatVariablesCollection(validReferences);
		return [variables, attachments];
	}


	private async constructFileOrFolderAttachments(fileOrFolderReferences: vscode.ChatPromptReference[], token: vscode.CancellationToken): Promise<[Attachment[], image: Attachment[]]> {
		const attachments: Attachment[] = [];
		const images: Attachment[] = [];
		await Promise.all(fileOrFolderReferences.map(async ref => {
			if (ref.value instanceof ChatReferenceBinaryData) {
				if (!isImageMimeType(ref.value.mimeType)) {
					return;
				}
				// Handle image attachments
				try {
					const buffer = await ref.value.data();
					const uri = await this.imageSupport.storeImage(buffer, ref.value.mimeType);
					attachments.push({
						type: 'file',
						displayName: ref.name,
						path: uri.fsPath
					});
					images.push({
						type: 'file',
						displayName: ref.name,
						path: uri.fsPath
					});
				} catch (error) {
					this.logService.error(`[CopilotCLISession] Failed to store image: ${error}`);
				}
				return;
			}

			if (isLocation(ref.value)) {
				try {
					// Open the document and get the text for the range.
					const document = await raceCancellation(this.workspaceService.openTextDocument(ref.value.uri), token);
					if (!document) {
						return;
					}
					attachments.push({
						type: 'selection',
						displayName: ref.name,
						filePath: ref.value.uri.fsPath,
						selection: {
							start: {
								line: ref.value.range.start.line + 1,
								character: ref.value.range.start.character + 1
							},
							end: {
								line: ref.value.range.end.line + 1,
								character: ref.value.range.end.character + 1
							}
						},
						text: document.getText(ref.value.range)
					});
				}
				catch (ex) {
					this.logService.error(`[CopilotCLISession] Failed to attach location ${ref.value.uri.fsPath}: ${ex}`);
				}
				return;
			}

			const uri = ref.value;

			if (!URI.isUri(uri)) {
				return;
			}

			// Attachment of Source control items.
			if (uri.scheme === 'scm-history-item') {
				return;
			}

			try {
				const stat = await raceCancellation(this.fileSystemService.stat(uri), token);
				if (!stat) {
					return;
				}
				const type = stat.type === FileType.Directory ? 'directory' : stat.type === FileType.File ? 'file' : undefined;
				if (!type) {
					this.logService.error(`[CopilotCLISession] Ignoring attachment as it's not a file/directory (${uri.fsPath})`);
					return;
				}
				attachments.push({
					type,
					displayName: ref.name || path.basename(uri.fsPath),
					path: uri.fsPath
				});
			} catch (error) {
				this.logService.error(`[CopilotCLISession] Failed to attach ${uri.fsPath}: ${error}`);
			}
		}));

		return [attachments, images];
	}

	private async translateWorkspaceRefToWorkingDirectoryRef(ref: vscode.ChatPromptReference, workspaceInfo: IWorkspaceInfo, additionalWorkspaces: IWorkspaceInfo[], folderToWorktreeMap: ResourceMap<vscode.Uri>, token: vscode.CancellationToken): Promise<vscode.ChatPromptReference> {
		try {
			if (ref.value instanceof ChatReferenceBinaryData) {
				return ref;
			}

			if (isLocation(ref.value)) {
				const uri = await this.translateWorkspaceUriToWorkingDirectoryUri(ref.value.uri, workspaceInfo, additionalWorkspaces, folderToWorktreeMap, token);
				const loc = new Location(uri, toLocation(ref.value)!.range);
				return {
					...ref,
					value: loc
				};
			} else if (URI.isUri(ref.value)) {
				const uri = await this.translateWorkspaceUriToWorkingDirectoryUri(ref.value, workspaceInfo, additionalWorkspaces, folderToWorktreeMap, token);
				return {
					...ref,
					value: uri
				};
			} else if (ref.value instanceof ChatReferenceDiagnostic) {
				const diagnostics = await Promise.all(ref.value.diagnostics.map(async ([uri, diags]) => {
					const translatedUri = await this.translateWorkspaceUriToWorkingDirectoryUri(uri, workspaceInfo, additionalWorkspaces, folderToWorktreeMap, token);
					return [translatedUri, diags] as [vscode.Uri, vscode.Diagnostic[]];
				}));
				return {
					...ref,
					value: new ChatReferenceDiagnostic(diagnostics)
				};
			}
			return ref;
		} catch (error) {
			this.logService.error(error, `[CopilotCLISession] Failed to translate workspace reference`);
			return ref;
		}
	}

	private async translateWorkspaceUriToWorkingDirectoryUri(uri: vscode.Uri, workspaceInfo: IWorkspaceInfo, additionalWorkspaces: IWorkspaceInfo[], folderToWorktreeMap: ResourceMap<vscode.Uri>, token: vscode.CancellationToken): Promise<vscode.Uri> {
		const workspaceFolder = this.workspaceService.getWorkspaceFolder(uri);
		const matchingWorktree = workspaceFolder ? folderToWorktreeMap.get(workspaceFolder) : undefined;
		if (!workspaceFolder || !matchingWorktree) {
			return (await this.findMatchingWorktree(uri, workspaceInfo, additionalWorkspaces, token)) ?? uri;
		}
		// Use the folder-specific worktree from the map when available; otherwise, fall back to a best-effort worktree match (or the original URI)
		const targetDir = matchingWorktree;
		const rel = relativePath(workspaceFolder, uri);
		if (!rel) {
			return uri;
		}
		const segments = rel.split('/');
		const candidate = URI.joinPath(targetDir, ...segments);
		const candidateStat = await raceCancellation(this.fileSystemService.stat(candidate), token).catch(() => undefined);
		return candidateStat ? candidate : uri;
	}

	private async findMatchingWorktree(uri: vscode.Uri, workspaceInfo: IWorkspaceInfo, additionalWorkspaces: IWorkspaceInfo[], token: vscode.CancellationToken): Promise<vscode.Uri | undefined> {
		// Assume the uri is `/user/abc/projects/project_abc/file.ts` and one of the items in workspaceInfo or additionalWorkspaces has a folder/repositoryUri that is /user/abc/projects/project_abc and that has a worktree at `/user/abc/projects/project_abc-worktree`, we want to translate the file uri to `/user/abc/projects/project_abc-worktree/file.ts`.
		for (const ws of [workspaceInfo, ...additionalWorkspaces]) {
			if (ws.repository && ws.worktree) {
				if (extUriBiasedIgnorePathCase.isEqualOrParent(uri, ws.repository)) {
					const rel = relativePath(ws.repository, uri);
					if (rel) {
						const candidate = URI.joinPath(ws.worktree, rel);
						const candidateStat = await raceCancellation(this.fileSystemService.stat(candidate), token).catch(() => undefined);
						return candidateStat ? candidate : uri;
					}
				}
			}
		}
	}
}

/**
 * Never include this variable in Copilot CLI prompts when using git worktrees (isolation).
 * This causes issues as the repository information will not match the worktree state.
 * https://github.com/microsoft/vscode/issues/279865
 */
function isWorkspaceRepoInformationItem(variable: PromptVariable): boolean {
	const ref = variable.reference;
	if (typeof ref.value !== 'string') {
		return false;
	}
	if (!ref.modelDescription) {
		return false;
	}
	return (
		(ref.modelDescription).startsWith('Information about one of the current repositories') || (ref.modelDescription).startsWith('Information about the current repository'))
		&&
		ref.value.startsWith('Repository name:');
}

function isGitHubPullRequestReference(ref: vscode.ChatPromptReference): boolean {
	return ref.id === 'github-pull-request';
}

function isGitMergeChangesReference(ref: vscode.ChatPromptReference): boolean {
	return ref.id === 'git-merge-changes';
}
