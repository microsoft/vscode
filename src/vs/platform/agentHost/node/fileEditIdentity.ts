/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { ExtUri, type IExtUri } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { FileSystemProviderCapabilities, type IFileService } from '../../files/common/files.js';
import type { IFileEditRecord } from '../common/sessionDataService.js';

/** Uses the host provider's declared sensitivity, like UriIdentityService; unknown providers remain case-sensitive. */
export function createFileEditUriIdentity(fileService: IFileService): IExtUri {
	return new FileEditUriIdentity(resource => fileService.hasProvider(resource) && !fileService.hasCapability(resource, FileSystemProviderCapabilities.PathCaseSensitive));
}

class FileEditUriIdentity extends ExtUri {
	override getComparisonKey(resource: URI, ignoreFragment?: boolean): string {
		return super.getComparisonKey(normalizeFileEditResource(resource), ignoreFragment);
	}

	override isEqualOrParent(resource: URI, parent: URI, ignoreFragment?: boolean, forcePosixSemantics?: boolean): boolean {
		return super.isEqualOrParent(normalizeFileEditResource(resource), normalizeFileEditResource(parent), ignoreFragment, forcePosixSemantics);
	}
}

/** Removes redundant dot segments without resolving parent traversals across possible symlinks. */
export function normalizeFileEditResource(resource: URI): URI {
	if (resource.scheme !== Schemas.file) {
		return resource;
	}
	const segments = resource.path.split('/');
	return segments.includes('.') ? resource.with({ path: segments.filter(segment => segment !== '.').join('/') || '/' }) : resource;
}

export function getFileEditResourceKey(resource: URI, identity: IExtUri): string {
	return identity.getComparisonKey(normalizeFileEditResource(resource));
}

export function getFileEditPathKey(filePath: string, identity: IExtUri): string {
	return getFileEditResourceKey(URI.file(filePath), identity);
}

export function isFileEditPath(filePath: string | undefined, resource: URI, identity: IExtUri): boolean {
	return filePath !== undefined && getFileEditPathKey(filePath, identity) === getFileEditResourceKey(resource, identity);
}

/** A persisted row's identity stays exact: different spellings can hold successive snapshots of the same file. */
export function getFileEditRecordKey(record: Pick<IFileEditRecord, 'toolCallId' | 'filePath'>): string {
	return `${record.toolCallId}\0${record.filePath}`;
}
