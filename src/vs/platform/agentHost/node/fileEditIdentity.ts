/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtUri, type IExtUri } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { FileSystemProviderCapabilities, type IFileService } from '../../files/common/files.js';
import type { IFileEditRecord } from '../common/sessionDataService.js';

/** Uses the host provider's declared sensitivity, like UriIdentityService; unknown providers remain case-sensitive. */
export function createFileEditUriIdentity(fileService: IFileService): IExtUri {
	return new ExtUri(resource => fileService.hasProvider(resource) && !fileService.hasCapability(resource, FileSystemProviderCapabilities.PathCaseSensitive));
}

export function getFileEditPathKey(filePath: string, identity: IExtUri): string {
	return identity.getComparisonKey(URI.file(filePath));
}

export function isFileEditPath(filePath: string | undefined, resource: URI, identity: IExtUri): boolean {
	return filePath !== undefined && getFileEditPathKey(filePath, identity) === identity.getComparisonKey(resource);
}

/** A persisted row's identity stays exact: different spellings can hold successive snapshots of the same file. */
export function getFileEditRecordKey(record: Pick<IFileEditRecord, 'toolCallId' | 'filePath'>): string {
	return `${record.toolCallId}\0${record.filePath}`;
}
