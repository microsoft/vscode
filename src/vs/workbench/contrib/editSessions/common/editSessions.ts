/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

export const EDIT_SESSION_SYNC_CATEGORY: ILocalizedString = {
	original: 'Edit Sessions',
	value: localize('session sync', 'Edit Sessions')
};

export const IEditSessionsWorkbenchService = createDecorator<IEditSessionsWorkbenchService>('IEditSessionsWorkbenchService');
export interface IEditSessionsWorkbenchService {
	_serviceBrand: undefined;

	read(ref: string | undefined): Promise<{ ref: string; editSession: EditSession } | undefined>;
	write(editSession: EditSession): Promise<string>;
	delete(ref: string): Promise<void>;
}

export const IEditSessionsLogService = createDecorator<IEditSessionsLogService>('IEditSessionsLogService');
export interface IEditSessionsLogService extends ILogService { }

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

export const EDIT_SESSIONS_SIGNED_IN_KEY = 'editSessionsSignedIn';
export const EDIT_SESSIONS_SIGNED_IN = new RawContextKey<boolean>(EDIT_SESSIONS_SIGNED_IN_KEY, false);
