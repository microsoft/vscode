/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { realpath } from 'fs/promises';
import * as path from 'path';
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
import { WorkingDirectory } from '../../../platform/workspace/common/workingDirectory';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { CancellationError } from '../../../util/vs/base/common/errors';
import { Schemas } from '../../../util/vs/base/common/network';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { extUriBiasedIgnorePathCase, isEqual, normalizePath } from '../../../util/vs/base/common/resources';
import { isString } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { isCustomizationsIndex, isPromptFile } from '../../prompt/common/chatVariablesCollection';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IChatDiskSessionResources } from '../../prompts/common/chatDiskSessionResources';

export function checkCancellation(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
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
 * - When a working directory is set (agents window), unscoped patterns
 *   are scoped to it so searches target the session's folder.
 */
export function inputGlobToPattern(query: string, workingDir: WorkingDirectory, modelFamily: string | undefined): InputGlobResult {
	let pattern: vscode.GlobPattern = query;
	let folderName: string | undefined;
	let folderRelativePattern: string | undefined;

	if (isAbsolute(query)) {
		try {
			const uri = URI.file(query);
			const workspaceFolder = workingDir.getFolder(uri);
			if (workspaceFolder) {
				const relative = extUriBiasedIgnorePathCase.relativePath(workspaceFolder, uri) || '';
				pattern = new RelativePattern(workspaceFolder, relative);
				folderName = workingDir.getFolderName(workspaceFolder);
				folderRelativePattern = relative;
			}
		} catch (e) {
			// ignore
		}
	}

	// In multi-root workspaces (and only when no explicit workingDirectory), detect patterns
	// like "folderName/src/**" or "**/folderName/src/**" and rewrite to a RelativePattern.
	if (typeof pattern === 'string' && !workingDir.hasExplicitWorkingDirectory && workingDir.getFolders().length > 1) {
		let raw = pattern;
		if (raw.startsWith('**/')) {
			raw = raw.slice(3);
		}

		const slashIndex = raw.indexOf('/');
		const candidateName = slashIndex >= 0 ? raw.slice(0, slashIndex) : raw;
		if (candidateName && !candidateName.includes('*')) {
			for (const folderUri of workingDir.getFolders()) {
				const name = workingDir.getFolderName(folderUri);
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

	// When a working directory is set (agents window) and the pattern is still
	// unscoped (a plain string, not a RelativePattern), scope it to the session's
	// working directory so searches target the correct folder.
	if (typeof pattern === 'string' && workingDir.hasExplicitWorkingDirectory) {
		pattern = new RelativePattern(workingDir.uri!, pattern);
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

interface FileExternalConfirmationOptions {
	readonly readOnly?: boolean;
	readonly workingDirectory?: URI;
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
		const attachedPromptFile = buildPromptContext.chatVariables.find(v => isPromptFile(v.reference) && isEqual(normalizedUri, v.reference.value));
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

	const indexVariable = buildPromptContext.chatVariables.find(v => isCustomizationsIndex(v.reference));
	if (indexVariable && isString(indexVariable.value)) {
		const indexFile = customInstructionsService.parseInstructionIndexFile(indexVariable.value);
		cachedInstructionIndexFile = { requestId: buildPromptContext.requestId, file: indexFile };
		return indexFile;
	}
	cachedInstructionIndexFile = undefined;
	return undefined;

}

export async function assertFileNotContentExcluded(accessor: ServicesAccessor, uri: URI, realPath?: URI, contents?: string): Promise<void> {
	const ignoreService = accessor.get(IIgnoreService);
	const promptPathRepresentationService = accessor.get(IPromptPathRepresentationService);
	if (await ignoreService.isCopilotIgnored(uri, undefined, contents)) {
		throw new Error(`File ${promptPathRepresentationService.getFilePath(uri)} is configured to be ignored by Copilot`);
	}
	if (realPath && !extUriBiasedIgnorePathCase.isEqual(realPath, uri) && await ignoreService.isCopilotIgnored(realPath, undefined, contents)) {
		throw new Error(`File ${promptPathRepresentationService.getFilePath(realPath)} is configured to be ignored by Copilot`);
	}
}

export interface FileExternalConfirmationResult {
	readonly needsConfirmation: boolean;
	readonly realPath: URI | undefined;
}

export async function isFileExternalAndNeedsConfirmation(accessor: ServicesAccessor, uri: URI, buildPromptContext?: IBuildPromptContext, options?: FileExternalConfirmationOptions): Promise<FileExternalConfirmationResult> {
	const instantiationService = accessor.get(IInstantiationService);
	return instantiationService.invokeFunction(
		accessor => getFileExternalConfirmation(accessor, uri, buildPromptContext, options, true)
	);
}

async function getFileExternalConfirmation(accessor: ServicesAccessor, uri: URI, buildPromptContext: IBuildPromptContext | undefined, options: FileExternalConfirmationOptions | undefined, requireExistingExternalFile: boolean): Promise<FileExternalConfirmationResult> {
	const workspaceService = accessor.get(IWorkspaceService);
	const tabsAndEditorsService = accessor.get(ITabsAndEditorsService);
	const customInstructionsService = accessor.get(ICustomInstructionsService);
	const diskSessionResources = accessor.get(IChatDiskSessionResources);
	const configurationService = accessor.get(IConfigurationService);
	const fileSystemService = accessor.get(IFileSystemService);
	const chatDebugFileLogger = accessor.get(IChatDebugFileLoggerService);
	const sessionTranscriptService = accessor.get(ISessionTranscriptService);

	const normalizedUri = normalizePath(uri);

	const workingDir = new WorkingDirectory(options?.workingDirectory, workspaceService);
	if (workingDir.getFolder(normalizedUri)) {
		return getWorkspaceFileExternalConfirmation(normalizedUri, uri => workingDir.getFolder(uri));
	}
	if (options?.readOnly && isUriUnderAdditionalReadAccessPaths(normalizedUri, configurationService)) {
		return { needsConfirmation: false, realPath: undefined };
	}
	if (uri.scheme === Schemas.untitled || uri.scheme === 'vscode-chat-response-resource') {
		return { needsConfirmation: false, realPath: undefined };
	}
	if (await isExternalInstructionsFile(normalizedUri, customInstructionsService, buildPromptContext)) {
		return { needsConfirmation: false, realPath: undefined };
	}
	if (diskSessionResources.isSessionResourceUri(normalizedUri)) {
		return { needsConfirmation: false, realPath: undefined };
	}
	if (chatDebugFileLogger.isDebugLogUri(normalizedUri)) {
		return { needsConfirmation: false, realPath: undefined };
	}
	if (sessionTranscriptService.isTranscriptUri(normalizedUri)) {
		return { needsConfirmation: false, realPath: undefined };
	}
	if (tabsAndEditorsService.tabs.some(tab => isEqual(tab.uri, uri))) {
		return { needsConfirmation: false, realPath: undefined };
	}

	if (requireExistingExternalFile) {
		// Avoid showing a confusing external-file confirmation when the tool will ultimately fail.
		const fileExists = await fileSystemService.stat(normalizedUri).then(() => true).catch(() => false);
		if (!fileExists) {
			throw new Error(`File ${normalizedUri.fsPath} does not exist`);
		}
	}

	return { needsConfirmation: true, realPath: undefined };
}

/**
 * Checks whether a symlinked file resolves outside the workspace.
 */
export async function isExternalSymlinkedFile(uri: URI, getFolder: (uri: URI) => URI | undefined): Promise<boolean> {
	return (await getWorkspaceFileExternalConfirmation(uri, getFolder)).needsConfirmation;
}

async function getWorkspaceFileExternalConfirmation(uri: URI, getFolder: (uri: URI) => URI | undefined): Promise<FileExternalConfirmationResult> {
	if (uri.scheme !== Schemas.file) {
		return { needsConfirmation: false, realPath: undefined };
	}

	const workspaceFolder = getFolder(uri);
	if (!workspaceFolder || workspaceFolder.scheme !== Schemas.file) {
		return { needsConfirmation: false, realPath: undefined };
	}

	const resolvedUri = normalizePath(await resolveRealPathForNonexistent(uri, workspaceFolder));
	if (extUriBiasedIgnorePathCase.isEqual(resolvedUri, uri)) {
		return { needsConfirmation: false, realPath: undefined };
	}

	const isInsideWorkspace = getFolder(resolvedUri) !== undefined;
	return { needsConfirmation: !isInsideWorkspace, realPath: resolvedUri };
}

/**
 * Resolves a path through its nearest existing ancestor without walking above `stopAt`.
 */
export async function resolveRealPathForNonexistent(resource: URI, stopAt?: URI): Promise<URI> {
	try {
		return URI.file(await realpath(resource.fsPath));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}

	const tail = [path.basename(resource.fsPath)];
	let current = path.dirname(resource.fsPath);
	while (true) {
		if (stopAt && isEqual(normalizePath(URI.file(current)), normalizePath(stopAt))) {
			try {
				return URI.file(path.join(await realpath(stopAt.fsPath), ...tail));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
					return resource;
				}
				throw error;
			}
		}

		const parent = path.dirname(current);
		if (parent === current) {
			// On Windows, resolving `\` adds the current drive and can make an unchanged path appear redirected.
			return resource;
		}

		try {
			return URI.file(path.join(await realpath(current), ...tail));
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== 'ENOENT' && code !== 'ENOTDIR') {
				throw error;
			}
		}

		tail.unshift(path.basename(current));
		current = parent;
	}
}

export function isDirExternalAndNeedsConfirmation(accessor: ServicesAccessor, uri: URI, buildPromptContext?: IBuildPromptContext, options?: { readOnly?: boolean; workingDirectory?: URI }): boolean {
	const workspaceService = accessor.get(IWorkspaceService);
	const customInstructionsService = accessor.get(ICustomInstructionsService);
	const configurationService = accessor.get(IConfigurationService);

	const normalizedUri = normalizePath(uri);

	const workingDir = new WorkingDirectory(options?.workingDirectory, workspaceService);
	if (workingDir.getFolder(normalizedUri)) {
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
