/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptPiece } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IChatDebugFileLoggerService } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { ISessionTranscriptService } from '../../../platform/chat/common/sessionTranscriptService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICustomInstructionsService, IInstructionIndexFile } from '../../../platform/customInstructions/common/customInstructionsService';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { RelativePattern } from '../../../platform/filesystem/common/fileTypes';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { CancellationError } from '../../../util/vs/base/common/errors';
import { Schemas } from '../../../util/vs/base/common/network';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { extUriBiasedIgnorePathCase, isEqual, normalizePath } from '../../../util/vs/base/common/resources';
import { isString } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelPromptTsxPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { isCustomizationsIndex, isPromptFile } from '../../prompt/common/chatVariablesCollection';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IChatDiskSessionResources } from '../../prompts/common/chatDiskSessionResources';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';

export function checkCancellation(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}

export async function toolTSX(insta: IInstantiationService, options: vscode.LanguageModelToolInvocationOptions<unknown>, piece: PromptPiece, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
	return new LanguageModelToolResult([
		new LanguageModelPromptTsxPart(
			await renderPromptElementJSON(insta, class extends PromptElement {
				render() {
					return piece;
				}
			}, {}, options.tokenizationOptions, token)
		)
	]);
}

export interface InputGlobResult {
	/** The resolved glob patterns to pass to the search API. */
	readonly patterns: vscode.GlobPattern[];
	/** The workspace folder name if the pattern was scoped to a specific folder, for display. */
	readonly folderName: string | undefined;
	/** The glob pattern within the folder (e.g. `src/**`), for display. Only set when folderName is set. */
	readonly folderRelativePattern: string | undefined;
}

/**
 * Converts a user input glob or file path into VS Code glob patterns.
 * Handles:
 * - Absolute paths within a workspace folder
 * - Patterns prefixed with a workspace folder name (e.g. `folderName/src/**`)
 * - Patterns prefixed with `** /folderName/...` in multi-root workspaces
 */
export function inputGlobToPattern(query: string, workspaceService: IWorkspaceService, modelFamily: string | undefined): InputGlobResult {
	let pattern: vscode.GlobPattern = query;
	let folderName: string | undefined;
	let folderRelativePattern: string | undefined;

	if (isAbsolute(query)) {
		try {
			const uri = URI.file(query);
			const workspaceFolder = workspaceService.getWorkspaceFolder(uri);
			if (workspaceFolder) {
				const relative = extUriBiasedIgnorePathCase.relativePath(workspaceFolder, uri) || '';
				pattern = new RelativePattern(workspaceFolder, relative);
				folderName = workspaceService.getWorkspaceFolderName(workspaceFolder);
				folderRelativePattern = relative;
			}
		} catch (e) {
			// ignore
		}
	}

	// In multi-root workspaces, detect patterns like "folderName/src/**" or "**/folderName/src/**"
	// and rewrite to a RelativePattern scoped to that folder.
	if (typeof pattern === 'string' && workspaceService.getWorkspaceFolders().length > 1) {
		let raw = pattern;
		if (raw.startsWith('**/')) {
			raw = raw.slice(3);
		}

		const slashIndex = raw.indexOf('/');
		const candidateName = slashIndex >= 0 ? raw.slice(0, slashIndex) : raw;
		if (candidateName && !candidateName.includes('*')) {
			for (const folderUri of workspaceService.getWorkspaceFolders()) {
				const name = workspaceService.getWorkspaceFolderName(folderUri);
				if (name === candidateName) {
					const remainder = slashIndex >= 0 ? raw.slice(slashIndex + 1) : '**';
					const resolvedRemainder = remainder || '**';
					pattern = new RelativePattern(folderUri, resolvedRemainder);
					folderName = name;
					folderRelativePattern = resolvedRemainder;
					break;
				}
			}
		}
	}

	const patterns = [pattern];

	// For gpt-4.1, it struggles to append /** to the pattern itself, so here we work around it by
	// adding a second pattern with /** appended.
	// Other models are smart enough to append the /** suffix so they don't need this workaround.
	if (modelFamily === 'gpt-4.1') {
		if (typeof pattern === 'string' && !pattern.endsWith('/**')) {
			patterns.push(pattern + '/**');
		} else if (typeof pattern !== 'string' && !pattern.pattern.endsWith('/**')) {
			patterns.push(new RelativePattern(pattern.baseUri, pattern.pattern + '/**'));
		}
	}

	return { patterns, folderName, folderRelativePattern };
}

/**
 * Checks whether the raw input pattern contains an absolute workspace folder path.
 * Used for telemetry to detect patterns we may not be handling yet.
 */
