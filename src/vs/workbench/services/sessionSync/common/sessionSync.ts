/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const EDIT_SESSION_SYNC_TITLE = localize('session sync', 'Edit Sessions');

export const ISessionSyncWorkbenchService = createDecorator<ISessionSyncWorkbenchService>('ISessionSyncWorkbenchService');
export interface ISessionSyncWorkbenchService {
	_serviceBrand: undefined;

	read(ref: string | undefined): Promise<EditSession | undefined>;
	write(editSession: EditSession): Promise<string>;
}

export enum ChangeType {
	Addition = 1,
	Deletion = 2,
}

export enum FileType {
	File = 1,
}

interface Addition {
	relativeFilePath: string;
	fileType: FileType.File;
	contents: string;
	type: ChangeType.Addition;
}

interface Deletion {
	relativeFilePath: string;
	fileType: FileType.File;
	contents: undefined;
	type: ChangeType.Deletion;
}

export type Change = Addition | Deletion;

export interface Folder {
	name: string;
	workingChanges: Change[];
}

export const EditSessionSchemaVersion = 1;

export interface EditSession {
	version: number;
	folders: Folder[];
}
