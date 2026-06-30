/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ISessionChangesService = createDecorator<ISessionChangesService>('sessionChangesService');

/**
 * Owns the identity of a session's **Changes** (multi-file diff) editor. It is
 * the single source of truth for the `changes-multi-diff-source:` resource that
 * the multi-diff editor is opened with, so callers don't have to know the URI
 * shape: the session header action and the Changes view open the editor with
 * {@link getChangesEditorResource}, the layout controller recognizes the active
 * editor as a Changes editor with {@link getSessionResource}, and the
 * multi-diff source resolver uses both.
 */
export interface ISessionChangesService {
	readonly _serviceBrand: undefined;

	/**
	 * Build the multi-diff source URI that identifies the Changes editor for a
	 * session. Opening an editor with this resource shows the session's changes;
	 * reusing the same URI reuses the same editor input while the resource list
	 * updates reactively.
	 */
	getChangesEditorResource(sessionResource: URI): URI;

	/**
	 * If the given editor resource identifies a session Changes editor (one built
	 * by {@link getChangesEditorResource}), return the session it belongs to;
	 * otherwise `undefined`.
	 */
	getSessionResource(editorResource: URI): URI | undefined;
}

const CHANGES_MULTI_DIFF_SOURCE_SCHEME = 'changes-multi-diff-source';

interface IChangesMultiDiffUriFields {
	readonly sessionResource: string;
}

export class SessionChangesService implements ISessionChangesService {

	declare readonly _serviceBrand: undefined;

	getChangesEditorResource(sessionResource: URI): URI {
		return URI.from({
			scheme: CHANGES_MULTI_DIFF_SOURCE_SCHEME,
			query: JSON.stringify({ sessionResource: sessionResource.toString() } satisfies IChangesMultiDiffUriFields),
		});
	}

	getSessionResource(editorResource: URI): URI | undefined {
		if (editorResource.scheme !== CHANGES_MULTI_DIFF_SOURCE_SCHEME) {
			return undefined;
		}

		let fields: IChangesMultiDiffUriFields;
		try {
			fields = JSON.parse(editorResource.query) as IChangesMultiDiffUriFields;
		} catch {
			return undefined;
		}

		if (typeof fields !== 'object' || fields === null || typeof fields.sessionResource !== 'string') {
			return undefined;
		}

		return URI.parse(fields.sessionResource);
	}
}
