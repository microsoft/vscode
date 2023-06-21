/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from 'vs/base/common/buffer';
import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IResourceRefHandle } from 'vs/platform/userDataSync/common/userDataSync';
import { Event } from 'vs/base/common/event';
import { StringSHA1 } from 'vs/base/common/hash';
import { EditSessionsStoreClient } from 'vs/workbench/contrib/editSessions/common/editSessionsStorageClient';

export const EDIT_SESSION_SYNC_CATEGORY: ILocalizedString = {
	original: 'Cloud Changes',
	value: localize('cloud changes', 'Cloud Changes')
};

export type SyncResource = 'editSessions' | 'workspaceState';

export const IEditSessionsStorageService = createDecorator<IEditSessionsStorageService>('IEditSessionsStorageService');
export interface IEditSessionsStorageService {
	_serviceBrand: undefined;

	readonly SIZE_LIMIT: number;

	readonly isSignedIn: boolean;
	readonly onDidSignIn: Event<void>;
	readonly onDidSignOut: Event<void>;

	storeClient: EditSessionsStoreClient | undefined;

	initialize(silent?: boolean): Promise<boolean>;
	read(resource: SyncResource, ref: string | undefined): Promise<{ ref: string; content: string } | undefined>;
	write(resource: SyncResource, content: string | EditSession): Promise<string>;
	delete(resource: SyncResource, ref: string | null): Promise<void>;
	list(resource: SyncResource): Promise<IResourceRefHandle[]>;
	getMachineById(machineId: string): Promise<string | undefined>;
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
	canonicalIdentity: string | undefined;
	workingChanges: Change[];
	absoluteUri: string | undefined;
}

export const EditSessionSchemaVersion = 3;

export interface EditSession {
	version: number;
	machine?: string;
	folders: Folder[];
}

export const EDIT_SESSIONS_SIGNED_IN_KEY = 'editSessionsSignedIn';
export const EDIT_SESSIONS_SIGNED_IN = new RawContextKey<boolean>(EDIT_SESSIONS_SIGNED_IN_KEY, false);

export const EDIT_SESSIONS_PENDING_KEY = 'editSessionsPending';
export const EDIT_SESSIONS_PENDING = new RawContextKey<boolean>(EDIT_SESSIONS_PENDING_KEY, false);

export const EDIT_SESSIONS_CONTAINER_ID = 'workbench.view.editSessions';
export const EDIT_SESSIONS_DATA_VIEW_ID = 'workbench.views.editSessions.data';
export const EDIT_SESSIONS_TITLE = localize('cloud changes', 'Cloud Changes');

export const EDIT_SESSIONS_VIEW_ICON = registerIcon('edit-sessions-view-icon', Codicon.cloudDownload, localize('editSessionViewIcon', 'View icon of the cloud changes view.'));

export const EDIT_SESSIONS_SHOW_VIEW = new RawContextKey<boolean>('editSessionsShowView', false);

export const EDIT_SESSIONS_SCHEME = 'vscode-edit-sessions';

export function decodeEditSessionFileContent(version: number, content: string): VSBuffer {
	switch (version) {
		case 1:
			return VSBuffer.fromString(content);
		case 2:
			return decodeBase64(content);
		default:
			throw new Error('Upgrade to a newer version to decode this content.');
	}
}

export function hashedEditSessionId(editSessionId: string) {
	const sha1 = new StringSHA1();
	sha1.update(editSessionId);
	return sha1.digest();
}

export const editSessionsLogId = 'editSessions';
