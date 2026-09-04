/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IMultiDiffEditorOptions } from '../../../../editor/common/multiDiffEditor.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { PreferredGroup } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionChangeset } from '../../../services/sessions/common/session.js';

export const ISessionChangesService = createDecorator<ISessionChangesService>('sessionChangesService');

/** Options for opening a session Changes editor with an optional changeset selection. */
export interface ISessionChangesEditorOptions extends IMultiDiffEditorOptions {
	readonly changesetSelection?:
	| { readonly kind: 'id'; readonly id: string | undefined }
	| { readonly kind: 'transient'; readonly changeset: ISessionChangeset };
}

/** Owns the identity and presentation state of a session's Changes editor. */
export interface ISessionChangesService {
	readonly _serviceBrand: undefined;
	readonly activeSessionChangeCountObs: IObservable<number>;

	/** Builds the multi-diff source URI that identifies a session's Changes editor. */
	getChangesEditorResource(sessionResource: URI): URI;

	/** Returns the session identified by a Changes editor resource. */
	getSessionResource(editorResource: URI): URI | undefined;

	/** Opens the Changes editor for a session. */
	openChangesEditor(sessionResource: URI, options?: ISessionChangesEditorOptions, group?: PreferredGroup): Promise<IEditorGroup | undefined>;
}
