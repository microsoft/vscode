/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Uri } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { getDriveLetter, hasDriveLetter } from '../../../util/vs/base/common/extpath';
import { Schemas } from '../../../util/vs/base/common/network';
import { isWindows } from '../../../util/vs/base/common/platform';
import { isDefined } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { IWorkspaceService } from '../../workspace/common/workspaceService';

export const IPromptPathRepresentationService = createServiceIdentifier<IPromptPathRepresentationService>('IPromptPathRepresentationService');

/**
 * A service that is to be used to represent and restore document URI's in prompts.
 * Using the service makes sure this happens in consistent and portable way across prompt elements.
 */
export interface IPromptPathRepresentationService {

	_serviceBrand: undefined;

	getFilePath(uri: Uri): string;

	resolveFilePath(filePath: string, predominantScheme?: string): Uri | undefined;

	getExampleFilePath(relativeFilePath: string): string;
}

/**
 * Used to represent file URIs in prompts. Typically, this happens in code blocks using the `filepath` comment.
 * Using the service makes sure this happens in a consistent and portable way across prompt elements.
 * When creating a prompt, use `getFilePath` to get the string to use as a `filepath`.
 * When readong a LLM response, use `resolveFilePath` to get the URI from from a `filepath`
 *
 * Do not use this service for other usages than prompts.
 * We currently use the fsPath for local and remote filesystems, and URI.toString() for other schemes.
 */
export class PromptPathRepresentationService implements IPromptPathRepresentationService {

	_serviceBrand: undefined;

	protected isWindows() {
		return isWindows;
	}

	constructor(@IWorkspaceService private readonly workspaceService: IWorkspaceService) { }

	getFilePath(uri: Uri): string {
		if (uri.scheme === Schemas.file || uri.scheme === Schemas.vscodeRemote) {
			return uri.fsPath;
		}
		return uri.toString();
	}

	/**
	 * Resolves an `filepath` used in a prompt to a URI. The `filepath` should have been created by `getFilePath`.
	 *
	 * @param filepath The file path to resolve.
	 * @param predominantScheme The predominant scheme to use if the path is a file path. Defaults to 'file'.
	 *
	 * @returns The resolved URI or undefined if filepath does not look like a file path or URI.
	 */
	resolveFilePath(filepath: string, predominantScheme = Schemas.file): Uri | undefined {
		// Always check for posix-like absolute paths, and also for platform-like
		// (i.e. Windows) absolute paths in case the model generates them.
		const isPosixPath = filepath.startsWith('/');
		const isWindowsPath = this.isWindows() && (hasDriveLetter(filepath) || filepath.startsWith('\\'));
		if (isPosixPath || isWindowsPath) {
			// Some models double-escape backslashes, which causes problems down the line.
			// Remove repeated backslashes from windows path (but preserve UNC paths)
			if (isWindowsPath) {
				const isUncPath = filepath.startsWith('\\\\');
				filepath = filepath.replace(/\\+/g, '\\');
				if (isUncPath) { filepath = '\\' + filepath; }
			}

			// Some models see an example of a unix path in tool calls and try to
			// represent unix paths on windows without a drive letter, which causes
			// issues. Try to rectify this.
			if (isPosixPath && this.isWindows() && predominantScheme === Schemas.file) {
				const lowerCandidates = this.workspaceService.getWorkspaceFolders()
					.filter(folder => folder.scheme === Schemas.file)
					.map(folder => getDriveLetter(folder.fsPath, true))
					.filter(isDefined);

				const matchingDriveLetter = lowerCandidates.find(c => this.workspaceService.getWorkspaceFolder(URI.file(`${c}:${filepath}`)));
				if (matchingDriveLetter) {
					filepath = `${matchingDriveLetter}:${filepath}`;
				}
			}

			const fileUri = URI.file(filepath);
			return predominantScheme === Schemas.file ? fileUri : URI.from({ scheme: predominantScheme, path: fileUri.path });
		}
		if (/\w[\w\d+.-]*:\S/.test(filepath)) { // starts with a scheme
			try {
				return URI.parse(filepath);
			} catch (e) {
				return undefined;
			}
		}
		return undefined;
	}

	getExampleFilePath(absolutePosixFilePath: string): string {
		if (this.isWindows()) {
			return this.getFilePath(URI.parse(`file:///C:${absolutePosixFilePath}`));
		} else {
			return this.getFilePath(URI.parse(`file://${absolutePosixFilePath}`));
		}
	}
}
/**
 * For testing we don't want OS dependent paths as they end up in the cache, so we use the posix path for all platforms.
 */
export class TestPromptPathRepresentationService extends PromptPathRepresentationService {
	override getFilePath(uri: Uri): string {
		if (uri.scheme === Schemas.file || uri.scheme === Schemas.vscodeRemote) {
			return uri.path;
		}
		return uri.toString();
	}

	override getExampleFilePath(absolutePosixFilePath: string): string {
		return this.getFilePath(URI.parse(`file://${absolutePosixFilePath}`));
	}
}
