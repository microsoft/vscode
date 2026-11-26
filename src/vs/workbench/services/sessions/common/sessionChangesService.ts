/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IMultiDiffEditorOptions } from '../../../../editor/common/multiDiffEditor.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroup } from '../../editor/common/editorGroupsService.js';
import { PreferredGroup } from '../../editor/common/editorService.js';
import { ISessionChangeset } from './session.js';

export const ISessionChangesService = createDecorator<ISessionChangesService>('sessionChangesService');

/** Options for opening a session Changes editor with an optional changeset selection. */
export interface ISessionChangesEditorOptions extends IMultiDiffEditorOptions {
	readonly changesetSelection?:
	| { readonly kind: 'id'; readonly id: string | undefined }
	| { readonly kind: 'transient'; readonly changeset: ISessionChangeset };
	/**
	 * The chat whose changes the editor shows, whichever chat or session is active. Without it, the editor is the main
	 * window's, which shows the changes of the chat the main window shows for the session.
	 */
	readonly chatResource?: URI;
}

/** Owns the identity and presentation state of a session's Changes editor. */
export interface ISessionChangesService {
	readonly _serviceBrand: undefined;
	readonly activeSessionUncommittedChangesCountObs: IObservable<number | undefined>;

	/**
	 * Builds the multi-diff source URI that identifies a session's Changes editor; with `chatResource`, the editor of that
	 * chat, which shows that chat's changes only (see {@link ISessionChangesEditorOptions.chatResource}).
	 */
	getChangesEditorResource(sessionResource: URI, chatResource?: URI): URI;
	/**
	 * The count of uncommitted changed files that the Changes editor of `editorResource` announces: that of the active
	 * session, and where Changes editors name their chat, as in an editor window, only for the one of the chat shown.
	 */
	getChangesEditorFileCount(editorResource: URI): IObservable<number | undefined>;

	/** Returns the session identified by a Changes editor resource. */
	getSessionResource(editorResource: URI): URI | undefined;

	/** Returns the chat a Changes editor resource names, if any: see {@link ISessionChangesEditorOptions.chatResource}. */
	getChatResource(editorResource: URI): URI | undefined;

	/** Opens the Changes editor for a session. */
	openChangesEditor(sessionResource: URI, options?: ISessionChangesEditorOptions, group?: PreferredGroup): Promise<IEditorGroup | undefined>;

	/**
	 * Where Changes editors follow their own session, as in an editor window, opens the Changes editor of the chat of
	 * `chatResource` with its changeset `changesetId` selected, whether or not the window shows the chat. Resolves to
	 * whether it opened one: not where editors don't follow their own session, nor for a chat of no known session.
	 */
	openChatChangesEditor(chatResource: URI, changesetId: string): Promise<boolean>;
}
