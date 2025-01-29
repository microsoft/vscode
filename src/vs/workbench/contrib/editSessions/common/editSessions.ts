/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IResourceRefHandle } from '../../../../platform/userDataSync/common/userDataSync.js';
import { Event } from '../../../../base/common/event.js';
import { StringSHA1 } from '../../../../base/common/hash.js';
import { EditSessionsStoreClient } from './editSessionsStorageClient.js';

export const EDIT_SESSION_SYNC_CATEGORY = localize2('cloud changes', 'Cloud Changes');

export type SyncResource = 'editSessions' | 'workspaceState';

export const IEditSessionsStorageService = createDecorator<IEditSessionsStorageService>('IEditSessionsStorageService');
export interface IEditSessionsStorageService {
	_serviceBrand: undefined;

	readonly SIZE_LIMIT: number;

	readonly isSignedIn: boolean;
	readonly onDidSignIn: Event<void>;
	readonly onDidSignOut: Event<void>;

	storeClient: EditSessionsStoreClient | undefined;

	lastReadResources: Map<SyncResource, { ref: string; content: string }>;
	lastWrittenResources: Map<SyncResource, { ref: string; content: string }>;

	initialize(reason: 'read' | 'write', silent?: boolean): Promise<boolean>;
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
	workspaceStateId?: string;
	machine?: string;
	folders: Folder[];
}

export const EDIT_SESSIONS_SIGNED_IN_KEY = 'editSessionsSignedIn';
export const EDIT_SESSIONS_SIGNED_IN = new RawContextKey<boolean>(EDIT_SESSIONS_SIGNED_IN_KEY, false);

export const EDIT_SESSIONS_PENDING_KEY = 'editSessionsPending';
export const EDIT_SESSIONS_PENDING = new RawContextKey<boolean>(EDIT_SESSIONS_PENDING_KEY, false);

export const EDIT_SESSIONS_CONTAINER_ID = 'workbench.view.editSessions';
export const EDIT_SESSIONS_DATA_VIEW_ID = 'workbench.views.editSessions.data';
export const EDIT_SESSIONS_TITLE: ILocalizedString = localize2('cloud changes', 'Cloud Changes');

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