export function patternContainsWorkspaceFolderPath(pattern: string | undefined, workspaceService: IWorkspaceService): boolean {
	if (!pattern) {
		return false;
	}

	for (const folderUri of workspaceService.getWorkspaceFolders()) {
		if (pattern.includes(folderUri.fsPath) || pattern.includes(folderUri.path)) {
			return true;
		}
	}

	return false;
}

export function resolveToolInputPath(path: string, promptPathRepresentationService: IPromptPathRepresentationService): URI {
	const uri = promptPathRepresentationService.resolveFilePath(path);
	if (!uri) {
		throw new Error(`Invalid input path: ${path}. Be sure to use an absolute path.`);
	}

	return uri;
}

export async function isFileOkForTool(accessor: ServicesAccessor, uri: URI, buildPromptContext?: IBuildPromptContext): Promise<boolean> {
	try {
		await assertFileOkForTool(accessor, uri, buildPromptContext);
		return true;
	} catch {
		return false;
	}
}

export interface AssertFileOkForToolOptions {
	readOnly?: boolean;
}

export async function assertFileOkForTool(accessor: ServicesAccessor, uri: URI, buildPromptContext?: IBuildPromptContext, options?: AssertFileOkForToolOptions): Promise<void> {
	const workspaceService = accessor.get(IWorkspaceService);
	const tabsAndEditorsService = accessor.get(ITabsAndEditorsService);
	const promptPathRepresentationService = accessor.get(IPromptPathRepresentationService);
	const customInstructionsService = accessor.get(ICustomInstructionsService);
	const diskSessionResources = accessor.get(IChatDiskSessionResources);
	const configurationService = accessor.get(IConfigurationService);
	const chatDebugFileLogger = accessor.get(IChatDebugFileLoggerService);
	const sessionTranscriptService = accessor.get(ISessionTranscriptService);

	await assertFileNotContentExcluded(accessor, uri);

	const normalizedUri = normalizePath(uri);
	if (workspaceService.getWorkspaceFolder(normalizedUri)) {
		return;
	}
	if (options?.readOnly && isUriUnderAdditionalReadAccessPaths(normalizedUri, configurationService)) {
		return;
	}
	if (uri.scheme === Schemas.untitled) {
		return;
	}
	const fileOpenInSomeTab = tabsAndEditorsService.tabs.some(tab => isEqual(tab.uri, uri));
	if (fileOpenInSomeTab) {
		return;
	}
	if (diskSessionResources.isSessionResourceUri(normalizedUri)) {
		return;
	}
	if (chatDebugFileLogger.isDebugLogUri(normalizedUri)) {
		return;
	}
	if (sessionTranscriptService.isTranscriptUri(normalizedUri)) {
		return;
	}
	if (normalizedUri.scheme === 'vscode-chat-response-resource') {
		return;
	}
	if (await isExternalInstructionsFile(normalizedUri, customInstructionsService, buildPromptContext)) {
		return;
	}
	throw new Error(`File ${promptPathRepresentationService.getFilePath(normalizedUri)} is outside of the workspace, and not open in an editor, and can't be read`);
}

async function isExternalInstructionsFile(normalizedUri: URI, customInstructionsService: ICustomInstructionsService, buildPromptContext?: IBuildPromptContext): Promise<boolean> {
	if (buildPromptContext) {
		const instructionIndexFile = getInstructionsIndexFile(buildPromptContext, customInstructionsService);
		if (instructionIndexFile) {
			if (instructionIndexFile.instructions.has(normalizedUri) || instructionIndexFile.skills.has(normalizedUri)) {
				return true;
			}
			// Check if the URI is under any skill folder (e.g., nested files like primitives/agents.md)
			for (const skillFolderUri of instructionIndexFile.skillFolders) {
				if (extUriBiasedIgnorePathCase.isEqualOrParent(normalizedUri, skillFolderUri)) {
					return true;
				}
			}
		}
		const attachedPromptFile = buildPromptContext.chatVariables.find(v => isPromptFile(v) && isEqual(normalizedUri, v.value));
		if (attachedPromptFile) {
			return true;
		}
	} else {
		if (customInstructionsService.getExtensionSkillInfo(normalizedUri)) {
			return true;
		}
		// Note: this fallback check does not handle scenario where model passes file:// for userData schemes.
		if (await customInstructionsService.isExternalInstructionsFile(normalizedUri)) {
			return true;
		}
	}
	return false;
}

let cachedInstructionIndexFile: { requestId: string; file: IInstructionIndexFile } | undefined;

