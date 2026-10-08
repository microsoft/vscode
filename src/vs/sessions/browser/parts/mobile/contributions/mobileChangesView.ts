/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileOverlayViews.css';
import './mobileDiffColors.js';
import { URI } from '../../../../../base/common/uri.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { IFileDiffViewData } from './mobileDiffView.js';

/**
 * Command id for opening the mobile changes view.
 *
 * Takes no arguments. The view reads the active chat's changes from
 * {@link ISessionsService}. Phone-only.
 */
export const MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID = 'sessions.mobile.openChangesView';

/**
 * Visual change-type for a mobile changes-list row.
 */
type MobileChangeType = 'added' | 'modified' | 'deleted';

/**
 * Normalised view-model for a single row in the mobile changes view. We
 * read the live `ISessionFileChange` observable on every render and reduce
 * each entry into this minimal shape so the row template stays pure DOM.
 */
interface IMobileChangesRow {
	readonly displayUri: URI;
	readonly originalUri: URI | undefined;
	readonly modifiedUri: URI | undefined;
	readonly changeType: MobileChangeType;
	readonly added: number;
	readonly removed: number;
}

export function toRow(change: ISessionFileChange): IMobileChangesRow {
	// `IChatSessionFileChange2` carries `uri` as the canonical identity; the
	// legacy `IChatSessionFileChange` only has `modifiedUri` (required, never
	// absent). We detect v2 by the presence of `uri` (it's a non-optional
	// field on v2 only). Avoiding the import of the type-guard keeps this
	// file inside the `vs/sessions/browser` layering rule — workbench/contrib
	// imports are not allowed here.
	const v2Uri = (change as { uri?: URI }).uri;
	const displayUri: URI = v2Uri ?? (change as { modifiedUri: URI }).modifiedUri;
	const originalUri = change.originalUri;
	const modifiedUri = (change as { modifiedUri?: URI }).modifiedUri;

	const changeType: MobileChangeType = originalUri === undefined
		? 'added'
		: modifiedUri === undefined
			? 'deleted'
			: 'modified';

	return {
		displayUri,
		originalUri,
		modifiedUri,
		changeType,
		added: change.insertions,
		removed: change.deletions,
	};
}

export function rowToDiffData(row: IMobileChangesRow): IFileDiffViewData {
	return {
		originalURI: row.originalUri,
		modifiedURI: row.modifiedUri,
		identical: row.added === 0 && row.removed === 0,
		added: row.added,
		removed: row.removed,
	};
}
