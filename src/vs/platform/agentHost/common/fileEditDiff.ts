/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { isEqual } from '../../../base/common/resources.js';
import type { FileEdit } from './state/protocol/state.js';
import { FileEditKind } from './state/sessionState.js';

/**
 * A {@link FileEdit} decoded into parsed URIs and a resolved {@link FileEditKind}.
 *
 * The create/delete/rename/edit detection and the "primary resource" rule
 * (after-URI for create/edit/rename, before-URI for delete) are subtle and
 * were historically duplicated across several adapters. {@link normalizeFileEdit}
 * centralizes them so every consumer derives the same shape from a protocol
 * {@link FileEdit}.
 */
export interface INormalizedFileEdit {
	/** The kind of file operation. */
	readonly kind: FileEditKind;
	/** Primary file URI: after-URI for create/edit/rename, before-URI for delete. */
	readonly resource: URI;
	/** The before-state file URI, when present (absent for creates). */
	readonly beforeUri?: URI;
	/** The after-state file URI, when present (absent for deletes). */
	readonly afterUri?: URI;
	/** URI from which the before-content can be read (absent for creates). */
	readonly beforeContentUri?: URI;
	/** URI from which the after-content can be read (absent for deletes). */
	readonly afterContentUri?: URI;
}

/**
 * Decodes a protocol {@link FileEdit} into parsed URIs and a resolved
 * {@link FileEditKind}. Returns `undefined` when the edit carries no usable
 * file URI (neither `before` nor `after`).
 */
export function normalizeFileEdit(edit: FileEdit): INormalizedFileEdit | undefined {
	const beforeUri = edit.before ? URI.parse(edit.before.uri) : undefined;
	const afterUri = edit.after ? URI.parse(edit.after.uri) : undefined;

	const resource = afterUri ?? beforeUri;
	if (!resource) {
		return undefined;
	}

	let kind: FileEditKind;
	if (!beforeUri && afterUri) {
		kind = FileEditKind.Create;
	} else if (beforeUri && !afterUri) {
		kind = FileEditKind.Delete;
	} else if (beforeUri && afterUri && !isEqual(beforeUri, afterUri)) {
		kind = FileEditKind.Rename;
	} else {
		kind = FileEditKind.Edit;
	}

	return {
		kind,
		resource,
		beforeUri,
		afterUri,
		beforeContentUri: edit.before?.content.uri ? URI.parse(edit.before.content.uri) : undefined,
		afterContentUri: edit.after?.content.uri ? URI.parse(edit.after.content.uri) : undefined,
	};
}
