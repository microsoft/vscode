/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { Stats } from 'fs';
import { Schemas } from '../../../base/common/network.js';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { originalFSPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from '../../workspace/common/workspace.js';

/**
 * Length of workspace identifiers that are not empty. Those are
 * MD5 hashes (128bits / 4 due to hex presentation).
 */
export const NON_EMPTY_WORKSPACE_ID_LENGTH = 128 / 4;

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// NOTE: DO NOT CHANGE. IDENTIFIERS HAVE TO REMAIN STABLE
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

export function getWorkspaceIdentifier(configPath: URI): IWorkspaceIdentifier {

	function getWorkspaceId(): string {
		let configPathStr = configPath.scheme === Schemas.file ? originalFSPath(configPath) : configPath.toString();
		if (!isLinux) {
			configPathStr = configPathStr.toLowerCase(); // sanitize for platform file system
		}

		return createHash('md5').update(configPathStr).digest('hex'); // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
	}

	return {
		id: getWorkspaceId(),
		configPath
	};
}

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// NOTE: DO NOT CHANGE. IDENTIFIERS HAVE TO REMAIN STABLE
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

export function getSingleFolderWorkspaceIdentifier(folderUri: URI): ISingleFolderWorkspaceIdentifier | undefined;
export function getSingleFolderWorkspaceIdentifier(folderUri: URI, folderStat: Stats): ISingleFolderWorkspaceIdentifier;
export function getSingleFolderWorkspaceIdentifier(folderUri: URI, folderStat?: Stats): ISingleFolderWorkspaceIdentifier | undefined {

	function getFolderId(): string | undefined {

		// Remote: produce a hash from the entire URI
		if (folderUri.scheme !== Schemas.file) {
			return createHash('md5').update(folderUri.toString()).digest('hex'); // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
		}

		// Local: we use the ctime as extra salt to the
		// identifier so that folders getting recreated
		// result in a different identifier. However, if
		// the stat is not provided we return `undefined`
		// to ensure identifiers are stable for the given
		// URI.

		if (!folderStat) {
			return undefined;
		}

		let ctime: number | undefined;
		if (isLinux) {
			ctime = folderStat.ino; // Linux: birthtime is ctime, so we cannot use it! We use the ino instead!
		} else if (isMacintosh) {
			ctime = folderStat.birthtime.getTime(); // macOS: birthtime is fine to use as is
		} else if (isWindows) {
			if (typeof folderStat.birthtimeMs === 'number') {
				ctime = Math.floor(folderStat.birthtimeMs); // Windows: fix precision issue in node.js 8.x to get 7.x results (see https://github.com/nodejs/node/issues/19897)
			} else {
				ctime = folderStat.birthtime.getTime();
			}
		}

		return createHash('md5').update(folderUri.fsPath).update(ctime ? String(ctime) : '').digest('hex'); // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
	}

	const folderId = getFolderId();
	if (typeof folderId === 'string') {
		return {
			id: folderId,
			uri: folderUri
		};
	}

	return undefined; // invalid folder
}

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// NOTE: DO NOT CHANGE. IDENTIFIERS HAVE TO REMAIN STABLE
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

export function createEmptyWorkspaceIdentifier(): IEmptyWorkspaceIdentifier {
	return {
		id: (Date.now() + Math.round(Math.random() * 1000)).toString()
	};
}