function getInstructionsIndexFile(buildPromptContext: IBuildPromptContext, customInstructionsService: ICustomInstructionsService): IInstructionIndexFile | undefined {
	if (!buildPromptContext.requestId) {
		return undefined;
	}

	if (cachedInstructionIndexFile?.requestId === buildPromptContext.requestId) {
		return cachedInstructionIndexFile.file;
	}

	const indexVariable = buildPromptContext.chatVariables.find(isCustomizationsIndex);
	if (indexVariable && isString(indexVariable.value)) {
		const indexFile = customInstructionsService.parseInstructionIndexFile(indexVariable.value);
		cachedInstructionIndexFile = { requestId: buildPromptContext.requestId, file: indexFile };
		return indexFile;
	}
	cachedInstructionIndexFile = undefined;
	return undefined;

}

export async function assertFileNotContentExcluded(accessor: ServicesAccessor, uri: URI): Promise<void> {
	const ignoreService = accessor.get(IIgnoreService);
	const promptPathRepresentationService = accessor.get(IPromptPathRepresentationService);

	if (await ignoreService.isCopilotIgnored(uri)) {
		throw new Error(`File ${promptPathRepresentationService.getFilePath(uri)} is configured to be ignored by Copilot`);
	}
}

export async function isFileExternalAndNeedsConfirmation(accessor: ServicesAccessor, uri: URI, buildPromptContext?: IBuildPromptContext, options?: { readOnly?: boolean }): Promise<boolean> {
	const workspaceService = accessor.get(IWorkspaceService);
	const tabsAndEditorsService = accessor.get(ITabsAndEditorsService);
	const customInstructionsService = accessor.get(ICustomInstructionsService);
	const diskSessionResources = accessor.get(IChatDiskSessionResources);
	const configurationService = accessor.get(IConfigurationService);
	const fileSystemService = accessor.get(IFileSystemService);
	const chatDebugFileLogger = accessor.get(IChatDebugFileLoggerService);
	const sessionTranscriptService = accessor.get(ISessionTranscriptService);

	const normalizedUri = normalizePath(uri);

	// Not external if: in workspace, untitled, instructions file, session resource, or open in editor
	if (workspaceService.getWorkspaceFolder(normalizedUri)) {
		return false;
	}
	if (options?.readOnly && isUriUnderAdditionalReadAccessPaths(normalizedUri, configurationService)) {
		return false;
	}
	if (uri.scheme === Schemas.untitled || uri.scheme === 'vscode-chat-response-resource') {
		return false;
	}
	if (await isExternalInstructionsFile(normalizedUri, customInstructionsService, buildPromptContext)) {
		return false;
	}
	if (diskSessionResources.isSessionResourceUri(normalizedUri)) {
		return false;
	}
	if (chatDebugFileLogger.isDebugLogUri(normalizedUri)) {
		return false;
	}
	if (sessionTranscriptService.isTranscriptUri(normalizedUri)) {
		return false;
	}
	if (tabsAndEditorsService.tabs.some(tab => isEqual(tab.uri, uri))) {
		return false;
	}

	// If the file doesn't exist, throw immediately rather than showing a confusing "external file"
	// confirmation — the tool should fail with a clear "file not found" error instead.
	const fileExists = await fileSystemService.stat(normalizedUri).then(() => true).catch(() => false);
	if (!fileExists) {
		throw new Error(`File ${normalizedUri.fsPath} does not exist`);
	}

	return true;
}

export function isDirExternalAndNeedsConfirmation(accessor: ServicesAccessor, uri: URI, buildPromptContext?: IBuildPromptContext, options?: { readOnly?: boolean }): boolean {
	const workspaceService = accessor.get(IWorkspaceService);
	const customInstructionsService = accessor.get(ICustomInstructionsService);
	const configurationService = accessor.get(IConfigurationService);

	const normalizedUri = normalizePath(uri);

	// Not external if: in workspace or external instructions folder
	if (workspaceService.getWorkspaceFolder(normalizedUri)) {
		return false;
	}
	if (options?.readOnly && isUriUnderAdditionalReadAccessPaths(normalizedUri, configurationService)) {
		return false;
	}
	if (buildPromptContext) {
		const instructionIndexFile = getInstructionsIndexFile(buildPromptContext, customInstructionsService);
		if (instructionIndexFile) {
			for (const skillFolderUri of instructionIndexFile.skillFolders) {
				if (extUriBiasedIgnorePathCase.isEqualOrParent(normalizedUri, skillFolderUri)) {
					return false;
				}
			}
		}
	} else {
		if (customInstructionsService.isExternalInstructionsFolder(normalizedUri)) {
			return false;
		}
	}
	return true;
}

function isUriUnderAdditionalReadAccessPaths(uri: URI, configurationService: IConfigurationService): boolean {
	const paths = configurationService.getConfig(ConfigKey.AdditionalReadAccessPaths);
	for (const p of paths) {
		const folderUri = normalizePath(URI.file(p));
		if (extUriBiasedIgnorePathCase.isEqualOrParent(uri, folderUri)) {
			return true;
		}
	}
	return false;
}
