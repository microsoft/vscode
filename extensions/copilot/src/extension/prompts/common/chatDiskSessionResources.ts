/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { URI } from '../../../util/vs/base/common/uri';

/**
 * A recursive file tree structure where keys are filenames/directory names
 * and values are either file contents (string) or nested FileTree objects.
 */
export interface FileTree {
	[name: string]: string | FileTree | undefined;
}

/**
 * Service for managing disk-based session resources for chat.
 * Used to persist large tool results to disk to avoid filling up the context window.
 */
export interface IChatDiskSessionResources {
	readonly _serviceBrand: undefined;

	/**
	 * Ensures that files exist on disk in an idempotent manner.
	 * If files already exist with matching content, this is a no-op.
	 *
	 * @param sessionId The session ID for namespacing
	 * @param subdir A subdirectory path (will be sanitized)
	 * @param files Either a single file content string or a FileTree structure
	 * @returns The URI of the created directory containing the files
	 */
	ensure(sessionId: string, subdir: string, files: string | FileTree): Promise<URI>;

	/**
	 * Checks if a URI is within the disk session resources storage.
	 * Used to allow reading these files without confirmation.
	 */
	isSessionResourceUri(uri: URI): boolean;
}

export const IChatDiskSessionResources = createServiceIdentifier<IChatDiskSessionResources>('IChatDiskSessionResources');
